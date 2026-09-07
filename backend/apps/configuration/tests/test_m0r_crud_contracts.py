# apps/configuration/tests/test_m0r_crud_contracts.py
"""
M0-R CRUD contract evidence for the Configuration domain.

This module closes Architect Review findings AR-01 and AR-02:

- AR-01: the M0 Configuration contract tests provided no routed retrieve,
  PUT, or PATCH coverage for every repaired resource, and filter tests
  asserted only HTTP 200 without verifying the returned collection was
  actually filtered.
- AR-02: every Configuration `*CreateSerializer` omitted `id`, so a
  successful POST returned no way to reference the created object.

For every Configuration resource (Category, FinancialRecordType,
PaymentMethod, TransactionType, ReportType, NotificationType) this module
verifies, through real routed URLs:

- list returns the expected items (and excludes items that should not
  match a given filter)
- retrieve returns the expected fields for a specific object
- create returns an `id` that can be used to address the created object
- PUT/PATCH persists changes to the database
- at least one filter/search parameter actually narrows the result set,
  not merely returns 200

Archive/restore behavior is explicitly out of scope for M0-R (see
Engineering Log AR-04, C-04); this module does not add coverage for it.
"""
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)


def _make_admin_user(email="m0r-config-admin@example.com"):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="M0R",
        last_name="Admin",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class CategoryCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        Category.objects.create(name="Expenses", is_expense=True, created_by=self.user)
        Category.objects.create(name="Income", is_income=True, created_by=self.user)
        resp = self.client.get("/api/v1/configuration/categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertEqual(names, {"Expenses", "Income"})

    def test_scope_filter_actually_narrows_results(self):
        Category.objects.create(name="ExpenseOnly", is_expense=True, created_by=self.user)
        Category.objects.create(name="IncomeOnly", is_income=True, created_by=self.user)
        resp = self.client.get("/api/v1/configuration/categories/", {"scope": "income"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("IncomeOnly", names)
        self.assertNotIn("ExpenseOnly", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/categories/",
            {
                "name": "Utilities",
                "is_expense": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        category_id = resp.data["id"]

        retrieve_resp = self.client.get(f"/api/v1/configuration/categories/{category_id}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Utilities")

    def test_retrieve_returns_expected_fields(self):
        category = Category.objects.create(
            name="Travel",
            description="Travel expenses",
            is_expense=True,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/categories/{category.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Travel")
        self.assertEqual(resp.data["description"], "Travel expenses")
        self.assertTrue(resp.data["is_expense"])
        self.assertIn("full_path", resp.data)

    def test_patch_persists_change(self):
        category = Category.objects.create(name="Original", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/categories/{category.id}/",
            {
                "name": "Renamed",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        category.refresh_from_db()
        self.assertEqual(category.name, "Renamed")

    def test_put_persists_full_replacement(self):
        category = Category.objects.create(
            name="Original",
            description="Old desc",
            is_expense=True,
            created_by=self.user,
        )
        resp = self.client.put(
            f"/api/v1/configuration/categories/{category.id}/",
            {
                "name": "Replaced",
                "description": "New desc",
                "is_income": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        category.refresh_from_db()
        self.assertEqual(category.name, "Replaced")
        self.assertEqual(category.description, "New desc")
        self.assertTrue(category.is_income)


class FinancialRecordTypeCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        FinancialRecordType.objects.create(name="Purchase Invoice", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/record-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Purchase Invoice", names)

    def test_nature_filter_actually_narrows_results(self):
        FinancialRecordType.objects.create(
            name="Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=self.user,
        )
        FinancialRecordType.objects.create(
            name="Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/record-types/", {"nature": "income"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Sales Invoice", names)
        self.assertNotIn("Fuel Expense", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/record-types/",
            {
                "name": "Credit Note",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client.get(f"/api/v1/configuration/record-types/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Credit Note")

    def test_retrieve_returns_expected_fields(self):
        frt = FinancialRecordType.objects.create(
            name="Debit Note",
            nature=FinancialRecordType.RecordNature.ADJUSTMENT,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/record-types/{frt.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Debit Note")
        self.assertEqual(resp.data["nature"], "adjustment")

    def test_patch_persists_change(self):
        frt = FinancialRecordType.objects.create(name="Original Type", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/record-types/{frt.id}/",
            {
                "requires_approval": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        frt.refresh_from_db()
        self.assertTrue(frt.requires_approval)

    def test_put_persists_full_replacement(self):
        frt = FinancialRecordType.objects.create(name="Original Type 2", created_by=self.user)
        resp = self.client.put(
            f"/api/v1/configuration/record-types/{frt.id}/",
            {
                "name": "Replaced Type",
                "nature": "income",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        frt.refresh_from_db()
        self.assertEqual(frt.name, "Replaced Type")
        self.assertEqual(frt.nature, "income")


class PaymentMethodCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        PaymentMethod.objects.create(name="Cash", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/payment-methods/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Cash", names)

    def test_kind_filter_actually_narrows_results(self):
        PaymentMethod.objects.create(name="Cash Payment", kind="cash", created_by=self.user)
        PaymentMethod.objects.create(
            name="Wire Transfer", kind="bank_transfer", created_by=self.user
        )
        resp = self.client.get("/api/v1/configuration/payment-methods/", {"kind": "cash"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Cash Payment", names)
        self.assertNotIn("Wire Transfer", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/payment-methods/",
            {
                "name": "Cheque",
                "kind": "cheque",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client.get(f"/api/v1/configuration/payment-methods/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Cheque")

    def test_retrieve_returns_expected_fields(self):
        pm = PaymentMethod.objects.create(
            name="Bank Transfer",
            kind="bank_transfer",
            is_electronic=True,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/payment-methods/{pm.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Bank Transfer")
        self.assertTrue(resp.data["is_electronic"])

    def test_patch_persists_change(self):
        pm = PaymentMethod.objects.create(name="Original Method", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/payment-methods/{pm.id}/",
            {
                "is_electronic": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        pm.refresh_from_db()
        self.assertTrue(pm.is_electronic)

    def test_put_persists_full_replacement(self):
        pm = PaymentMethod.objects.create(name="Original Method 2", created_by=self.user)
        resp = self.client.put(
            f"/api/v1/configuration/payment-methods/{pm.id}/",
            {
                "name": "Replaced Method",
                "kind": "card",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        pm.refresh_from_db()
        self.assertEqual(pm.name, "Replaced Method")
        self.assertEqual(pm.kind, "card")


class TransactionTypeCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        TransactionType.objects.create(name="Payment", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/transaction-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Payment", names)

    def test_nature_filter_actually_narrows_results(self):
        TransactionType.objects.create(
            name="Credit Entry",
            nature=TransactionType.TransactionNature.CREDIT,
            created_by=self.user,
        )
        TransactionType.objects.create(
            name="Debit Entry",
            nature=TransactionType.TransactionNature.DEBIT,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/transaction-types/", {"nature": "credit"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Credit Entry", names)
        self.assertNotIn("Debit Entry", names)

    def test_credit_types_action_actually_narrows_results(self):
        TransactionType.objects.create(
            name="Credit Action",
            nature=TransactionType.TransactionNature.CREDIT,
            created_by=self.user,
        )
        TransactionType.objects.create(
            name="Debit Action",
            nature=TransactionType.TransactionNature.DEBIT,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/transaction-types/credit_types/")
        names = {item["name"] for item in resp.data}
        self.assertIn("Credit Action", names)
        self.assertNotIn("Debit Action", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/transaction-types/",
            {
                "name": "Refund",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client.get(
            f"/api/v1/configuration/transaction-types/{resp.data['id']}/"
        )
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Refund")

    def test_retrieve_returns_computed_credit_debit_fields(self):
        tt = TransactionType.objects.create(
            name="Both Type",
            nature=TransactionType.TransactionNature.BOTH,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/transaction-types/{tt.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["is_credit"])
        self.assertTrue(resp.data["is_debit"])

    def test_patch_persists_change(self):
        tt = TransactionType.objects.create(name="Original Trans", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/transaction-types/{tt.id}/",
            {
                "requires_approval": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        tt.refresh_from_db()
        self.assertTrue(tt.requires_approval)

    def test_put_persists_full_replacement(self):
        tt = TransactionType.objects.create(name="Original Trans 2", created_by=self.user)
        resp = self.client.put(
            f"/api/v1/configuration/transaction-types/{tt.id}/",
            {
                "name": "Replaced Trans",
                "nature": "debit",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        tt.refresh_from_db()
        self.assertEqual(tt.name, "Replaced Trans")
        self.assertEqual(tt.nature, "debit")


class ReportTypeCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        ReportType.objects.create(name="Income Statement", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/report-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Income Statement", names)

    def test_frequency_filter_actually_narrows_results(self):
        ReportType.objects.create(
            name="Monthly Report",
            frequency=ReportType.ReportFrequency.MONTHLY,
            created_by=self.user,
        )
        ReportType.objects.create(
            name="Annual Report",
            frequency=ReportType.ReportFrequency.ANNUAL,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/report-types/", {"frequency": "annual"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Annual Report", names)
        self.assertNotIn("Monthly Report", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/report-types/",
            {
                "name": "Balance Sheet",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client.get(f"/api/v1/configuration/report-types/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Balance Sheet")

    def test_retrieve_returns_expected_fields(self):
        rt = ReportType.objects.create(
            name="Cash Flow",
            frequency=ReportType.ReportFrequency.QUARTERLY,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/report-types/{rt.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Cash Flow")
        self.assertEqual(resp.data["frequency"], "quarterly")

    def test_patch_persists_change(self):
        rt = ReportType.objects.create(name="Original Report", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/report-types/{rt.id}/",
            {
                "supports_scheduled": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        rt.refresh_from_db()
        self.assertFalse(rt.supports_scheduled)

    def test_put_persists_full_replacement(self):
        rt = ReportType.objects.create(name="Original Report 2", created_by=self.user)
        resp = self.client.put(
            f"/api/v1/configuration/report-types/{rt.id}/",
            {
                "name": "Replaced Report",
                "frequency": "on_demand",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        rt.refresh_from_db()
        self.assertEqual(rt.name, "Replaced Report")
        self.assertEqual(rt.frequency, "on_demand")


class NotificationTypeCRUDContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        NotificationType.objects.create(name="Payment Received", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/notification-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Payment Received", names)

    def test_priority_filter_actually_narrows_results(self):
        NotificationType.objects.create(
            name="Urgent Alert",
            default_priority=NotificationType.NotificationPriority.URGENT,
            created_by=self.user,
        )
        NotificationType.objects.create(
            name="Normal Alert",
            default_priority=NotificationType.NotificationPriority.NORMAL,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/notification-types/", {"priority": "urgent"})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Urgent Alert", names)
        self.assertNotIn("Normal Alert", names)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client.post(
            "/api/v1/configuration/notification-types/",
            {
                "name": "Report Generated",
                "available_channels": ["in_app"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client.get(
            f"/api/v1/configuration/notification-types/{resp.data['id']}/"
        )
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Report Generated")

    def test_retrieve_returns_expected_fields(self):
        nt = NotificationType.objects.create(
            name="Transfer Completed",
            available_channels=["in_app", "email"],
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/configuration/notification-types/{nt.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Transfer Completed")
        self.assertEqual(resp.data["available_channels"], ["in_app", "email"])

    def test_patch_persists_change(self):
        nt = NotificationType.objects.create(name="Original Notification", created_by=self.user)
        resp = self.client.patch(
            f"/api/v1/configuration/notification-types/{nt.id}/",
            {
                "default_priority": "high",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        nt.refresh_from_db()
        self.assertEqual(nt.default_priority, "high")

    def test_put_persists_full_replacement(self):
        nt = NotificationType.objects.create(name="Original Notification 2", created_by=self.user)
        resp = self.client.put(
            f"/api/v1/configuration/notification-types/{nt.id}/",
            {
                "name": "Replaced Notification",
                "default_priority": "low",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        nt.refresh_from_db()
        self.assertEqual(nt.name, "Replaced Notification")
        self.assertEqual(nt.default_priority, "low")
