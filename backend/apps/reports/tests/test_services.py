# apps/reports/tests/test_services.py
"""Reports Engine service-layer lifecycle tests.

Covers the full path from generation through review to the one-current-
official invariant (blueprint Sections 5, 7, 8, 9, 12), and the generation-
only-from-posted-records rule (blueprint Section 1/7, decision R-1).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, ReportType
from apps.financial_records.services import add_line, create_record, post_record
from apps.reports.models import GeneratedReport, ReportLifecycleStatus, ReportValueSource
from apps.reports.services import approve, generate, mark_outdated, regenerate, submit_for_review

User = get_user_model()


class ReportsServiceTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="reports-svc@example.com",
            password="testpass123",
            first_name="Rep",
            last_name="Svc",
        )
        cls.company = Company.objects.create(name="Reports Service Co", created_by=cls.user)
        cls.report_type = ReportType.objects.create(name="Expense Report", created_by=cls.user)
        cls.record_type = FinancialRecordType.objects.create(
            name="Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.user,
        )

    def make_posted_record(self, amount="100.0000", day=5):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 1, day),
            description="Fuel",
            user=self.user,
        )
        add_line(record=record, user=self.user, debit=Decimal(amount), description="Expense")
        add_line(record=record, user=self.user, credit=Decimal(amount), description="Payable")
        return post_record(record=record, user=self.user)

    def make_draft_record(self, amount="100.0000", day=5):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 1, day),
            description="Fuel (unposted)",
            user=self.user,
        )
        add_line(record=record, user=self.user, debit=Decimal(amount), description="Expense")
        add_line(record=record, user=self.user, credit=Decimal(amount), description="Payable")
        return record

    def generate_report(self, records, **overrides):
        values = [
            {
                "key": "fuel_expense.2026.01",
                "label": "January Fuel",
                "amount": sum((r.total_amount for r in records), Decimal("0.0000")),
                "period_label": "2026-01",
                "source_record_ids": [r.id for r in records],
            }
        ]
        kwargs = {
            "company": self.company,
            "report_type": self.report_type,
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 1, 31),
            "period_label": "2026-01",
            "values": values,
            "user": self.user,
            "mode": "manual",
            "calculation_mode": "keep_missing",
        }
        kwargs.update(overrides)
        return generate(**kwargs)


class GenerationOnlyFromPostedRecordsTests(ReportsServiceTestBase):
    """Decision R-1 / blueprint Section 1/7."""

    def test_generation_succeeds_from_posted_records(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        self.assertEqual(version.version_number, 1)
        self.assertEqual(version.status, ReportLifecycleStatus.PREVIEW)

    def test_generation_is_refused_when_a_source_record_is_still_a_draft(self):
        draft = self.make_draft_record()
        with self.assertRaises(ValidationError):
            self.generate_report([draft])

    def test_a_traceability_edge_is_recorded_for_every_source_record(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        value = version.values.get(key="fuel_expense.2026.01")
        self.assertTrue(
            ReportValueSource.objects.filter(value=value, financial_record=posted).exists()
        )


class VersionNumberingTests(ReportsServiceTestBase):
    def test_the_first_generation_is_version_one(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        self.assertEqual(version.version_number, 1)

    def test_regenerating_without_a_reason_is_refused(self):
        posted = self.make_posted_record()
        self.generate_report([posted])
        with self.assertRaises(ValidationError):
            self.generate_report([posted], regeneration_reason="")

    def test_regenerating_with_a_reason_creates_a_new_version_not_an_overwrite(self):
        posted = self.make_posted_record()
        first = self.generate_report([posted])
        second = self.generate_report([posted], regeneration_reason="Correcting a category error.")
        self.assertEqual(second.version_number, 2)
        # The append-only rule (blueprint Section 9): the first version row
        # must still exist unmodified, not be overwritten in place.
        first.refresh_from_db()
        self.assertEqual(first.version_number, 1)

    def test_the_regenerate_wrapper_forces_a_reason(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        report = version.report
        with self.assertRaises(ValidationError):
            regenerate(
                report=report,
                reason="",
                user=self.user,
                values=[],
                mode="manual",
                calculation_mode="keep_missing",
            )


class ReviewWorkflowTests(ReportsServiceTestBase):
    def make_pending_version(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        return submit_for_review(version=version, user=self.user)

    def test_submitting_a_preview_moves_it_to_pending_review(self):
        version = self.make_pending_version()
        self.assertEqual(version.status, ReportLifecycleStatus.PENDING_REVIEW)
        version.report.refresh_from_db()
        self.assertEqual(version.report.status, ReportLifecycleStatus.PENDING_REVIEW)

    def test_submitting_a_non_preview_version_is_refused(self):
        version = self.make_pending_version()
        with self.assertRaises(ValidationError):
            submit_for_review(version=version, user=self.user)

    def test_approving_promotes_to_current_official(self):
        version = self.make_pending_version()
        approved = approve(version=version, user=self.user, approved=True)
        self.assertEqual(approved.status, ReportLifecycleStatus.CURRENT_OFFICIAL)
        approved.report.refresh_from_db()
        self.assertEqual(approved.report.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

    def test_approving_a_version_not_pending_review_is_refused(self):
        posted = self.make_posted_record()
        preview_version = self.generate_report([posted])
        with self.assertRaises(ValidationError):
            approve(version=preview_version, user=self.user, approved=True)

    def test_rejecting_requires_notes(self):
        version = self.make_pending_version()
        with self.assertRaises(ValidationError):
            approve(version=version, user=self.user, approved=False, notes="")

    def test_rejecting_returns_the_version_to_preview_not_discarding_it(self):
        version = self.make_pending_version()
        rejected = approve(
            version=version,
            user=self.user,
            approved=False,
            notes="Numbers look off, please recheck.",
        )
        self.assertEqual(rejected.status, ReportLifecycleStatus.PREVIEW)
        # Audit trail preserved, not deleted.
        self.assertTrue(GeneratedReport.objects.filter(pk=rejected.report_id).exists())

    def test_approving_a_new_version_demotes_the_prior_current_official_to_outdated(self):
        """R-4's invariant enforced end-to-end through the service, not just
        the database constraint: at no point should two Current Official
        versions for the same report exist."""
        first_posted = self.make_posted_record(day=5)
        first_version = self.generate_report([first_posted])
        first_version = submit_for_review(version=first_version, user=self.user)
        first_version = approve(version=first_version, user=self.user, approved=True)

        second_posted = self.make_posted_record(day=6)
        second_version = self.generate_report(
            [first_posted, second_posted], regeneration_reason="Adding a missed record."
        )
        second_version = submit_for_review(version=second_version, user=self.user)
        second_version = approve(version=second_version, user=self.user, approved=True)

        first_version.refresh_from_db()
        self.assertEqual(first_version.status, ReportLifecycleStatus.OUTDATED)
        self.assertEqual(second_version.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

        report = second_version.report
        report.refresh_from_db()
        self.assertEqual(report.status, ReportLifecycleStatus.CURRENT_OFFICIAL)
        self.assertEqual(report.current_version_id, second_version.id)


class MarkOutdatedTests(ReportsServiceTestBase):
    def test_mark_outdated_flips_a_current_official_report_and_records_a_reason(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        version = submit_for_review(version=version, user=self.user)
        version = approve(version=version, user=self.user, approved=True)
        report = version.report

        mark_outdated(reports=[report], reason="Source record changed.")

        report.refresh_from_db()
        version.refresh_from_db()
        self.assertEqual(report.status, ReportLifecycleStatus.OUTDATED)
        self.assertEqual(version.outdated_reason, "Source record changed.")
        self.assertIsNotNone(version.outdated_at)

    def test_mark_outdated_is_a_no_op_for_a_report_that_is_not_current_official(self):
        posted = self.make_posted_record()
        version = self.generate_report([posted])
        report = version.report
        self.assertEqual(report.status, ReportLifecycleStatus.PREVIEW)

        updated = mark_outdated(reports=[report], reason="Should not apply.")

        self.assertEqual(updated, [])
        report.refresh_from_db()
        self.assertEqual(report.status, ReportLifecycleStatus.PREVIEW)
