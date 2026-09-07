# apps/configuration/tests/test_selectors.py
"""
Tests for Configuration domain selectors.
"""
import unittest

from django.db import connection
from django.test import TestCase

from apps.accounts.models import User
from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)
from apps.configuration.selectors import (
    CategorySelector,
    FinancialRecordTypeSelector,
    NotificationTypeSelector,
    PaymentMethodSelector,
    ReportTypeSelector,
    TransactionTypeSelector,
)

# Skip tests that use JSONField __contains on SQLite
SKIP_JSON_CONTAINS = connection.vendor == "sqlite"


class CategorySelectorTests(TestCase):
    """Tests for CategorySelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_root(self):
        """Test getting root categories."""
        root1 = Category.objects.create(name="Root 1", created_by=self.user)
        Category.objects.create(name="Root 2", created_by=self.user)
        Category.objects.create(name="Child", parent=root1, created_by=self.user)

        roots = CategorySelector.get_root()
        self.assertEqual(roots.count(), 2)

    def test_get_children(self):
        """Test getting child categories."""
        parent = Category.objects.create(name="Parent", created_by=self.user)
        Category.objects.create(name="Child 1", parent=parent, created_by=self.user)
        Category.objects.create(name="Child 2", parent=parent, created_by=self.user)

        children = CategorySelector.get_children(parent.id)
        self.assertEqual(children.count(), 2)

    def test_get_descendants(self):
        """Test getting all descendants."""
        root = Category.objects.create(name="Root", created_by=self.user)
        child1 = Category.objects.create(name="Child 1", parent=root, created_by=self.user)
        Category.objects.create(name="Child 2", parent=root, created_by=self.user)
        Category.objects.create(name="Grandchild", parent=child1, created_by=self.user)

        descendants = CategorySelector.get_descendants(root.id)
        self.assertEqual(descendants.count(), 3)

    def test_get_income(self):
        """Test getting income categories."""
        Category.objects.create(name="Income 1", is_income=True, created_by=self.user)
        Category.objects.create(name="Expense 1", is_expense=True, created_by=self.user)

        income = CategorySelector.get_income()
        self.assertEqual(income.count(), 1)

    def test_get_expense(self):
        """Test getting expense categories."""
        Category.objects.create(name="Income 1", is_income=True, created_by=self.user)
        Category.objects.create(name="Expense 1", is_expense=True, created_by=self.user)

        expense = CategorySelector.get_expense()
        self.assertEqual(expense.count(), 1)

    def test_search(self):
        """Test search functionality."""
        Category.objects.create(name="Travel Expenses", created_by=self.user)
        Category.objects.create(name="Office Supplies", created_by=self.user)

        results = CategorySelector.search("Travel")
        self.assertEqual(results.count(), 1)


class FinancialRecordTypeSelectorTests(TestCase):
    """Tests for FinancialRecordTypeSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_income(self):
        """Test getting income record types."""
        FinancialRecordType.objects.create(
            name="Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=self.user,
        )
        FinancialRecordType.objects.create(
            name="Purchase Invoice",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=self.user,
        )

        income = FinancialRecordTypeSelector.get_income()
        self.assertEqual(income.count(), 1)

    def test_get_expense(self):
        """Test getting expense record types."""
        FinancialRecordType.objects.create(
            name="Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=self.user,
        )
        FinancialRecordType.objects.create(
            name="Purchase Invoice",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=self.user,
        )

        expense = FinancialRecordTypeSelector.get_expense()
        self.assertEqual(expense.count(), 1)

    def test_get_requires_validation(self):
        """Test getting record types requiring validation."""
        FinancialRecordType.objects.create(
            name="Validated",
            requires_validation=True,
            created_by=self.user,
        )
        FinancialRecordType.objects.create(
            name="Not Validated",
            requires_validation=False,
            created_by=self.user,
        )

        validated = FinancialRecordTypeSelector.get_requires_validation()
        self.assertEqual(validated.count(), 1)

    def test_search(self):
        """Test search functionality."""
        FinancialRecordType.objects.create(name="Purchase Invoice", created_by=self.user)
        FinancialRecordType.objects.create(name="Sales Invoice", created_by=self.user)

        results = FinancialRecordTypeSelector.search("Purchase")
        self.assertEqual(results.count(), 1)


