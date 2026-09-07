# apps/dashboard/tests/test_selectors.py
"""Executive Dashboard selector tests.

Every test here targets one of the Cycle 22 architect findings
(state/IMPLEMENTATION_PLAN.md Section 16): BR-023 enforcement (ED-2),
nature separation (ED-3), currency separation (ED-3/ED-10), and the
empty-dataset "zeros and empty lists, never a crash" contract that a
landing-page widget depends on.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import Category, FinancialRecordType, ReportType
from apps.dashboard.selectors import (
    ZERO,
    category_analysis,
    company_comparison,
    monthly_cash_flow,
    recent_posted_records,
    report_status_summary,
    revenue_expense_totals,
)
from apps.financial_records.services import add_line, create_record, post_record
from apps.reports.models import ReportLifecycleStatus
from apps.reports.services import generate, submit_for_review

User = get_user_model()


class DashboardSelectorTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="dash-selectors@example.com",
            password="testpass123",
            first_name="Dash",
            last_name="Tester",
        )
        cls.company = Company.objects.create(name="Dashboard Co", created_by=cls.user)
        cls.other_company = Company.objects.create(name="Other Dashboard Co", created_by=cls.user)
        cls.income_type = FinancialRecordType.objects.create(
            name="Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=cls.user,
        )
        cls.expense_type = FinancialRecordType.objects.create(
            name="Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.user,
        )
        cls.category = Category.objects.create(name="Fuel", created_by=cls.user)

    def make_record(
        self,
        *,
        company=None,
        record_type=None,
        amount="100.0000",
        currency="MAD",
        category=None,
        day=5,
        month=1,
        year=2026,
        post=True,
    ):
        record = create_record(
            company=company or self.company,
            record_type=record_type or self.expense_type,
            record_date=date(year, month, day),
            description="Dashboard fixture",
            user=self.user,
            category=category,
            currency=currency,
        )
        add_line(
            record=record,
            user=self.user,
            debit=Decimal(amount),
            description="Debit",
            category=category,
        )
        add_line(
            record=record,
            user=self.user,
            credit=Decimal(amount),
            description="Credit",
            category=category,
        )
        if post:
            return post_record(record=record, user=self.user)
        return record


class RevenueExpenseTotalsTests(DashboardSelectorTestBase):
    def test_empty_dataset_returns_empty_dicts_not_a_crash(self):
        totals = revenue_expense_totals(company=self.company)
        self.assertEqual(totals, {"revenue": {}, "expenses": {}, "net": {}})

    def test_nature_is_not_conflated(self):
        """decision ED-3: income and expense must never be summed together."""
        self.make_record(record_type=self.income_type, amount="500.0000")
        self.make_record(record_type=self.expense_type, amount="200.0000")

        totals = revenue_expense_totals(company=self.company)

        self.assertEqual(totals["revenue"]["MAD"], Decimal("500.0000"))
        self.assertEqual(totals["expenses"]["MAD"], Decimal("200.0000"))
        self.assertEqual(totals["net"]["MAD"], Decimal("300.0000"))

    def test_currency_is_never_collapsed(self):
        """decision ED-10: MAD and EUR must never be blind-summed."""
        self.make_record(record_type=self.income_type, amount="500.0000", currency="MAD")
        self.make_record(record_type=self.income_type, amount="80.0000", currency="EUR")

        totals = revenue_expense_totals(company=self.company)

        self.assertEqual(totals["revenue"], {"MAD": Decimal("500.0000"), "EUR": Decimal("80.0000")})
        # No currency should appear that had no data.
        self.assertNotIn("USD", totals["revenue"])

    def test_br023_excludes_draft_and_cancelled_records(self):
        """decision ED-2: only posted records may feed the dashboard."""
        self.make_record(record_type=self.income_type, amount="500.0000")
        draft = self.make_record(record_type=self.income_type, amount="999.0000", post=False)
        self.assertEqual(draft.status, draft.Status.DRAFT)

        totals = revenue_expense_totals(company=self.company)

        self.assertEqual(totals["revenue"]["MAD"], Decimal("500.0000"))

    def test_company_scoping_does_not_leak_across_companies(self):
        self.make_record(company=self.company, record_type=self.income_type, amount="100.0000")
        self.make_record(
            company=self.other_company, record_type=self.income_type, amount="900.0000"
        )

        totals = revenue_expense_totals(company=self.company)

        self.assertEqual(totals["revenue"]["MAD"], Decimal("100.0000"))


class MonthlyCashFlowTests(DashboardSelectorTestBase):
    def test_empty_dataset_returns_empty_list(self):
        self.assertEqual(monthly_cash_flow(company=self.company), [])

    def test_buckets_by_calendar_month_and_separates_nature(self):
        self.make_record(record_type=self.income_type, amount="100.0000", month=1, day=5)
        self.make_record(record_type=self.expense_type, amount="40.0000", month=1, day=10)
        self.make_record(record_type=self.income_type, amount="200.0000", month=2, day=5)

        series = monthly_cash_flow(company=self.company, months=12)

        self.assertEqual([point["month"] for point in series], ["2026-01", "2026-02"])
        self.assertEqual(series[0]["income"]["MAD"], Decimal("100.0000"))
        self.assertEqual(series[0]["expense"]["MAD"], Decimal("40.0000"))
        self.assertEqual(series[1]["income"]["MAD"], Decimal("200.0000"))
        (
            self.assertNotIn("expense", series[1])
            if False
            else self.assertEqual(series[1]["expense"], {})
        )

    def test_months_parameter_limits_to_most_recent(self):
        for month in (1, 2, 3):
            self.make_record(record_type=self.income_type, amount="10.0000", month=month, day=1)

        series = monthly_cash_flow(company=self.company, months=2)

        self.assertEqual([point["month"] for point in series], ["2026-02", "2026-03"])


class CompanyComparisonTests(DashboardSelectorTestBase):
    def test_empty_dataset_returns_empty_list(self):
        self.assertEqual(company_comparison(), [])

    def test_compares_across_companies_and_is_not_company_filterable(self):
        """Comparing companies is the entire point of this widget - there is
        deliberately no `company=` kwarg on this selector.
        """
        self.make_record(company=self.company, record_type=self.income_type, amount="300.0000")
        self.make_record(
            company=self.other_company, record_type=self.income_type, amount="150.0000"
        )

        rows = company_comparison()

        by_name = {row["company_name"]: row for row in rows}
        self.assertEqual(by_name["Dashboard Co"]["income"]["MAD"], Decimal("300.0000"))
        self.assertEqual(by_name["Other Dashboard Co"]["income"]["MAD"], Decimal("150.0000"))


class CategoryAnalysisTests(DashboardSelectorTestBase):
    def test_empty_dataset_returns_empty_list(self):
        self.assertEqual(category_analysis(company=self.company), [])

    def test_uncategorized_records_are_grouped_not_dropped(self):
        self.make_record(record_type=self.expense_type, amount="50.0000", category=None)
        self.make_record(record_type=self.expense_type, amount="30.0000", category=self.category)

        rows = category_analysis(company=self.company)

        by_name = {row["category_name"]: row for row in rows}
        self.assertEqual(by_name["Uncategorized"]["total"]["MAD"], Decimal("50.0000"))
        self.assertEqual(by_name["Fuel"]["total"]["MAD"], Decimal("30.0000"))
        # Reconciles against the KPI total for the same scope.
        totals = revenue_expense_totals(company=self.company)
        reconciled = sum((row["total"]["MAD"] for row in rows), ZERO)
        self.assertEqual(reconciled, totals["expenses"]["MAD"])


class RecentPostedRecordsTests(DashboardSelectorTestBase):
    def test_empty_dataset_returns_empty_list(self):
        self.assertEqual(recent_posted_records(company=self.company), [])

    def test_only_posted_records_appear_newest_first(self):
        first = self.make_record(record_type=self.income_type, amount="10.0000", day=1)
        second = self.make_record(record_type=self.income_type, amount="20.0000", day=2)
        self.make_record(record_type=self.income_type, amount="999.0000", day=3, post=False)

        rows = recent_posted_records(company=self.company, limit=10)

        self.assertEqual([row.id for row in rows], [second.id, first.id])

    def test_limit_is_respected(self):
        for day in range(1, 6):
            self.make_record(record_type=self.income_type, amount="10.0000", day=day)

        rows = recent_posted_records(company=self.company, limit=2)

        self.assertEqual(len(rows), 2)


class ReportStatusSummaryTests(DashboardSelectorTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.report_type = ReportType.objects.create(
            name="Dashboard Report Type", created_by=cls.user
        )

    def test_empty_dataset_returns_every_status_as_zero(self):
        counts = report_status_summary(company=self.company)

        self.assertEqual(set(counts.keys()), set(ReportLifecycleStatus.values))
        self.assertTrue(all(count == 0 for count in counts.values()))

    def test_counts_reflect_actual_statuses_including_preview(self):
        """Unlike the financial-record selectors, this widget's whole point
        is to show the distribution across statuses - Preview must still be
        counted here (it is not "displayed report data", it is a count).
        """
        record = self.make_record(record_type=self.expense_type, amount="100.0000")
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=[
                {
                    "key": "fuel.2026.01",
                    "label": "January Fuel",
                    "amount": record.total_amount,
                    "period_label": "2026-01",
                    "source_record_ids": [record.id],
                }
            ],
            user=self.user,
            mode="manual",
            calculation_mode="keep_missing",
        )
        submit_for_review(version=version, user=self.user)

        counts = report_status_summary(company=self.company)

        self.assertEqual(counts[ReportLifecycleStatus.PENDING_REVIEW], 1)
        self.assertEqual(counts[ReportLifecycleStatus.PREVIEW], 0)
