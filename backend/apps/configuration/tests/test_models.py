# apps/configuration/tests/test_models.py
"""
Tests for Configuration domain models.

Tests cover:
- Category (hierarchy)
- FinancialRecordType
- PaymentMethod (extra fields validation)
- TransactionType
- ReportType
- NotificationType
- Archive/restore behavior
- Reference generation
- Managers and querysets
"""
import re
import uuid

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


class CategoryModelTests(TestCase):
    """Tests for Category model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_root_category(self):
        """Test creating a root category."""
        category = Category.objects.create(
            name="Expenses",
            description="All expenses",
            is_expense=True,
            created_by=self.user,
        )
        self.assertIsInstance(category.id, uuid.UUID)
        self.assertTrue(category.reference.startswith("CAT-"))
        self.assertEqual(category.level, 0)
        self.assertEqual(category.path, "")

    def test_create_child_category(self):
        """Test creating a child category."""
        parent = Category.objects.create(
            name="Expenses",
            is_expense=True,
            created_by=self.user,
        )
        child = Category.objects.create(
            name="Travel",
            parent=parent,
            is_expense=True,
            created_by=self.user,
        )
        self.assertEqual(child.level, 1)
        self.assertEqual(child.path, f"/{parent.id}/")

    def test_category_hierarchy_path(self):
        """Test category path calculation."""
        root = Category.objects.create(name="Root", created_by=self.user)
        child1 = Category.objects.create(name="Child1", parent=root, created_by=self.user)
        child2 = Category.objects.create(name="Child2", parent=child1, created_by=self.user)

        self.assertEqual(root.level, 0)
        self.assertEqual(child1.level, 1)
        self.assertEqual(child2.level, 2)
        self.assertEqual(child1.path, f"/{root.id}/")
        self.assertEqual(child2.path, f"/{root.id}/{child1.id}/")

    def test_category_full_path(self):
        """Test get_full_path method."""
        root = Category.objects.create(name="Expenses", created_by=self.user)
        travel = Category.objects.create(name="Travel", parent=root, created_by=self.user)
        airfare = Category.objects.create(name="Airfare", parent=travel, created_by=self.user)

        self.assertEqual(root.get_full_path(), "Expenses")
        self.assertEqual(travel.get_full_path(), "Expenses / Travel")
        self.assertEqual(airfare.get_full_path(), "Expenses / Travel / Airfare")

    def test_category_reference_format(self):
        """Test category reference follows CAT-YYYY-NNNNN format."""
        category = Category.objects.create(name="Test", created_by=self.user)
        pattern = r"^CAT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, category.reference))

    def test_category_income_expense_flags(self):
        """Test income/expense/transfer flags."""
        income = Category.objects.create(name="Income", is_income=True, created_by=self.user)
        expense = Category.objects.create(name="Expense", is_expense=True, created_by=self.user)
        transfer = Category.objects.create(name="Transfer", is_transfer=True, created_by=self.user)

        self.assertTrue(income.is_income)
        self.assertTrue(expense.is_expense)
        self.assertTrue(transfer.is_transfer)

    def test_category_descendants(self):
        """Test get_descendants method."""
        root = Category.objects.create(name="Root", created_by=self.user)
        child1 = Category.objects.create(name="Child1", parent=root, created_by=self.user)
        Category.objects.create(name="Child2", parent=root, created_by=self.user)
        Category.objects.create(name="Grandchild", parent=child1, created_by=self.user)

        descendants = root.get_descendants()
        self.assertEqual(descendants.count(), 3)

        child1_descendants = child1.get_descendants()
        self.assertEqual(child1_descendants.count(), 1)

    def test_category_ancestors(self):
        """Test get_ancestors method."""
        root = Category.objects.create(name="Root", created_by=self.user)
        child1 = Category.objects.create(name="Child1", parent=root, created_by=self.user)
        child2 = Category.objects.create(name="Child2", parent=child1, created_by=self.user)

        ancestors = child2.get_ancestors()
        self.assertEqual(len(ancestors), 2)
        self.assertEqual(ancestors[0], root)
        self.assertEqual(ancestors[1], child1)

    def test_category_unique_name_per_parent(self):
        """Test unique name constraint per parent."""
        parent = Category.objects.create(name="Parent", created_by=self.user)
        Category.objects.create(name="Child", parent=parent, created_by=self.user)
        with self.assertRaises(Exception):
            Category.objects.create(name="Child", parent=parent, created_by=self.user)

    def test_category_archive_restore(self):
        """Test archive and restore."""
        category = Category.objects.create(name="Test", created_by=self.user)
        category.archive(user=self.user)
        self.assertTrue(category.is_archived)
        category.restore()
        self.assertFalse(category.is_archived)


class FinancialRecordTypeModelTests(TestCase):
    """Tests for FinancialRecordType model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_record_type(self):
        """Test creating a financial record type."""
        frt = FinancialRecordType.objects.create(
            name="Purchase Invoice",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            direction=FinancialRecordType.RecordDirection.INBOUND,
            requires_validation=True,
            requires_approval=False,
            created_by=self.user,
        )
        self.assertIsInstance(frt.id, uuid.UUID)
        self.assertTrue(frt.reference.startswith("FRT-"))
        self.assertEqual(frt.nature, FinancialRecordType.RecordNature.EXPENSE)

    def test_frt_reference_format(self):
        """Test FRT reference follows FRT-YYYY-NNNNN format."""
        frt = FinancialRecordType.objects.create(name="Test", created_by=self.user)
        pattern = r"^FRT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, frt.reference))

    def test_frt_income_type(self):
        """Test income type check."""
        frt = FinancialRecordType.objects.create(
            name="Sales Invoice",
            nature=FinancialRecordType.RecordNature.INCOME,
            created_by=self.user,
        )
        self.assertTrue(frt.is_income_type())
        self.assertFalse(frt.is_expense_type())

    def test_frt_expense_type(self):
        """Test expense type check."""
        frt = FinancialRecordType.objects.create(
            name="Purchase Invoice",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=self.user,
        )
        self.assertTrue(frt.is_expense_type())
        self.assertFalse(frt.is_income_type())

    def test_frt_transfer_type(self):
        """Test transfer type check."""
        frt = FinancialRecordType.objects.create(
            name="Transfer",
            nature=FinancialRecordType.RecordNature.TRANSFER,
            created_by=self.user,
        )
        self.assertTrue(frt.is_income_type())
        self.assertTrue(frt.is_expense_type())

    def test_frt_unique_name(self):
        """Test FRT name is unique."""
        FinancialRecordType.objects.create(name="Purchase Invoice", created_by=self.user)
        with self.assertRaises(Exception):
            FinancialRecordType.objects.create(name="Purchase Invoice", created_by=self.user)

    def test_frt_archive_restore(self):
        """Test archive and restore."""
        frt = FinancialRecordType.objects.create(name="Test", created_by=self.user)
        frt.archive(user=self.user)
        self.assertTrue(frt.is_archived)
        frt.restore()
        self.assertFalse(frt.is_archived)


