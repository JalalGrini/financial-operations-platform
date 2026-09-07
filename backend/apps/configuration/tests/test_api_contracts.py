# apps/configuration/tests/test_api_contracts.py
"""
API contract regression tests for the Configuration domain.

These tests characterize EFOP Engineering Log finding C-02: Configuration
serializers and viewsets referenced fields and query paths (e.g.
`Category.category_type`, `Category.is_active`, `FinancialRecordType.template`,
`TransactionType.type`, `TransactionType.is_credit`/`is_debit` as model fields,
`ReportType.is_active`, `NotificationType.channels`/`templates`) that do not
exist on the current models or migrations.

They lock the corrected, model-accurate contract so a future regression
(reintroducing a stale field reference) fails immediately with a clear
serializer/viewset error instead of a mysterious 500 in production.
"""
import unittest

from django.contrib.auth.models import Group
from django.db import connection
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
from apps.configuration.serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    FinancialRecordTypeCreateSerializer,
    FinancialRecordTypeSerializer,
    NotificationTypeCreateSerializer,
    NotificationTypeSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
    ReportTypeCreateSerializer,
    ReportTypeSerializer,
    TransactionTypeCreateSerializer,
    TransactionTypeSerializer,
)

# NotificationType filters use JSONField __contains, which SQLite does not
# support (see Engineering Log M-07: PostgreSQL behavior is not represented
# by the default SQLite test environment). Consistent with the existing
# apps/configuration/tests/test_selectors.py convention.
SKIP_JSON_CONTAINS = connection.vendor == "sqlite"


