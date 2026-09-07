"""Behavioural regression test for the Cycle 24 fix (F-1):
GeneratedReport.generate_reference used count() + 1 against the active-only
manager, so archiving any generated report caused the next create to collide
with the UNIQUE constraint on `reference`.

See state/IMPLEMENTATION_PLAN.md Section 18 for the full defect list and fix.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import ReportType
from apps.reports.models import GeneratedReport, ReportLifecycleStatus

User = get_user_model()


class Cycle24GeneratedReportReferenceAfterArchiveTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="c24-report@example.com",
            password="testpass123",
            first_name="Cycle24",
            last_name="Report",
        )
        cls.company = Company.objects.create(name="Cycle24 Report Co", created_by=cls.user)
        cls.report_type = ReportType.objects.create(name="Cycle24 Report Type", created_by=cls.user)

    def _make_report(self, period_label, status=ReportLifecycleStatus.PREVIEW):
        return GeneratedReport.objects.create(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label=period_label,
            status=status,
            created_by=self.user,
        )

    def test_create_after_archiving_the_only_report_does_not_collide(self):
        first = self._make_report("2026-01-A")
        first.is_archived = True
        first.save(update_fields=["is_archived"])

        with transaction.atomic():
            second = self._make_report("2026-01-B")

        self.assertNotEqual(second.reference, first.reference)
        self.assertEqual(GeneratedReport.all_objects.filter(reference=second.reference).count(), 1)