class PaymentMethodModelTests(TestCase):
    """Tests for PaymentMethod model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_payment_method(self):
        """Test creating a payment method."""
        pm = PaymentMethod.objects.create(
            name="Bank Transfer",
            kind=PaymentMethod.MethodKind.BANK_TRANSFER,
            is_electronic=True,
            requires_bank_details=True,
            requires_reference=True,
            processing_days=2,
            created_by=self.user,
        )
        self.assertIsInstance(pm.id, uuid.UUID)
        self.assertTrue(pm.reference.startswith("PMT-"))
        self.assertTrue(pm.is_electronic)

    def test_pmt_reference_format(self):
        """Test PMT reference follows PMT-YYYY-NNNNN format."""
        pm = PaymentMethod.objects.create(name="Test", created_by=self.user)
        pattern = r"^PMT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, pm.reference))

    def test_pmt_extra_fields(self):
        """Test extra fields JSON schema."""
        pm = PaymentMethod.objects.create(
            name="Cheque",
            kind=PaymentMethod.MethodKind.CHEQUE,
            extra_fields={
                "cheque_number": {"type": "string", "required": True},
                "bank_name": {"type": "string", "required": True},
                "cheque_date": {"type": "date", "required": True},
            },
            created_by=self.user,
        )
        required = pm.get_required_extra_fields()
        self.assertEqual(set(required), {"cheque_number", "bank_name", "cheque_date"})

    def test_pmt_validate_extra_fields_valid(self):
        """Test validate_extra_fields with valid data."""
        pm = PaymentMethod.objects.create(
            name="Cheque",
            kind=PaymentMethod.MethodKind.CHEQUE,
            extra_fields={
                "cheque_number": {"type": "string", "required": True},
                "amount": {"type": "decimal", "required": True},
            },
            created_by=self.user,
        )
        errors = pm.validate_extra_fields(
            {
                "cheque_number": "123456",
                "amount": "1000.50",
            }
        )
        self.assertEqual(errors, {})

    def test_pmt_validate_extra_fields_missing_required(self):
        """Test validate_extra_fields with missing required."""
        pm = PaymentMethod.objects.create(
            name="Cheque",
            extra_fields={
                "cheque_number": {"type": "string", "required": True},
            },
            created_by=self.user,
        )
        errors = pm.validate_extra_fields({})
        self.assertIn("cheque_number", errors)

    def test_pmt_validate_extra_fields_type_integer(self):
        """Test validate_extra_fields type validation for integer."""
        pm = PaymentMethod.objects.create(
            name="Test",
            extra_fields={"count": {"type": "integer", "required": True}},
            created_by=self.user,
        )
        errors = pm.validate_extra_fields({"count": "not_a_number"})
        self.assertIn("count", errors)

    def test_pmt_validate_extra_fields_type_decimal(self):
        """Test validate_extra_fields type validation for decimal."""
        pm = PaymentMethod.objects.create(
            name="Test",
            extra_fields={"rate": {"type": "decimal", "required": True}},
            created_by=self.user,
        )
        errors = pm.validate_extra_fields({"rate": "not_a_decimal"})
        self.assertIn("rate", errors)

    def test_pmt_validate_extra_fields_type_date(self):
        """Test validate_extra_fields type validation for date."""
        pm = PaymentMethod.objects.create(
            name="Test",
            extra_fields={"due_date": {"type": "date", "required": True}},
            created_by=self.user,
        )
        errors = pm.validate_extra_fields({"due_date": "invalid"})
        self.assertIn("due_date", errors)

        errors = pm.validate_extra_fields({"due_date": "2026-07-15"})
        self.assertNotIn("due_date", errors)

    def test_pmt_archive_restore(self):
        """Test archive and restore."""
        pm = PaymentMethod.objects.create(name="Test", created_by=self.user)
        pm.archive(user=self.user)
        self.assertTrue(pm.is_archived)
        pm.restore()
        self.assertFalse(pm.is_archived)


class TransactionTypeModelTests(TestCase):
    """Tests for TransactionType model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_transaction_type(self):
        """Test creating a transaction type."""
        tt = TransactionType.objects.create(
            name="Payment",
            nature=TransactionType.TransactionNature.CREDIT,
            direction=TransactionType.TransactionDirection.INBOUND,
            requires_payment_method=True,
            created_by=self.user,
        )
        self.assertIsInstance(tt.id, uuid.UUID)
        self.assertTrue(tt.reference.startswith("TXT-"))

    def test_txt_reference_format(self):
        """Test TXT reference follows TXT-YYYY-NNNNN format."""
        tt = TransactionType.objects.create(name="Test", created_by=self.user)
        pattern = r"^TXT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, tt.reference))

    def test_txt_is_credit_type(self):
        """Test is_credit_type check."""
        credit = TransactionType.objects.create(
            name="Credit", nature=TransactionType.TransactionNature.CREDIT, created_by=self.user
        )
        debit = TransactionType.objects.create(
            name="Debit", nature=TransactionType.TransactionNature.DEBIT, created_by=self.user
        )
        both = TransactionType.objects.create(
            name="Both", nature=TransactionType.TransactionNature.BOTH, created_by=self.user
        )

        self.assertTrue(credit.is_credit_type())
        self.assertFalse(debit.is_credit_type())
        self.assertTrue(both.is_credit_type())

    def test_txt_is_debit_type(self):
        """Test is_debit_type check."""
        credit = TransactionType.objects.create(
            name="Credit", nature=TransactionType.TransactionNature.CREDIT, created_by=self.user
        )
        debit = TransactionType.objects.create(
            name="Debit", nature=TransactionType.TransactionNature.DEBIT, created_by=self.user
        )
        both = TransactionType.objects.create(
            name="Both", nature=TransactionType.TransactionNature.BOTH, created_by=self.user
        )

        self.assertFalse(credit.is_debit_type())
        self.assertTrue(debit.is_debit_type())
        self.assertTrue(both.is_debit_type())

    def test_txt_archive_restore(self):
        """Test archive and restore."""
        tt = TransactionType.objects.create(name="Test", created_by=self.user)
        tt.archive(user=self.user)
        self.assertTrue(tt.is_archived)
        tt.restore()
        self.assertFalse(tt.is_archived)

    def test_txt_system_type(self):
        """Test system type flag."""
        tt = TransactionType.objects.create(
            name="System Type",
            is_system=True,
            created_by=self.user,
        )
        self.assertTrue(tt.is_system)


