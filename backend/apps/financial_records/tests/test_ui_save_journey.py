"""End-to-end save journey, calling exactly the endpoints the UI calls.

Reported as "when I try to edit one or do a new one I don't think there is a way
to save everything". The individual steps were already covered elsewhere, but
nothing walked the whole path the Financial Records screens actually drive, so
there was no single test that would fail if the journey broke between steps.

Endpoint/payload shapes mirror frontend/src/features/financial-records/api:
  create        POST   /financial-records/records/
  save header   PATCH  /financial-records/records/{id}/
  add line      POST   /financial-records/records/{id}/lines/
  post          POST   /financial-records/records/{id}/post_to_ledger/
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.companies.models import Company
from apps.configuration.models import Category, FinancialRecordType

RECORDS = "/api/v1/financial-records/records/"


class FinancialRecordSaveJourneyTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="journey@example.com",
            password="StrongPass123!",
            first_name="Jo",
            last_name="Urney",
        )
        Group.objects.get_or_create(name="Administrator")[0].user_set.add(self.user)
        self.client.force_authenticate(self.user)

        self.company = Company.objects.create(
            name="Journey SARL",
            registration_number="RC-JOURNEY",
            tax_id="IF-JOURNEY",
            address="Rabat",
            phone="0500000001",
            email="journey@example.invalid",
        )
        self.record_type = FinancialRecordType.objects.create(
            name="Journey Invoice",
            created_by=self.user,
        )
        self.category = Category.objects.create(name="Journey Category", is_expense=True)

    def _create_draft(self):
        """The payload the create panel builds in financial-records/page.tsx."""
        response = self.client.post(
            RECORDS,
            {
                "company": str(self.company.pk),
                "record_type": str(self.record_type.pk),
                "template": None,
                "category": None,
                "client": None,
                "supplier": None,
                "record_date": date(2026, 3, 15).isoformat(),
                "description": "Draft created from the create panel",
                "notes": "",
                "currency": "MAD",
                "custom_fields": {},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_a_draft_can_be_created_from_the_create_panel(self):
        record_id = self._create_draft()
        detail = self.client.get(f"{RECORDS}{record_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["status"], "draft")
        self.assertTrue(detail.data["is_editable"])

    def test_the_header_editor_can_save_its_changes(self):
        """'Save header' -> PATCH. This is the panel the user could not reach."""
        record_id = self._create_draft()

        response = self.client.patch(
            f"{RECORDS}{record_id}/",
            {
                "record_date": date(2026, 4, 1).isoformat(),
                "description": "Edited through the header editor",
                "notes": "Header note",
                "currency": "EUR",
                "category": str(self.category.pk),
                "client": None,
                "supplier": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["description"], "Edited through the header editor")
        self.assertEqual(response.data["currency"], "EUR")
        self.assertEqual(response.data["notes"], "Header note")

    def test_lines_can_be_added_and_then_the_record_posts(self):
        record_id = self._create_draft()

        # Shape produced by buildFinancialRecordLineInput: both keys present,
        # the unused side sent as "0". Worth pinning - the API refuses a line
        # unless exactly one side is positive, so a builder that emitted two
        # positives (or none) would break every line save.
        debit = self.client.post(
            f"{RECORDS}{record_id}/lines/",
            {"description": "Debit leg", "category": None, "debit": "250.0000", "credit": "0"},
            format="json",
        )
        self.assertEqual(debit.status_code, 201, debit.data)

        credit = self.client.post(
            f"{RECORDS}{record_id}/lines/",
            {"description": "Credit leg", "category": None, "debit": "0", "credit": "250.0000"},
            format="json",
        )
        self.assertEqual(credit.status_code, 201, credit.data)

        detail = self.client.get(f"{RECORDS}{record_id}/")
        self.assertEqual(Decimal(str(detail.data["balance"])), Decimal("0"))
        self.assertTrue(detail.data["can_post"], detail.data.get("post_blockers"))

        posted = self.client.post(f"{RECORDS}{record_id}/post_to_ledger/", {}, format="json")
        self.assertEqual(posted.status_code, 200, posted.data)
        self.assertEqual(posted.data["status"], "posted")

    def test_the_whole_journey_end_to_end(self):
        """Create -> save header -> add balanced lines -> post, in one pass."""
        record_id = self._create_draft()

        self.assertEqual(
            self.client.patch(
                f"{RECORDS}{record_id}/",
                {"description": "Full journey", "record_date": date(2026, 5, 2).isoformat()},
                format="json",
            ).status_code,
            200,
        )
        for payload in (
            {"description": "D", "category": None, "debit": "80.0000", "credit": "0"},
            {"description": "C", "category": None, "debit": "0", "credit": "80.0000"},
        ):
            self.assertEqual(
                self.client.post(
                    f"{RECORDS}{record_id}/lines/", payload, format="json"
                ).status_code,
                201,
            )

        posted = self.client.post(f"{RECORDS}{record_id}/post_to_ledger/", {}, format="json")

        self.assertEqual(posted.status_code, 200, posted.data)
        self.assertEqual(posted.data["status"], "posted")
        self.assertEqual(posted.data["description"], "Full journey")
        # Posting locks the record, which is what makes the earlier save steps
        # the only chance to get the header right.
        self.assertFalse(posted.data["is_editable"])
