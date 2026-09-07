# apps/reports/tests/test_signals.py
"""Invalidation signal tests (decision R-5, blueprint Section 12).

The rule: editing a Financial Record that backs a Current Official report
must flip that report to Outdated automatically, through a signal, not only
when a caller remembers to call a service. `reports_with_outdated_sources`
(selectors.py) is the read-only backstop for whatever this signal still
misses; these tests exercise the signal path itself.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, ReportType
from apps.financial_records.services import add_line, create_record, post_record
from apps.reports.models import ReportLifecycleStatus
from apps.reports.selectors import reports_with_outdated_sources
from apps.reports.services import approve, generate, submit_for_review

User = get_user_model()


class ReportInvalidationSignalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="reports-sig@example.com",
            password="testpass123",
            first_name="Rep",
            last_name="Sig",
        )
        cls.company = Company.objects.create(name="Reports Signal Co", created_by=cls.user)
        cls.report_type = ReportType.objects.create(name="Cash Flow", created_by=cls.user)
        cls.record_type = FinancialRecordType.objects.create(
            name="Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.user,
        )

    def make_posted_record(self, amount="100.0000"):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 1, 5),
            description="Fuel",
            user=self.user,
        )
        add_line(record=record, user=self.user, debit=Decimal(amount), description="Expense")
        add_line(record=record, user=self.user, credit=Decimal(amount), description="Payable")
        return post_record(record=record, user=self.user)

    def make_current_official_report(self, record):
        values = [
            {
                "key": "fuel_expense.2026.01",
                "label": "January Fuel",
                "amount": record.total_amount,
                "period_label": "2026-01",
                "source_record_ids": [record.id],
            }
        ]
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=values,
            user=self.user,
            mode="manual",
            calculation_mode="keep_missing",
        )
        version = submit_for_review(version=version, user=self.user)
        return approve(version=version, user=self.user, approved=True)

    def test_editing_a_source_record_marks_the_current_official_report_outdated(self):
        record = self.make_posted_record()
        version = self.make_current_official_report(record)
        report = version.report
        self.assertEqual(report.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

        # Any save on the record - here, archiving it - must invalidate the
        # report through the post_save signal, without any explicit call
        # from this test into apps.reports.services.
        record.is_archived = True
        record.save()

        report.refresh_from_db()
        self.assertEqual(report.status, ReportLifecycleStatus.OUTDATED)

    def test_creating_a_brand_new_unrelated_record_does_not_touch_existing_reports(self):
        record = self.make_posted_record()
        version = self.make_current_official_report(record)
        report = version.report

        self.make_posted_record(amount="50.0000")

        report.refresh_from_db()
        self.assertEqual(report.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

    def test_editing_a_record_that_backs_no_report_does_not_error(self):
        """A Financial Record with no ReportValueSource rows at all is the
        common case; the signal must be a cheap no-op for it, not raise."""
        untracked = self.make_posted_record()
        untracked.is_archived = True
        untracked.save()  # Must not raise.

    def test_the_drift_selector_finds_nothing_once_the_signal_has_already_flipped_status(self):
        """reports_with_outdated_sources is the backstop for signal gaps; once
        the signal itself has done its job, the report is no longer Current
        Official and should not additionally appear in the drift report."""
        record = self.make_posted_record()
        version = self.make_current_official_report(record)
        record.is_archived = True
        record.save()

        drifted = reports_with_outdated_sources()
        drifted_report_ids = [r.id for r, _v, _ids in drifted]
        self.assertNotIn(version.report_id, drifted_report_ids)