class ReportTypeModelTests(TestCase):
    """Tests for ReportType model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_report_type(self):
        """Test creating a report type."""
        rt = ReportType.objects.create(
            name="Income Statement",
            frequency=ReportType.ReportFrequency.MONTHLY,
            supports_preview=True,
            supports_scheduled=True,
            created_by=self.user,
        )
        self.assertIsInstance(rt.id, uuid.UUID)
        self.assertTrue(rt.reference.startswith("RPT-"))
        self.assertEqual(rt.frequency, ReportType.ReportFrequency.MONTHLY)

    def test_rt_reference_format(self):
        """Test RPT reference follows RPT-YYYY-NNNNN format."""
        rt = ReportType.objects.create(name="Test", created_by=self.user)
        pattern = r"^RPT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, rt.reference))

    def test_rt_export_formats(self):
        """Test export formats JSON field."""
        rt = ReportType.objects.create(
            name="Test",
            export_formats=["pdf", "excel", "csv"],
            created_by=self.user,
        )
        self.assertEqual(rt.export_formats, ["pdf", "excel", "csv"])

    def test_rt_available_filters(self):
        """Test available filters JSON field."""
        rt = ReportType.objects.create(
            name="Test",
            available_filters={
                "date_range": {"type": "date_range", "required": True},
                "company": {"type": "choice", "required": False},
            },
            created_by=self.user,
        )
        self.assertIn("date_range", rt.available_filters)
        self.assertTrue(rt.available_filters["date_range"]["required"])

    def test_rt_default_parameters(self):
        """Test default parameters JSON field."""
        rt = ReportType.objects.create(
            name="Test",
            default_parameters={"currency": "MAD", "group_by": "month"},
            created_by=self.user,
        )
        self.assertEqual(rt.default_parameters["currency"], "MAD")

    def test_rt_archive_restore(self):
        """Test archive and restore."""
        rt = ReportType.objects.create(name="Test", created_by=self.user)
        rt.archive(user=self.user)
        self.assertTrue(rt.is_archived)
        rt.restore()
        self.assertFalse(rt.is_archived)


class NotificationTypeModelTests(TestCase):
    """Tests for NotificationType model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_notification_type(self):
        """Test creating a notification type."""
        nt = NotificationType.objects.create(
            name="Payment Received",
            default_channels=["in_app", "email"],
            available_channels=["in_app", "email", "sms"],
            default_priority=NotificationType.NotificationPriority.HIGH,
            created_by=self.user,
        )
        self.assertIsInstance(nt.id, uuid.UUID)
        self.assertTrue(nt.reference.startswith("NOT-"))

    def test_nt_reference_format(self):
        """Test NOT reference follows NOT-YYYY-NNNNN format."""
        nt = NotificationType.objects.create(name="Test", created_by=self.user)
        pattern = r"^NOT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, nt.reference))

    def test_nt_default_channels(self):
        """Test default channels JSON field."""
        nt = NotificationType.objects.create(
            name="Test",
            default_channels=["in_app", "email"],
            available_channels=["in_app", "email", "sms", "push"],
            created_by=self.user,
        )
        self.assertEqual(nt.default_channels, ["in_app", "email"])
        self.assertEqual(nt.available_channels, ["in_app", "email", "sms", "push"])

    def test_nt_templates(self):
        """Test subject and body templates."""
        nt = NotificationType.objects.create(
            name="Test",
            subject_template="Payment {{amount}} received from {{party}}",
            body_template="Dear {{user}},\n\nPayment of {{amount}} has been received.",
            created_by=self.user,
        )
        self.assertIn("{{amount}}", nt.subject_template)
        self.assertIn("{{party}}", nt.subject_template)

    def test_nt_default_priority(self):
        """Test default priority."""
        nt = NotificationType.objects.create(
            name="Urgent",
            default_priority=NotificationType.NotificationPriority.URGENT,
            created_by=self.user,
        )
        self.assertEqual(nt.default_priority, NotificationType.NotificationPriority.URGENT)

    def test_nt_archive_restore(self):
        """Test archive and restore."""
        nt = NotificationType.objects.create(name="Test", created_by=self.user)
        nt.archive(user=self.user)
        self.assertTrue(nt.is_archived)
        nt.restore()
        self.assertFalse(nt.is_archived)
