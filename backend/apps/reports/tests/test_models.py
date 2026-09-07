# apps/reports/tests/test_models.py
"""Model-level invariants for the Reports Engine.

The rule being pinned here is decision R-4 (Cycle 21 architect pass,
state/IMPLEMENTATION_PLAN.md Section 15.4): only one Current Official report
may exist per (company, report_type, period), and that must be true even if
some future code path bypasses apps.reports.services entirely and writes to
the model directly - so this is tested at the database layer, not just
through the service.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import ReportType
from apps.reports.models import (
    GeneratedReport,
    ReportLifecycleStatus,
    ReportValue,
    ReportVersion,
)

User = get_user_model()


class ReportsModelTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="reports-model@example.com",
            password="testpass123",
            first_name="Rep",
            last_name="Orts",
        )
        cls.company = Company.objects.create(name="Reports Model Co", created_by=cls.user)
        cls.report_type = ReportType.objects.create(name="Income Statement", created_by=cls.user)

    def make_report(
        self,
        status=ReportLifecycleStatus.PREVIEW,
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
    ):
        return GeneratedReport.objects.create(
            company=self.company,
            report_type=self.report_type,
            period_start=period_start,
            period_end=period_end,
            period_label="2026-01",
            status=status,
            created_by=self.user,
        )


class CurrentOfficialUniquenessConstraintTests(ReportsModelTestBase):
    """R-4: the database, not just the service, refuses a second Current
    Official report for the same company/type/period."""

    def test_a_single_current_official_report_is_allowed(self):
        report = self.make_report(status=ReportLifecycleStatus.CURRENT_OFFICIAL)
        self.assertEqual(report.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

    def test_a_second_current_official_for_the_same_period_is_refused_by_the_database(self):
        self.make_report(status=ReportLifecycleStatus.CURRENT_OFFICIAL)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GeneratedReport.objects.create(
                    company=self.company,
                    report_type=self.report_type,
                    period_start=date(2026, 1, 1),
                    period_end=date(2026, 1, 31),
                    period_label="2026-01 (duplicate)",
                    status=ReportLifecycleStatus.CURRENT_OFFICIAL,
                    created_by=self.user,
                )

    def test_two_outdated_reports_for_the_same_period_are_allowed(self):
        """The constraint targets Current Official specifically; Outdated
        history for the same period is allowed to accumulate (each
        superseded report keeps its own row, per blueprint Section 9)."""
        self.make_report(status=ReportLifecycleStatus.OUTDATED)
        second = GeneratedReport.objects.create(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            status=ReportLifecycleStatus.OUTDATED,
            created_by=self.user,
        )
        self.assertEqual(second.status, ReportLifecycleStatus.OUTDATED)

    def test_a_current_official_for_a_different_period_is_allowed(self):
        self.make_report(
            status=ReportLifecycleStatus.CURRENT_OFFICIAL,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
        )
        other_period = GeneratedReport.objects.create(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
            period_label="2026-02",
            status=ReportLifecycleStatus.CURRENT_OFFICIAL,
            created_by=self.user,
        )
        self.assertEqual(other_period.status, ReportLifecycleStatus.CURRENT_OFFICIAL)

    def test_an_archived_current_official_does_not_block_a_new_one(self):
        """The partial index condition excludes is_archived=True rows, so an
        archived Current Official (a historical artifact, not the live
        record) cannot block a fresh official report for the same period."""
        stale = self.make_report(status=ReportLifecycleStatus.CURRENT_OFFICIAL)
        stale.is_archived = True
        stale.save(update_fields=["is_archived"])
        fresh = GeneratedReport.objects.create(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            status=ReportLifecycleStatus.CURRENT_OFFICIAL,
            created_by=self.user,
        )
        self.assertEqual(fresh.status, ReportLifecycleStatus.CURRENT_OFFICIAL)


class ReportReferenceTests(ReportsModelTestBase):
    def test_a_report_gets_a_readable_reference(self):
        report = self.make_report()
        self.assertTrue(report.reference.startswith("RPG-2026-"))

    def test_references_do_not_collide(self):
        first = self.make_report(period_start=date(2026, 1, 1), period_end=date(2026, 1, 31))
        second = self.make_report(period_start=date(2026, 2, 1), period_end=date(2026, 2, 28))
        self.assertNotEqual(first.reference, second.reference)


class ReportVersionInvariantTests(ReportsModelTestBase):
    def make_version(self, report, version_number=1, status=ReportLifecycleStatus.PREVIEW):
        return ReportVersion.objects.create(
            report=report,
            version_number=version_number,
            status=status,
            created_by=self.user,
        )

    def test_version_numbers_are_unique_within_a_report(self):
        report = self.make_report()
        self.make_version(report, version_number=1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_version(report, version_number=1)

    def test_the_same_version_number_is_allowed_across_different_reports(self):
        report_one = self.make_report(period_start=date(2026, 1, 1), period_end=date(2026, 1, 31))
        report_two = self.make_report(period_start=date(2026, 2, 1), period_end=date(2026, 2, 28))
        self.make_version(report_one, version_number=1)
        # Must not raise: version_number uniqueness is scoped to `report`.
        self.make_version(report_two, version_number=1)

    def test_preview_and_pending_review_versions_are_editable(self):
        report = self.make_report()
        preview = self.make_version(report, status=ReportLifecycleStatus.PREVIEW)
        pending = self.make_version(
            report, version_number=2, status=ReportLifecycleStatus.PENDING_REVIEW
        )
        self.assertTrue(preview.is_editable)
        self.assertTrue(pending.is_editable)

    def test_approved_current_official_and_outdated_versions_are_not_editable(self):
        report = self.make_report()
        for i, locked_status in enumerate(
            (
                ReportLifecycleStatus.APPROVED,
                ReportLifecycleStatus.CURRENT_OFFICIAL,
                ReportLifecycleStatus.OUTDATED,
            ),
            start=1,
        ):
            version = self.make_version(report, version_number=i, status=locked_status)
            self.assertFalse(version.is_editable, f"{locked_status} must not be editable")


class ReportValueTests(ReportsModelTestBase):
    def test_a_report_value_defaults_to_zero_not_none(self):
        report = self.make_report()
        version = ReportVersion.objects.create(
            report=report, version_number=1, created_by=self.user
        )
        value = ReportValue.objects.create(
            version=version, key="total", label="Total", created_by=self.user
        )
        self.assertEqual(value.amount, Decimal("0.0000"))

    def test_a_value_tree_links_parent_to_children(self):
        report = self.make_report()
        version = ReportVersion.objects.create(
            report=report, version_number=1, created_by=self.user
        )
        parent = ReportValue.objects.create(
            version=version,
            key="fuel_expense.2026",
            label="Annual Fuel Expense",
            amount=Decimal("1200.0000"),
            created_by=self.user,
        )
        child = ReportValue.objects.create(
            version=version,
            key="fuel_expense.2026.01",
            label="January Total",
            amount=Decimal("100.0000"),
            parent=parent,
            created_by=self.user,
        )
        self.assertEqual(child.parent_id, parent.id)
        self.assertIn(child, parent.children.all())
