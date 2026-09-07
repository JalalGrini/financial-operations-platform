# apps/configuration/models.py
"""
Configuration Domain Models.

This module implements the Core Configuration entities that are referenced
by operational modules (Financial Records, Treasury, Reports).

Configuration entities:
- Category: Hierarchical classification for records/transactions
- FinancialRecordType: Configurable business types for financial records
- PaymentMethod: Methods for payments with configurable fields
- TransactionType: Types for treasury transactions
- ReportType: Report definitions with templates
- NotificationType: Notification categories (foundation only)

All models follow base patterns from apps.common:
- UUID primary keys
- Timestamps (created_at, updated_at)
- Soft archive (is_archived, archived_at, archived_by)
- Creator/updater tracking
- Active/All managers
- Human-readable references
- Hierarchical support where applicable
"""
from decimal import Decimal

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    ActiveManager,
    ReferenceTrackedModel,
    generate_sequential_reference,
)


class ConfigurationStatus(models.TextChoices):
    """Status for configuration entities."""

    ACTIVE = "active", _("Active")
    INACTIVE = "inactive", _("Inactive")
    ARCHIVED = "archived", _("Archived")


class Category(ReferenceTrackedModel):
    """
    Category - Hierarchical classification for financial records and transactions.

    Supports multi-level hierarchy (parent/child) for organizing
    financial data. Used by Financial Records, Treasury, and Reports.
    """

    name = models.CharField(
        _("name"),
        max_length=100,
        help_text=_("Category name"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Category description"),
    )

    # Hierarchy
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
        verbose_name=_("parent category"),
        help_text=_("Parent category for hierarchical organization"),
    )
    level = models.PositiveIntegerField(
        _("level"),
        default=0,
        help_text=_("Hierarchy level (0 = root)"),
        editable=False,
    )
    path = models.CharField(
        _("path"),
        max_length=500,
        blank=True,
        help_text=_("Full path from root (e.g., /expenses/travel)"),
        editable=False,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier (e.g., 'folder', 'receipt')"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code (e.g., #3B82F6)"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
        help_text=_("Order for display in lists"),
    )

    # Scope
    is_income = models.BooleanField(
        _("income category"),
        default=False,
        help_text=_("Category represents income (vs expense)"),
    )
    is_expense = models.BooleanField(
        _("expense category"),
        default=False,
        help_text=_("Category represents expense (vs income)"),
    )
    is_transfer = models.BooleanField(
        _("transfer category"),
        default=False,
        help_text=_("Category for internal transfers"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("category")
        verbose_name_plural = _("categories")
        ordering = ["path", "display_order", "name"]
        indexes = [
            models.Index(fields=["parent"], name="cat_parent_idx"),
            models.Index(fields=["path"], name="cat_path_idx"),
            models.Index(fields=["status"], name="cat_status_idx"),
            models.Index(fields=["is_income"], name="cat_income_idx"),
            models.Index(fields=["is_expense"], name="cat_expense_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_category_reference",
            ),
            models.UniqueConstraint(
                fields=["name", "parent"],
                name="unique_category_name_per_parent",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.get_full_path()}"

    def get_full_path(self, id_to_name=None):
        """Return full path as string (e.g., 'Expenses / Travel / Airfare').

        Without `id_to_name`, this runs one query per ancestor (via
        `path`, a materialized path of ancestor ids). That is fine for a
        single object but is a real per-row N+1 when called across a list of
        categories with parents.

        `id_to_name` is an optional `{id: name}` map. When provided, ancestor
        names are resolved from it with zero additional queries; any id
        missing from the map still falls back to a direct lookup, so the
        result is always correct even with a partial map. CategorySerializer
        passes a map built from a single bulk query across the whole page
        (Cycle 23, N-2).
        """
        if not self.path:
            return self.name
        parts = self.path.split("/")
        names = []
        for part_id in parts:
            if part_id:
                if id_to_name is not None and part_id in id_to_name:
                    names.append(id_to_name[part_id])
                    continue
                try:
                    cat = Category.all_objects.get(id=part_id)
                    names.append(cat.name)
                except Category.DoesNotExist:
                    pass
        # Include current category's name
        names.append(self.name)
        return " / ".join(names) if names else self.name

    def generate_reference(self):
        """Generate unique reference: CAT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(Category, f"CAT-{year}-")

    def save(self, *args, **kwargs):
        # Calculate level and path
        if self.parent:
            self.level = self.parent.level + 1
            if self.parent.path:
                self.path = f"{self.parent.path}{self.parent.id}/"
            else:
                self.path = f"/{self.parent.id}/"
        else:
            self.level = 0
            self.path = ""
        super().save(*args, **kwargs)

    def get_ancestors(self):
        """Return all ancestor categories up to root."""
        ancestors = []
        current = self.parent
        while current:
            ancestors.append(current)
            current = current.parent
        return ancestors[::-1]  # root first

    def get_descendants(self):
        """Return all descendant categories."""
        prefix = f"/{self.id}/" if not self.path else f"{self.path}{self.id}/"
        return Category.objects.filter(path__startswith=prefix)


class FinancialRecordType(ReferenceTrackedModel):
    """
    FinancialRecordType - Configurable business type for financial records.

    Examples: Purchase Invoice, Sales Invoice, Fuel Expense, Salary Payment,
    Tax Payment, Credit Note, Debit Note, Receipt, etc.
    """

    class RecordNature(models.TextChoices):
        INCOME = "income", _("Income")
        EXPENSE = "expense", _("Expense")
        TRANSFER = "transfer", _("Transfer")
        ADJUSTMENT = "adjustment", _("Adjustment")

    class RecordDirection(models.TextChoices):
        INBOUND = "inbound", _("Inbound")
        OUTBOUND = "outbound", _("Outbound")
        INTERNAL = "internal", _("Internal")

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Type name (e.g., 'Purchase Invoice', 'Fuel Expense')"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of when to use this record type"),
    )

    # Classification
    nature = models.CharField(
        _("nature"),
        max_length=20,
        choices=RecordNature.choices,
        default=RecordNature.EXPENSE,
        help_text=_("Whether this record represents income, expense, transfer, or adjustment"),
    )
    direction = models.CharField(
        _("direction"),
        max_length=20,
        choices=RecordDirection.choices,
        default=RecordDirection.OUTBOUND,
        help_text=_("Default cash flow direction"),
    )

    # Category linkage
    default_category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_record_types",
        verbose_name=_("default category"),
    )
    allowed_categories = models.ManyToManyField(
        Category,
        related_name="allowed_record_types",
        blank=True,
        verbose_name=_("allowed categories"),
        help_text=_("Categories that can be used with this record type (empty = all)"),
    )

    # Template linkage (for future)
    default_template = models.CharField(
        _("default template"),
        max_length=100,
        blank=True,
        help_text=_("Default template identifier for this record type"),
    )

    # Defaults
    default_payment_method = models.ForeignKey(
        "PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("default payment method"),
    )
    default_payment_terms = models.CharField(
        _("default payment terms"),
        max_length=100,
        blank=True,
        help_text=_("Default payment terms (e.g., Net 30)"),
    )

    # Workflow
    requires_validation = models.BooleanField(
        _("requires validation"),
        default=True,
        help_text=_("Records of this type require validation step"),
    )
    requires_approval = models.BooleanField(
        _("requires approval"),
        default=False,
        help_text=_("Records of this type require approval step"),
    )
    allows_partial_payment = models.BooleanField(
        _("allows partial payment"),
        default=True,
        help_text=_("Records can have multiple partial payments"),
    )

    # Numbering
    reference_prefix = models.CharField(
        _("reference prefix"),
        max_length=10,
        blank=True,
        help_text=_("Prefix for auto-generated references (e.g., 'INV-')"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code for UI"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("financial record type")
        verbose_name_plural = _("financial record types")
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["nature"], name="frt_nature_idx"),
            models.Index(fields=["status"], name="frt_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_frt_reference",
            ),
            models.UniqueConstraint(
                fields=["name"],
                name="unique_frt_name",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: FRT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(FinancialRecordType, f"FRT-{year}-")

    def is_income_type(self):
        return self.nature in (self.RecordNature.INCOME, self.RecordNature.TRANSFER)

    def is_expense_type(self):
        return self.nature in (self.RecordNature.EXPENSE, self.RecordNature.TRANSFER)


class PaymentMethod(ReferenceTrackedModel):
    """
    PaymentMethod - Configurable payment methods with field definitions.

    Examples: Cash, Bank Transfer, Cheque, Card, Deposit, Direct Debit.
    Each method can define required extra fields.
    """

    class MethodKind(models.TextChoices):
        CASH = "cash", _("Cash")
        BANK_TRANSFER = "bank_transfer", _("Bank Transfer")
        CHEQUE = "cheque", _("Cheque")
        CARD = "card", _("Card")
        DEPOSIT = "deposit", _("Deposit")
        DIRECT_DEBIT = "direct_debit", _("Direct Debit")
        OTHER = "other", _("Other")

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Method name (e.g., 'Bank Transfer', 'Cheque')"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of this payment method"),
    )

    # Classification
    kind = models.CharField(
        _("kind"),
        max_length=20,
        choices=MethodKind.choices,
        default=MethodKind.OTHER,
        help_text=_("Payment method kind for system behavior"),
    )
    is_electronic = models.BooleanField(
        _("electronic"),
        default=False,
        help_text=_("Whether this is an electronic payment method"),
    )
    requires_bank_details = models.BooleanField(
        _("requires bank details"),
        default=False,
        help_text=_("Payment requires bank account information"),
    )
    requires_reference = models.BooleanField(
        _("requires reference"),
        default=True,
        help_text=_("Payment requires external reference number"),
    )

    # Extra field definitions (JSON schema)
    extra_fields = models.JSONField(
        _("extra fields"),
        default=dict,
        blank=True,
        help_text=_("JSON schema defining required/optional extra fields"),
    )

    # Default field values (for UI pre-filling)
    default_field_values = models.JSONField(
        _("default field values"),
        default=dict,
        blank=True,
        help_text=_("Default values for extra fields"),
    )

    # Processing
    processing_days = models.PositiveIntegerField(
        _("processing days"),
        default=0,
        help_text=_("Typical processing time in business days"),
    )
    fee_percentage = models.DecimalField(
        _("fee percentage"),
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        help_text=_("Transaction fee percentage"),
    )
    fee_fixed = models.DecimalField(
        _("fixed fee"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Fixed transaction fee"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("payment method")
        verbose_name_plural = _("payment methods")
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["kind"], name="pm_kind_idx"),
            models.Index(fields=["status"], name="pm_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_payment_method_reference",
            ),
            models.UniqueConstraint(
                fields=["name"],
                name="unique_payment_method_name",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: PMT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(PaymentMethod, f"PMT-{year}-")

    def get_required_extra_fields(self):
        """Return list of required extra field names."""
        if not self.extra_fields:
            return []
        return [
            field_name
            for field_name, config in self.extra_fields.items()
            if config.get("required", False)
        ]

    def validate_extra_fields(self, data: dict) -> dict:
        """Validate extra fields data against schema. Returns errors dict."""
        errors = {}
        if not self.extra_fields:
            return errors

        for field_name, config in self.extra_fields.items():
            required = config.get("required", False)
            field_type = config.get("type", "string")

            if required and field_name not in data:
                errors[field_name] = _("This field is required.")
            elif field_name in data:
                value = data[field_name]
                # Type validation
                if field_type == "integer":
                    try:
                        int(value)
                    except (ValueError, TypeError):
                        errors[field_name] = _("Must be an integer.")
                elif field_type == "decimal":
                    from decimal import Decimal, InvalidOperation

                    try:
                        Decimal(str(value))
                    except (InvalidOperation, TypeError):
                        errors[field_name] = _("Must be a valid decimal.")
                elif field_type == "date":
                    from datetime import datetime

                    try:
                        datetime.strptime(str(value), "%Y-%m-%d")
                    except ValueError:
                        errors[field_name] = _("Must be a valid date (YYYY-MM-DD).")

        return errors


class TransactionType(ReferenceTrackedModel):
    """
    TransactionType - Configurable types for treasury transactions.

    Examples: Payment, Internal Transfer, Deposit, Withdrawal,
    Opening Balance, Credit Adjustment, Debit Adjustment,
    Refund, Reversal, Correction.
    """

    class TransactionNature(models.TextChoices):
        CREDIT = "credit", _("Credit")
        DEBIT = "debit", _("Debit")
        BOTH = "both", _("Both (Transfer)")

    class TransactionDirection(models.TextChoices):
        INBOUND = "inbound", _("Inbound")
        OUTBOUND = "outbound", _("Outbound")
        INTERNAL = "internal", _("Internal")

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Type name (e.g., 'Payment', 'Internal Transfer')"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of when to use this transaction type"),
    )

    # Nature: credit, debit, or both (for transfers)
    nature = models.CharField(
        _("nature"),
        max_length=20,
        choices=TransactionNature.choices,
        default=TransactionNature.BOTH,
        help_text=_("Whether this type creates credits, debits, or both"),
    )
    direction = models.CharField(
        _("direction"),
        max_length=20,
        choices=TransactionDirection.choices,
        default=TransactionDirection.INTERNAL,
    )

    # Accounting behavior
    is_reversal = models.BooleanField(
        _("is reversal"),
        default=False,
        help_text=_("This type represents a reversal of another transaction"),
    )
    is_adjustment = models.BooleanField(
        _("is adjustment"),
        default=False,
        help_text=_("This type represents a manual balance adjustment"),
    )
    is_opening_balance = models.BooleanField(
        _("is opening balance"),
        default=False,
        help_text=_("This type represents an opening balance entry"),
    )
    is_transfer = models.BooleanField(
        _("is transfer"),
        default=False,
        help_text=_("This type represents an internal transfer between accounts"),
    )

    # Required fields
    requires_counterparty = models.BooleanField(
        _("requires counterparty"),
        default=False,
        help_text=_("Transaction requires a counterparty"),
    )
    requires_payment_method = models.BooleanField(
        _("requires payment method"),
        default=True,
        help_text=_("Transaction requires a payment method"),
    )
    requires_reason = models.BooleanField(
        _("requires reason"),
        default=False,
        help_text=_("Transaction requires a reason/note"),
    )

    # Payment method restrictions
    allowed_payment_methods = models.ManyToManyField(
        PaymentMethod,
        related_name="allowed_transaction_types",
        blank=True,
        verbose_name=_("allowed payment methods"),
        help_text=_("Payment methods allowed for this transaction type"),
    )

    # Workflow
    requires_approval = models.BooleanField(
        _("requires approval"),
        default=False,
        help_text=_("Transactions of this type require approval"),
    )
    is_system = models.BooleanField(
        _("system type"),
        default=False,
        help_text=_("System types cannot be deleted by users"),
    )

    # Numbering
    reference_prefix = models.CharField(
        _("reference prefix"),
        max_length=10,
        blank=True,
        help_text=_("Prefix for auto-generated references (e.g., 'TRX-')"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("transaction type")
        verbose_name_plural = _("transaction types")
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["nature"], name="tt_nature_idx"),
            models.Index(fields=["is_transfer"], name="tt_transfer_idx"),
            models.Index(fields=["status"], name="tt_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_transaction_type_reference",
            ),
            models.UniqueConstraint(
                fields=["name"],
                name="unique_transaction_type_name",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: TXT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(TransactionType, f"TXT-{year}-")

    def is_credit_type(self):
        return self.nature in [self.TransactionNature.CREDIT, self.TransactionNature.BOTH]

    def is_debit_type(self):
        return self.nature in [self.TransactionNature.DEBIT, self.TransactionNature.BOTH]


class ReportType(ReferenceTrackedModel):
    """
    ReportType - Configurable report definitions.

    Defines the structure and generation logic for reports.
    Examples: Income Statement, Balance Sheet, Cash Flow, Trial Balance,
    Aged Receivables, Aged Payables, Sales Report, Expense Report.
    """

    class ReportFrequency(models.TextChoices):
        MONTHLY = "monthly", _("Monthly")
        QUARTERLY = "quarterly", _("Quarterly")
        ANNUAL = "annual", _("Annual")
        ON_DEMAND = "on_demand", _("On Demand")

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Report name (e.g., 'Income Statement', 'Aged Receivables')"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of this report type"),
    )

    # Classification
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="report_types",
        verbose_name=_("report category"),
    )

    # Generation
    frequency = models.CharField(
        _("frequency"),
        max_length=20,
        choices=ReportFrequency.choices,
        default=ReportFrequency.MONTHLY,
        help_text=_("Default generation frequency"),
    )
    supports_preview = models.BooleanField(
        _("supports preview"),
        default=True,
        help_text=_("Report can be generated as preview"),
    )
    supports_scheduled = models.BooleanField(
        _("supports scheduled"),
        default=True,
        help_text=_("Report can be scheduled"),
    )

    # Template
    template_name = models.CharField(
        _("template name"),
        max_length=100,
        blank=True,
        help_text=_("Template identifier for report generation"),
    )
    export_formats = models.JSONField(
        _("export formats"),
        default=list,
        help_text=_("Supported export formats (e.g., ['pdf', 'excel', 'csv'])"),
    )

    # Filters/Parameters
    available_filters = models.JSONField(
        _("available filters"),
        default=dict,
        blank=True,
        help_text=_("JSON schema for report parameters/filters"),
    )
    default_parameters = models.JSONField(
        _("default parameters"),
        default=dict,
        blank=True,
        help_text=_("Default values for report parameters"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("report type")
        verbose_name_plural = _("report types")
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["status"], name="rt_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_report_type_reference",
            ),
            models.UniqueConstraint(
                fields=["name"],
                name="unique_report_type_name",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: RPT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(ReportType, f"RPT-{year}-")


class NotificationType(ReferenceTrackedModel):
    """
    NotificationType - Foundation for notification categories.

    Defines categories of notifications that can be sent to users.
    Examples: Payment Received, Transfer Completed, Report Generated,
    Report Approved, Financial Record Validated, etc.
    """

    class NotificationChannel(models.TextChoices):
        IN_APP = "in_app", _("In-App")
        EMAIL = "email", _("Email")
        SMS = "sms", _("SMS")
        PUSH = "push", _("Push Notification")
        WEBHOOK = "webhook", _("Webhook")

    class NotificationPriority(models.TextChoices):
        LOW = "low", _("Low")
        NORMAL = "normal", _("Normal")
        HIGH = "high", _("High")
        URGENT = "urgent", _("Urgent")

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Notification type name (e.g., 'Payment Received')"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of when this notification is triggered"),
    )

    # Channels
    default_channels = models.JSONField(
        _("default channels"),
        default=list,
        help_text=_("Default delivery channels (e.g., ['in_app', 'email'])"),
    )
    available_channels = models.JSONField(
        _("available channels"),
        default=list,
        help_text=_("Channels this notification can use"),
    )

    # Template
    subject_template = models.CharField(
        _("subject template"),
        max_length=255,
        blank=True,
        help_text=_("Subject template with {{variables}}"),
    )
    body_template = models.TextField(
        _("body template"),
        blank=True,
        help_text=_("Body template with {{variables}}"),
    )

    # Defaults
    default_priority = models.CharField(
        _("default priority"),
        max_length=20,
        choices=NotificationPriority.choices,
        default=NotificationPriority.NORMAL,
    )

    # Recipients
    default_recipient_roles = models.JSONField(
        _("default recipient roles"),
        default=list,
        help_text=_("Default roles that receive this notification"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ConfigurationStatus.choices,
        default=ConfigurationStatus.ACTIVE,
    )

    # Display
    icon = models.CharField(
        _("icon"),
        max_length=50,
        blank=True,
        help_text=_("Icon identifier"),
    )
    color = models.CharField(
        _("color"),
        max_length=7,
        blank=True,
        help_text=_("Hex color code"),
    )
    display_order = models.PositiveIntegerField(
        _("display order"),
        default=0,
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("notification type")
        verbose_name_plural = _("notification types")
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["status"], name="nt_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_notification_type_reference",
            ),
            models.UniqueConstraint(
                fields=["name"],
                name="unique_notification_type_name",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: NOT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(NotificationType, f"NOT-{year}-")
