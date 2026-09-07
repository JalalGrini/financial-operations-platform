# apps/financial_records/tests/test_api.py
"""
API-level tests for financial records.

The model-level invariants are already covered in test_double_entry.py. What
matters here is different: that the HTTP layer cannot be used to go around
them, and that a refused business rule comes back as a 400 the client can act
on rather than a 500.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.extensibility.models import CustomFieldDefinition
from apps.financial_records.models import FinancialRecord
from apps.financial_records.services import add_line, create_record, post_record

User = get_user_model()

RECORDS_URL = "/api/v1/financial-records/records/"


class FinancialRecordAPITestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = cls.make_user("fr-api-admin@example.com", "Administrator")
        cls.assistant = cls.make_user("fr-api-assistant@example.com", "Assistant")
        cls.director = cls.make_user("fr-api-director@example.com", "Director")
        cls.norole = cls.make_user("fr-api-norole@example.com", None)

        cls.company = Company.objects.create(name="API Ledger Co", created_by=cls.admin)
        cls.record_type = FinancialRecordType.objects.create(
            name="API Purchase Invoice", created_by=cls.admin
        )

    @classmethod
    def make_user(cls, email, role):
        user = User.objects.create_user(
            email=email,
            password="testpass123",
            first_name="Api",
            last_name="Tester",
        )
        if role:
            group, _created = Group.objects.get_or_create(name=role)
            user.groups.add(group)
        return user

    def payload(self, **overrides):
        data = {
            "company": str(self.company.id),
            "record_type": str(self.record_type.id),
            "record_date": "2026-08-06",
            "description": "API created invoice",
        }
        data.update(overrides)
        return data

    def make_draft(self, user=None):
        return create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Fixture draft",
            user=user or self.admin,
        )

    def make_balanced_draft(self, amount="100.0000"):
        record = self.make_draft()
        add_line(record=record, user=self.admin, debit=Decimal(amount))
        add_line(record=record, user=self.admin, credit=Decimal(amount))
        return record


class AuthorizationTests(FinancialRecordAPITestBase):
    """Roles are the only authorization boundary in this platform."""

    def test_anonymous_callers_are_refused(self):
        response = self.client.get(RECORDS_URL)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_an_authenticated_user_with_no_role_is_refused(self):
        self.client.force_authenticate(self.norole)
        response = self.client.get(RECORDS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_all_three_roles_can_read(self):
        for user in (self.admin, self.assistant, self.director):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.get(RECORDS_URL)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_a_director_cannot_create(self):
        """Directors read the books; they do not write them."""
        self.client.force_authenticate(self.director)
        response = self.client.post(RECORDS_URL, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_assistant_can_create_but_not_delete(self):
        self.client.force_authenticate(self.assistant)
        created = self.client.post(RECORDS_URL, self.payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        response = self.client.delete(f"{RECORDS_URL}{created.data['id']}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_an_administrator_can_delete(self):
        record = self.make_draft()
        self.client.force_authenticate(self.admin)
        response = self.client.delete(f"{RECORDS_URL}{record.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class RecordLifecycleTests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_created_record_is_always_a_draft(self):
        """Status is not client-settable; records enter the world as drafts."""
        response = self.client.post(RECORDS_URL, self.payload(status="posted"), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], FinancialRecord.Status.DRAFT)

    def test_a_created_record_gets_a_reference(self):
        response = self.client.post(RECORDS_URL, self.payload(), format="json")
        self.assertTrue(response.data["reference"].startswith("FRC-"))

    def test_lines_can_be_added_and_are_numbered_by_the_server(self):
        record = self.make_draft()
        first = self.client.post(
            f"{RECORDS_URL}{record.id}/lines/",
            {"debit": "250.0000", "description": "Goods"},
            format="json",
        )
        second = self.client.post(
            f"{RECORDS_URL}{record.id}/lines/",
            {"credit": "250.0000", "description": "Payable"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["line_number"], 1)
        self.assertEqual(second.data["line_number"], 2)

    def test_a_line_cannot_carry_both_a_debit_and_a_credit(self):
        record = self.make_draft()
        response = self.client.post(
            f"{RECORDS_URL}{record.id}/lines/",
            {"debit": "100.0000", "credit": "100.0000"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_line_must_carry_something(self):
        record = self.make_draft()
        response = self.client.post(f"{RECORDS_URL}{record.id}/lines/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_balanced_draft_can_be_posted(self):
        record = self.make_balanced_draft("400.0000")
        response = self.client.post(f"{RECORDS_URL}{record.id}/post_to_ledger/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], FinancialRecord.Status.POSTED)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("400.0000"))

    def test_an_unbalanced_draft_is_refused_with_400_not_500(self):
        """A refused business rule must be actionable by the client."""
        record = self.make_draft()
        add_line(record=record, user=self.admin, debit=Decimal("100.0000"))
        add_line(record=record, user=self.admin, credit=Decimal("99.0000"))

        response = self.client.post(f"{RECORDS_URL}{record.id}/post_to_ledger/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_empty_draft_cannot_be_posted(self):
        record = self.make_draft()
        response = self.client.post(f"{RECORDS_URL}{record.id}/post_to_ledger/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_posted_record_cannot_be_edited_through_the_api(self):
        """The immutability rule must hold at the HTTP boundary too."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.admin)

        response = self.client.patch(
            f"{RECORDS_URL}{record.id}/",
            {"description": "Rewriting history"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        record.refresh_from_db()
        self.assertNotEqual(record.description, "Rewriting history")

    def test_a_draft_can_be_edited(self):
        record = self.make_draft()
        response = self.client.patch(
            f"{RECORDS_URL}{record.id}/",
            {"description": "Corrected description"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "Corrected description")

    def test_cancelling_requires_a_reason(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.admin)

        response = self.client.post(f"{RECORDS_URL}{record.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelling_records_the_reason(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.admin)

        response = self.client.post(
            f"{RECORDS_URL}{record.id}/cancel/",
            {"reason": "Duplicate of FRC-2026-00002"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], FinancialRecord.Status.CANCELLED)
        self.assertEqual(response.data["cancellation_reason"], "Duplicate of FRC-2026-00002")

    def test_delete_archives_rather_than_destroys(self):
        """Financial history is never destroyed."""
        record = self.make_draft()
        response = self.client.delete(f"{RECORDS_URL}{record.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            FinancialRecord.all_objects.filter(pk=record.pk).exists(),
            "The row must still exist after a DELETE.",
        )
        self.assertTrue(FinancialRecord.all_objects.get(pk=record.pk).is_archived)

    def test_the_detail_view_reports_the_live_balance(self):
        record = self.make_balanced_draft("75.0000")
        response = self.client.get(f"{RECORDS_URL}{record.id}/")

        self.assertEqual(Decimal(response.data["balance"]), Decimal("0"))
        self.assertEqual(len(response.data["lines"]), 2)

    def test_money_is_never_serialised_as_a_float(self):
        """A float in the JSON would mean precision was already lost."""
        record = self.make_balanced_draft("1234.5678")
        post_record(record=record, user=self.admin)

        response = self.client.get(f"{RECORDS_URL}{record.id}/")
        self.assertIsInstance(response.data["total_amount"], str)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("1234.5678"))


class FilteringTests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_records_can_be_filtered_by_status(self):
        self.make_draft()
        posted = self.make_balanced_draft()
        post_record(record=posted, user=self.admin)

        response = self.client.get(f"{RECORDS_URL}?status=posted")
        results = response.data["results"] if "results" in response.data else response.data
        self.assertTrue(all(item["status"] == "posted" for item in results))
        self.assertGreaterEqual(len(results), 1)

    def test_records_can_be_searched_by_description(self):
        create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Distinctive fuel purchase",
            user=self.admin,
        )
        response = self.client.get(f"{RECORDS_URL}?search=Distinctive")
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(len(results), 1)

    def test_archived_records_are_hidden_by_default(self):
        record = self.make_draft()
        self.client.delete(f"{RECORDS_URL}{record.id}/")

        response = self.client.get(RECORDS_URL)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertNotIn(str(record.id), [item["id"] for item in results])


class CustomFieldAPITests(FinancialRecordAPITestBase):
    """The Cycle 11 extensibility work, exercised through HTTP."""

    def setUp(self):
        self.client.force_authenticate(self.admin)
        CustomFieldDefinition.objects.create(
            entity="financial_records.FinancialRecord",
            key="purchase_order",
            label="Purchase order",
            created_by=self.admin,
        )

    def test_custom_fields_can_be_set_at_creation(self):
        response = self.client.post(
            RECORDS_URL,
            self.payload(custom_fields={"purchase_order": "PO-9001"}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["custom_fields"]["purchase_order"], "PO-9001")

    def test_an_undefined_custom_field_is_refused(self):
        """A typo must fail loudly, not write an attribute nobody reads."""
        response = self.client.post(
            RECORDS_URL,
            self.payload(custom_fields={"purchse_order": "PO-9001"}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_custom_fields_can_be_updated_on_a_draft(self):
        record = self.make_draft()
        response = self.client.patch(
            f"{RECORDS_URL}{record.id}/",
            {"custom_fields": {"purchase_order": "PO-9002"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_fields"]["purchase_order"], "PO-9002")

    def test_the_definitions_endpoint_describes_admin_added_attributes(self):
        """The frontend needs to render fields that did not exist when it shipped."""
        response = self.client.get(
            f"{RECORDS_URL}custom-field-definitions/?record_type={self.record_type.id}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        keys = [item["key"] for item in response.data["definitions"]]
        self.assertIn("purchase_order", keys)

    def test_the_definitions_endpoint_still_requires_a_role(self):
        self.client.force_authenticate(self.norole)
        response = self.client.get(
            f"{RECORDS_URL}custom-field-definitions/?record_type={self.record_type.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AttachmentAPITests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_document_can_be_registered(self):
        record = self.make_draft()
        response = self.client.post(
            f"{RECORDS_URL}{record.id}/attachments/",
            {"file_key": "s3://bucket/inv-1.pdf", "file_name": "inv-1.pdf"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_documents_may_be_attached_to_posted_records(self):
        """Paperwork arrives late; refusing it would push people to edit history."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.admin)

        response = self.client.post(
            f"{RECORDS_URL}{record.id}/attachments/",
            {"file_key": "s3://bucket/late.pdf", "file_name": "late.pdf"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