def _make_admin_user():
    user = User.objects.create_user(
        email="config-admin@example.com",
        password="testpass123",
        first_name="Config",
        last_name="Admin",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class SerializerInstantiationTests(APITestCase):
    """Every Configuration serializer must construct against a real model instance."""

    def setUp(self):
        self.user = _make_admin_user()

    def test_category_serializer_instantiates(self):
        category = Category.objects.create(name="Expenses", created_by=self.user)
        data = CategorySerializer(category).data
        self.assertEqual(data["name"], "Expenses")
        self.assertIn("full_path", data)
        self.assertIn("is_income", data)
        self.assertIn("is_expense", data)
        self.assertIn("is_transfer", data)
        self.assertIn("status", data)
        # Stale fields must not resurface
        for stale in ["category_type", "is_active"]:
            self.assertNotIn(stale, data)

    def test_category_create_serializer_valid(self):
        serializer = CategoryCreateSerializer(
            data={
                "name": "Travel",
                "is_expense": True,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_financial_record_type_serializer_instantiates(self):
        frt = FinancialRecordType.objects.create(name="Purchase Invoice", created_by=self.user)
        data = FinancialRecordTypeSerializer(frt).data
        self.assertEqual(data["name"], "Purchase Invoice")
        self.assertIn("nature", data)
        self.assertIn("default_category", data)
        for stale in ["category", "template", "record_type", "is_active"]:
            self.assertNotIn(stale, data)

    def test_financial_record_type_create_serializer_valid(self):
        serializer = FinancialRecordTypeCreateSerializer(data={"name": "Sales Invoice"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_payment_method_serializer_instantiates(self):
        pm = PaymentMethod.objects.create(name="Cash", created_by=self.user)
        data = PaymentMethodSerializer(pm).data
        self.assertEqual(data["name"], "Cash")
        self.assertIn("kind", data)
        self.assertIn("is_electronic", data)
        self.assertNotIn("is_active", data)

    def test_payment_method_create_serializer_valid(self):
        serializer = PaymentMethodCreateSerializer(data={"name": "Cheque", "kind": "cheque"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_transaction_type_serializer_instantiates(self):
        tt = TransactionType.objects.create(
            name="Payment", nature=TransactionType.TransactionNature.CREDIT, created_by=self.user
        )
        data = TransactionTypeSerializer(tt).data
        self.assertEqual(data["name"], "Payment")
        self.assertTrue(data["is_credit"])
        self.assertFalse(data["is_debit"])
        self.assertIn("nature", data)
        for stale in ["type", "is_active"]:
            self.assertNotIn(stale, data)

    def test_transaction_type_create_serializer_valid(self):
        serializer = TransactionTypeCreateSerializer(
            data={
                "name": "Refund",
                "nature": "debit",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_report_type_serializer_instantiates(self):
        rt = ReportType.objects.create(name="Income Statement", created_by=self.user)
        data = ReportTypeSerializer(rt).data
        self.assertEqual(data["name"], "Income Statement")
        self.assertIn("frequency", data)
        self.assertNotIn("is_active", data)

    def test_report_type_create_serializer_valid(self):
        serializer = ReportTypeCreateSerializer(data={"name": "Balance Sheet"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_notification_type_serializer_instantiates(self):
        nt = NotificationType.objects.create(
            name="Payment Received",
            default_channels=["in_app"],
            available_channels=["in_app", "email"],
            created_by=self.user,
        )
        data = NotificationTypeSerializer(nt).data
        self.assertEqual(data["name"], "Payment Received")
        self.assertEqual(data["available_channels"], ["in_app", "email"])
        for stale in ["channels", "templates", "is_active"]:
            self.assertNotIn(stale, data)

    def test_notification_type_create_serializer_valid(self):
        serializer = NotificationTypeCreateSerializer(
            data={
                "name": "Report Generated",
                "available_channels": ["in_app"],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class RoutedEndpointSmokeTests(APITestCase):
    """Representative list/retrieve/create/filter smoke tests via real routes."""

    def setUp(self):
        self.client = APIClient()
        self.user = _make_admin_user()
        self.client.force_authenticate(user=self.user)

    def test_categories_list_and_search(self):
        Category.objects.create(name="Expenses", is_expense=True, created_by=self.user)
        Category.objects.create(name="Income", is_income=True, created_by=self.user)

        resp = self.client.get("/api/v1/configuration/categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/categories/", {"search": "Expenses"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/categories/", {"scope": "income"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_categories_create(self):
        resp = self.client.post(
            "/api/v1/configuration/categories/",
            {
                "name": "Utilities",
                "is_expense": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_categories_archive(self):
        category = Category.objects.create(name="ToArchive", created_by=self.user)
        resp = self.client.post(f"/api/v1/configuration/categories/{category.id}/archive/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        category.refresh_from_db()
        self.assertTrue(category.is_archived)

        # NOTE: restoring is not exercised here. The `restore` action calls
        # get_object(), which resolves through the ViewSet's default
        # queryset (`is_archived=False`), so it can never find an already
        # archived record. This is EFOP Engineering Log finding C-04
        # ("restore actions use active-only querysets and cannot retrieve
        # the archived object they are intended to restore"), which is
        # explicitly deferred to milestone M3 and out of scope for M0.

    def test_record_types_list_and_filter(self):
        FinancialRecordType.objects.create(
            name="Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/record-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/record-types/", {"nature": "expense"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_payment_methods_list_and_actions(self):
        PaymentMethod.objects.create(
            name="Bank Transfer",
            is_electronic=True,
            requires_bank_details=True,
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/payment-methods/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/payment-methods/electronic/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/payment-methods/requiring_bank_details/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_transaction_types_list_and_actions(self):
        TransactionType.objects.create(
            name="Payment", nature=TransactionType.TransactionNature.CREDIT, created_by=self.user
        )
        resp = self.client.get("/api/v1/configuration/transaction-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/transaction-types/credit_types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/transaction-types/debit_types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_report_types_list_and_actions(self):
        ReportType.objects.create(name="Income Statement", created_by=self.user)
        resp = self.client.get("/api/v1/configuration/report-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get("/api/v1/configuration/report-types/schedulable/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_notification_types_list(self):
        NotificationType.objects.create(
            name="Payment Received",
            available_channels=["in_app", "email"],
            default_recipient_roles=["Administrator"],
            created_by=self.user,
        )
        resp = self.client.get("/api/v1/configuration/notification-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    @unittest.skipIf(SKIP_JSON_CONTAINS, "JSONField __contains is unsupported on SQLite")
    def test_notification_types_by_channel_and_role(self):
        NotificationType.objects.create(
            name="Payment Received",
            available_channels=["in_app", "email"],
            default_recipient_roles=["Administrator"],
            created_by=self.user,
        )
        resp = self.client.get(
            "/api/v1/configuration/notification-types/by_channel/", {"channel": "email"}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.get(
            "/api/v1/configuration/notification-types/for_role/", {"role": "Administrator"}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
