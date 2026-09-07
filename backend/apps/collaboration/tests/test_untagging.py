from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.collaboration.models import Mention, Notification
from apps.companies.models import Company


class UntaggingSecurityTests(APITestCase):
    def setUp(self):
        groups = {
            name: Group.objects.create(name=name)
            for name in ("Administrator", "Assistant", "Director")
        }
        self.admin = User.objects.create_user(
            email="admin@example.test", first_name="Admin", last_name="User", password="Pass123456!"
        )
        self.admin.groups.add(groups["Administrator"])
        self.creator = User.objects.create_user(
            email="creator@example.test",
            first_name="Creator",
            last_name="User",
            password="Pass123456!",
        )
        self.creator.groups.add(groups["Assistant"])
        self.recipient = User.objects.create_user(
            email="recipient@example.test",
            first_name="Recipient",
            last_name="User",
            password="Pass123456!",
        )
        self.recipient.groups.add(groups["Director"])
        self.other = User.objects.create_user(
            email="other@example.test", first_name="Other", last_name="User", password="Pass123456!"
        )
        self.other.groups.add(groups["Assistant"])
        self.company = Company.objects.create(
            name="Test Company", created_by=self.creator, updated_by=self.creator
        )

    def _create(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/collaboration/mentions/",
            {
                "resource_type": "companies.company",
                "target_id": str(self.company.pk),
                "tagged_user": str(self.recipient.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_creator_can_untag_and_history_remains(self):
        mention_id = self._create()
        response = self.client.post(
            f"/api/v1/collaboration/mentions/{mention_id}/untag/", {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(Mention.objects.get(pk=mention_id).resolved_at)
        self.assertTrue(Notification.objects.filter(metadata__mention_id=str(mention_id)).exists())

    def test_unrelated_user_denied_and_admin_override_allowed(self):
        mention_id = self._create()
        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.post(
                f"/api/v1/collaboration/mentions/{mention_id}/untag/", {}, format="json"
            ).status_code,
            404,
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(
                f"/api/v1/collaboration/mentions/{mention_id}/untag/", {}, format="json"
            ).status_code,
            200,
        )

    def test_duplicate_and_archived_target_rejected(self):
        self._create()
        self.client.force_authenticate(self.creator)
        payload = {
            "resource_type": "companies.company",
            "target_id": str(self.company.pk),
            "tagged_user": str(self.recipient.pk),
        }
        self.assertEqual(
            self.client.post("/api/v1/collaboration/mentions/", payload, format="json").status_code,
            400,
        )
        self.company.archive(self.creator)
        payload["tagged_user"] = str(self.other.pk)
        self.assertEqual(
            self.client.post("/api/v1/collaboration/mentions/", payload, format="json").status_code,
            400,
        )
