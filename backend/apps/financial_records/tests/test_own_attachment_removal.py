"""The one exception to "only an Administrator deletes".

An Assistant may remove an attachment **they uploaded themselves**. Everything
else about DELETE stays Administrator-only, because that split is what gives the
soft-delete policy its teeth.

These tests drive the real HTTP endpoint, because the whole point is the status
code a client receives, and the ownership narrowing lives in the view (the action
is detail=True on the *record* viewset, so has_object_permission is handed the
record, never the attachment).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from datetime import date

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.models import Attachment
from apps.financial_records.services import create_record

User = get_user_model()


def make_user(email, role):
    user = User.objects.create_user(
        email=email, password="testpass123", first_name="A", last_name="B"
    )
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    return user


class OwnAttachmentRemovalTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user("attach-admin@example.invalid", "Administrator")
        cls.assistant = make_user("attach-asst@example.invalid", "Assistant")
        cls.other_assistant = make_user("attach-asst2@example.invalid", "Assistant")
        cls.director = make_user("attach-dir@example.invalid", "Director")
        cls.company = Company.objects.create(
            name="Attachment Co", created_by=cls.admin, updated_by=cls.admin
        )
        cls.record_type = FinancialRecordType.objects.create(
            name="Attachment Test Invoice", created_by=cls.admin
        )

    def setUp(self):
        # Built through the service rather than the manager: `record_date`,
        # `record_type` and the reference are all required, and the service is
        # what the API itself uses.
        self.record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Attachment fixture",
            user=self.admin,
        )

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def attachment_for(self, owner):
        return Attachment.objects.create(
            record=self.record,
            file_key=f"financial-records/{self.record.pk}/{owner.pk}.pdf",
            file_name="proof.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            created_by=owner,
            updated_by=owner,
        )

    def url(self, attachment):
        return (
            f"/api/v1/financial-records/records/{self.record.pk}"
            f"/attachments/{attachment.pk}/"
        )

    # -- the point of the change --------------------------------------------

    def test_an_assistant_can_remove_their_own_attachment(self):
        attachment = self.attachment_for(self.assistant)
        response = self.as_user(self.assistant).delete(self.url(attachment))
        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
            "An Assistant must be able to take back a file they attached.",
        )
        attachment.refresh_from_db()
        # remove_attachment archives rather than purging, so the exception stays
        # reversible and auditable.
        self.assertTrue(attachment.is_archived)

    def test_an_assistant_cannot_remove_someone_elses_attachment(self):
        attachment = self.attachment_for(self.other_assistant)
        response = self.as_user(self.assistant).delete(self.url(attachment))
        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            "The exception is ownership-scoped; it is not a general delete right.",
        )
        attachment.refresh_from_db()
        self.assertFalse(attachment.is_archived)

    # -- everything else is unchanged ---------------------------------------

    def test_an_administrator_can_remove_any_attachment(self):
        attachment = self.attachment_for(self.assistant)
        response = self.as_user(self.admin).delete(self.url(attachment))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_a_director_cannot_remove_an_attachment(self):
        attachment = self.attachment_for(self.director)
        response = self.as_user(self.director).delete(self.url(attachment))
        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            "A Director is read-only; owning the upload does not change that.",
        )

    def test_an_anonymous_caller_is_refused(self):
        attachment = self.attachment_for(self.assistant)
        response = APIClient().delete(self.url(attachment))
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_the_delete_role_split_is_still_administrator_only(self):
        """Vacuity guard: the shared matrix must not have been widened.

        If someone "fixes" this by adding Assistant to DELETE_ROLES, every test
        above still passes while the exception silently becomes a general right.
        """
        from apps.common.permissions import RoleBasedAccessPermission

        self.assertEqual(RoleBasedAccessPermission.DELETE_ROLES, ("Administrator",))