class PaymentMethodSelectorTests(TestCase):
    """Tests for PaymentMethodSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_by_kind(self):
        """Test getting payment methods by kind."""
        PaymentMethod.objects.create(
            name="Bank Transfer", kind=PaymentMethod.MethodKind.BANK_TRANSFER, created_by=self.user
        )
        PaymentMethod.objects.create(
            name="Cheque", kind=PaymentMethod.MethodKind.CHEQUE, created_by=self.user
        )

        bank_transfers = PaymentMethodSelector.get_by_kind(PaymentMethod.MethodKind.BANK_TRANSFER)
        self.assertEqual(bank_transfers.count(), 1)

    def test_get_electronic(self):
        """Test getting electronic payment methods."""
        PaymentMethod.objects.create(name="Bank Transfer", is_electronic=True, created_by=self.user)
        PaymentMethod.objects.create(name="Cheque", is_electronic=False, created_by=self.user)

        electronic = PaymentMethodSelector.get_electronic()
        self.assertEqual(electronic.count(), 1)

    def test_get_requiring_bank_details(self):
        """Test getting methods requiring bank details."""
        PaymentMethod.objects.create(
            name="Bank Transfer", requires_bank_details=True, created_by=self.user
        )
        PaymentMethod.objects.create(name="Cash", requires_bank_details=False, created_by=self.user)

        with_bank = PaymentMethodSelector.get_requiring_bank_details()
        self.assertEqual(with_bank.count(), 1)

    def test_get_with_extra_fields(self):
        """Test getting methods with extra fields."""
        PaymentMethod.objects.create(
            name="Cheque",
            extra_fields={"cheque_number": {"type": "string", "required": True}},
            created_by=self.user,
        )
        PaymentMethod.objects.create(name="Cash", created_by=self.user)

        with_fields = PaymentMethodSelector.get_with_extra_fields()
        self.assertEqual(with_fields.count(), 1)


class TransactionTypeSelectorTests(TestCase):
    """Tests for TransactionTypeSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_credit_types(self):
        """Test getting credit transaction types."""
        TransactionType.objects.create(
            name="Credit", nature=TransactionType.TransactionNature.CREDIT, created_by=self.user
        )
        TransactionType.objects.create(
            name="Debit", nature=TransactionType.TransactionNature.DEBIT, created_by=self.user
        )

        credits = TransactionTypeSelector.get_credit_types()
        self.assertEqual(credits.count(), 1)

    def test_get_transfer_types(self):
        """Test getting transfer types."""
        TransactionType.objects.create(name="Transfer", is_transfer=True, created_by=self.user)
        TransactionType.objects.create(name="Payment", is_transfer=False, created_by=self.user)

        transfers = TransactionTypeSelector.get_transfer_types()
        self.assertEqual(transfers.count(), 1)

    def test_get_system_types(self):
        """Test getting system types."""
        TransactionType.objects.create(name="System", is_system=True, created_by=self.user)
        TransactionType.objects.create(name="Regular", is_system=False, created_by=self.user)

        system = TransactionTypeSelector.get_system_types()
        self.assertEqual(system.count(), 1)


class ReportTypeSelectorTests(TestCase):
    """Tests for ReportTypeSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_schedulable(self):
        """Test getting schedulable report types."""
        ReportType.objects.create(
            name="Monthly Report",
            frequency=ReportType.ReportFrequency.MONTHLY,
            supports_scheduled=True,
            created_by=self.user,
        )
        ReportType.objects.create(
            name="On Demand",
            frequency=ReportType.ReportFrequency.ON_DEMAND,
            supports_scheduled=False,
            created_by=self.user,
        )

        schedulable = ReportTypeSelector.get_schedulable()
        self.assertEqual(schedulable.count(), 1)

    def test_get_by_frequency(self):
        """Test getting report types by frequency."""
        ReportType.objects.create(
            name="Monthly", frequency=ReportType.ReportFrequency.MONTHLY, created_by=self.user
        )
        ReportType.objects.create(
            name="Quarterly", frequency=ReportType.ReportFrequency.QUARTERLY, created_by=self.user
        )

        monthly = ReportTypeSelector.get_by_frequency(ReportType.ReportFrequency.MONTHLY)
        self.assertEqual(monthly.count(), 1)


class NotificationTypeSelectorTests(TestCase):
    """Tests for NotificationTypeSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_by_priority(self):
        """Test getting notification types by priority."""
        NotificationType.objects.create(
            name="Urgent",
            default_priority=NotificationType.NotificationPriority.URGENT,
            created_by=self.user,
        )
        NotificationType.objects.create(
            name="Normal",
            default_priority=NotificationType.NotificationPriority.NORMAL,
            created_by=self.user,
        )

        urgent = NotificationTypeSelector.get_by_priority(
            NotificationType.NotificationPriority.URGENT
        )
        self.assertEqual(urgent.count(), 1)

    @unittest.skipIf(SKIP_JSON_CONTAINS, "JSONField __contains not supported on SQLite")
    def test_get_by_channel(self):
        """Test getting notification types by available channel."""
        NotificationType.objects.create(
            name="Email Only",
            available_channels=["email"],
            created_by=self.user,
        )
        NotificationType.objects.create(
            name="Multi Channel",
            available_channels=["email", "sms"],
            created_by=self.user,
        )

        email_only = NotificationTypeSelector.get_by_channel("email")
        self.assertEqual(email_only.count(), 2)

        sms_only = NotificationTypeSelector.get_by_channel("sms")
        self.assertEqual(sms_only.count(), 1)

    @unittest.skipIf(SKIP_JSON_CONTAINS, "JSONField __contains not supported on SQLite")
    def test_get_for_role(self):
        """Test getting notification types for role."""
        NotificationType.objects.create(
            name="Admin Alert",
            default_recipient_roles=["admin"],
            created_by=self.user,
        )
        NotificationType.objects.create(
            name="User Alert",
            default_recipient_roles=["assistant"],
            created_by=self.user,
        )

        admin = NotificationTypeSelector.get_for_role("admin")
        self.assertEqual(admin.count(), 1)

        assistant = NotificationTypeSelector.get_for_role("assistant")
        self.assertEqual(assistant.count(), 1)
