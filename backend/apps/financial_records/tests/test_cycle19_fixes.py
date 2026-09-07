# apps/financial_records/tests/test_cycle19_fixes.py
"""Regression tests for the Cycle 19 fix (state/IMPLEMENTATION_PLAN.md
Section 13): E-1, a posted financial record could be both archived and
permanently purged, taking its balanced ledger lines with it.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.models import FinancialRecord, FinancialRecordLine
from apps.financial_records.services import add_line, cancel_record, create_record, post_record

User = get_user_model()
D = Decimal

RECORDS_URL = "/api/v1/financial-records/records/"


class Cycle19FinancialRecordsTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c19-fr-admin@example.com",
            password="testpass123",
            first_name="Cycle19",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)
        cls.company = Company.objects.create(name="C19 FR Co", created_by=cls.admin)
        cls.record_type = FinancialRecordType.objects.create(
            name="C19 FR Invoice", created_by=cls.admin
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def make_posted_record(self, amount="100.0000"):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Cycle 19 posted invoice",
            user=self.admin,
        )
        add_line(record=record, user=self.admin, debit=D(amount))
        add_line(record=record, user=self.admin, credit=D(amount))
        return post_record(record=record, user=self.admin)


class PostedRecordCannotBeArchivedOrPurgedTests(Cycle19FinancialRecordsTestBase):
    def test_destroy_now_refuses_a_posted_record(self):
        """Before this fix, archive_record() had no status guard and this
        returned 204 with is_archived=True."""
        record = self.make_posted_record()
        response = self.client.delete(f"{RECORDS_URL}{record.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        record.refresh_from_db()
        self.assertFalse(record.is_archived)

    def test_permanent_delete_refuses_a_posted_record(self):
        """Before this fix, this returned 204 and deleted the record together
        with its two balanced lines via the CASCADE FK."""
        record = self.make_posted_record()
        record_id = record.id
        lines_before = FinancialRecordLine.objects.filter(record_id=record_id).count()
        self.assertEqual(lines_before, 2)

        response = self.client.delete(
            f"{RECORDS_URL}{record_id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(FinancialRecord.all_objects.filter(pk=record_id).exists())
        self.assertEqual(FinancialRecordLine.objects.filter(record_id=record_id).count(), 2)

    def test_permanent_delete_refuses_a_cancelled_record_too(self):
        """A cancelled record may still be archived for tidying (unlike
        POSTED), but purging it would erase the correction's own audit
        trail, so purge is refused for CANCELLED as well."""
        record = self.make_posted_record()
        record = cancel_record(record=record, user=self.admin, reason="Wrong invoice")

        archive_response = self.client.delete(f"{RECORDS_URL}{record.id}/")
        self.assertEqual(archive_response.status_code, status.HTTP_204_NO_CONTENT)

        purge_response = self.client.delete(
            f"{RECORDS_URL}{record.id}/permanent/", {"confirm": True}, format="json"
        )
        self.assertEqual(purge_response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(FinancialRecord.all_objects.filter(pk=record.id).exists())

    def test_permanent_delete_still_allows_a_draft_record(self):
        """Sanity check: the new guard must not over-refuse. A DRAFT record
        (never posted) is still purgeable."""
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Still a draft",
            user=self.admin,
        )

        response = self.client.delete(
            f"{RECORDS_URL}{record.id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FinancialRecord.all_objects.filter(pk=record.id).exists())
