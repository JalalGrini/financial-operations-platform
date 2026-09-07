# apps/dashboard/tests/test_api.py
"""API-level tests for the Executive Dashboard.

Covers what only the HTTP layer can break: the permission matrix
(decision ED-8: exactly READ_ROLES), response shape/serialization, and an
N+1 guard proving the endpoints stay O(1) queries as data volume grows -
the exact failure mode found and avoided in `financial_records.selectors.
unbalanced_posted_records` (decision ED-4).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.services import add_line, create_record, post_record

User = get_user_model()

DASHBOARD_URL = "/api/v1/dashboard/"
KPIS_URL = "/api/v1/dashboard/kpis/"
CHARTS_URL = "/api/v1/dashboard/charts/"


class DashboardAPITestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = cls.make_user("dash-api-admin@example.com", "Administrator")
        cls.assistant = cls.make_user("dash-api-assistant@example.com", "Assistant")
        cls.director = cls.make_user("dash-api-director@example.com", "Director")
        cls.norole = cls.make_user("dash-api-norole@example.com", None)

        cls.company = Company.objects.create(name="API Dashboard Co", created_by=cls.admin)
        cls.income_type = FinancialRecordType.objects.create(
            name="API Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=cls.admin,
        )
        cls.expense_type = FinancialRecordType.objects.create(
            name="API Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.admin,
        )

    @classmethod
    def make_user(cls, email, role):
        user = User.objects.create_user(
            email=email, password="testpass123", first_name="Api", last_name="Tester"
        )
        if role:
            group, _created = Group.objects.get_or_create(name=role)
            user.groups.add(group)
        return user

    def make_posted_record(self, *, record_type=None, amount="100.0000", currency="MAD", day=5):
        record = create_record(
            company=self.company,
            record_type=record_type or self.expense_type,
            record_date=date(2026, 1, day),
            description="API fixture",
            user=self.admin,
            currency=currency,
        )
        add_line(record=record, user=self.admin, debit=Decimal(amount), description="Debit")
        add_line(record=record, user=self.admin, credit=Decimal(amount), description="Credit")
        return post_record(record=record, user=self.admin)


class DashboardPermissionMatrixTests(DashboardAPITestBase):
    """decision ED-8: Administrator/Assistant/Director can view; everyone
    else cannot. There is no write action anywhere in this module.
    """

    def test_unauthenticated_is_rejected(self):
        for url in (DASHBOARD_URL, KPIS_URL, CHARTS_URL):
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, url)

    def test_roleless_user_is_forbidden(self):
        self.client.force_authenticate(user=self.norole)
        for url in (DASHBOARD_URL, KPIS_URL, CHARTS_URL):
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, url)

    def test_administrator_assistant_and_director_can_all_view(self):
        for user in (self.admin, self.assistant, self.director):
            self.client.force_authenticate(user=user)
            for url in (DASHBOARD_URL, KPIS_URL, CHARTS_URL):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_200_OK, (user, url))


class DashboardOverviewTests(DashboardAPITestBase):
    def test_overview_shape_on_empty_dataset(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(DASHBOARD_URL, {"company": str(self.company.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["revenue"], {})
        self.assertEqual(response.data["expenses"], {})
        self.assertEqual(response.data["net"], {})
        self.assertEqual(response.data["recent_records"], [])
        self.assertTrue(all(count == 0 for count in response.data["report_status"].values()))

    def test_overview_reflects_posted_records_as_strings(self):
        """Money renders through DecimalField, i.e. as a string - never a
        float that could silently lose precision on the wire.
        """
        self.make_posted_record(record_type=self.income_type, amount="250.5000")
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(DASHBOARD_URL, {"company": str(self.company.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["revenue"]["MAD"], "250.5000")
        self.assertIsInstance(response.data["revenue"]["MAD"], str)
        self.assertEqual(len(response.data["recent_records"]), 1)
        self.assertEqual(response.data["recent_records"][0]["currency"], "MAD")


class DashboardKpisTests(DashboardAPITestBase):
    def test_kpis_shape_and_currency_separation(self):
        self.make_posted_record(record_type=self.income_type, amount="500.0000", currency="MAD")
        self.make_posted_record(record_type=self.income_type, amount="80.0000", currency="EUR")
        self.make_posted_record(record_type=self.expense_type, amount="200.0000", currency="MAD")
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(KPIS_URL, {"company": str(self.company.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["revenue"], {"MAD": "500.0000", "EUR": "80.0000"})
        self.assertEqual(response.data["expenses"], {"MAD": "200.0000"})
        self.assertEqual(response.data["net"]["MAD"], "300.0000")
        self.assertIn("report_status", response.data)


class DashboardChartsTests(DashboardAPITestBase):
    def test_charts_shape_on_empty_dataset(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(CHARTS_URL, {"company": str(self.company.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["monthly_cash_flow"], [])
        self.assertEqual(response.data["company_comparison"], [])
        self.assertEqual(response.data["category_analysis"], [])

    def test_charts_months_query_param(self):
        for month in (1, 2, 3):
            self.make_posted_record(record_type=self.income_type, amount="10.0000", day=1)
            record = create_record(
                company=self.company,
                record_type=self.income_type,
                record_date=date(2026, month, 1),
                description="Monthly fixture",
                user=self.admin,
            )
            add_line(record=record, user=self.admin, debit=Decimal("10.0000"), description="Debit")
            add_line(
                record=record, user=self.admin, credit=Decimal("10.0000"), description="Credit"
            )
            post_record(record=record, user=self.admin)
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(CHARTS_URL, {"company": str(self.company.id), "months": "2"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["monthly_cash_flow"]), 2)


class DashboardQueryCountTests(DashboardAPITestBase):
    """N+1 guard: the whole reason `unbalanced_posted_records()` was kept
    off the dashboard (decision ED-4). Each endpoint's query count must not
    grow as the number of posted records grows.
    """

    def _query_count(self, url, params):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return len(ctx.captured_queries)

    def test_overview_query_count_is_constant(self):
        """Baseline and grown are both seeded non-empty on purpose: an empty
        result set makes Django skip the (unrelated, already-removed)
        `lines` prefetch entirely, which would make this comparison a false
        signal rather than a real one. Comparing two non-empty sizes is what
        actually proves the endpoint is O(1) in the number of records.
        """
        self.client.force_authenticate(user=self.admin)
        params = {"company": str(self.company.id)}
        for day in range(1, 3):
            self.make_posted_record(record_type=self.income_type, amount="10.0000", day=day)
        baseline = self._query_count(DASHBOARD_URL, params)

        for day in range(3, 18):
            self.make_posted_record(record_type=self.income_type, amount="10.0000", day=day)

        grown = self._query_count(DASHBOARD_URL, params)
        self.assertEqual(baseline, grown)

    def test_kpis_query_count_is_constant(self):
        self.client.force_authenticate(user=self.admin)
        params = {"company": str(self.company.id)}
        for day in range(1, 3):
            self.make_posted_record(record_type=self.expense_type, amount="10.0000", day=day)
        baseline = self._query_count(KPIS_URL, params)

        for day in range(3, 18):
            self.make_posted_record(record_type=self.expense_type, amount="10.0000", day=day)

        grown = self._query_count(KPIS_URL, params)
        self.assertEqual(baseline, grown)

    def test_charts_query_count_is_constant(self):
        self.client.force_authenticate(user=self.admin)
        params = {"company": str(self.company.id)}
        for day in range(1, 3):
            self.make_posted_record(record_type=self.income_type, amount="10.0000", day=day)
        baseline = self._query_count(CHARTS_URL, params)

        for day in range(3, 18):
            self.make_posted_record(record_type=self.income_type, amount="10.0000", day=day)

        grown = self._query_count(CHARTS_URL, params)
        self.assertEqual(baseline, grown)
