# apps/companies/models.py
"""
Organization Domain Models.

This app implements the core organizational entities:
- Company: Legal/operational company managed by the platform
- CompanySettings: Configurable settings per company
- CompanyPreference: Flexible key-value preferences per company

All models follow the base patterns from apps.common:
- UUID primary keys
- Timestamps (created_at, updated_at)
- Soft archive (is_archived, archived_at, archived_by)
- Creator/updater tracking
- Active/All managers
- Human-readable references
"""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    ActiveManager,
    ArchiveModel,
    CustomFieldsModel,
    ReferenceTrackedModel,
)

# Import here to avoid circular imports
from apps.companies.managers import CompanyManager


class CompanyStatus(models.TextChoices):
    """Company status lifecycle states."""

    ACTIVE = "active", _("Active")
    INACTIVE = "inactive", _("Inactive")
    SUSPENDED = "suspended", _("Suspended")
    ARCHIVED = "archived", _("Archived")


class Company(ReferenceTrackedModel, CustomFieldsModel):
    """
    Company model - represents a legal or operational company managed by the platform.

    Each company is the root entity for financial records, treasury accounts,
    parties, and reports. Companies can be created, modified, archived, restored,
    or permanently deleted (admin only).
    """

    # Company Identity
    name = models.CharField(
        _("name"),
        max_length=255,
        help_text=_("Legal name of the company"),
    )
    trade_name = models.CharField(
        _("trade name"),
        max_length=255,
        blank=True,
        help_text=_("Commercial/trade name (DBA)"),
    )

    # Legal/Regulatory Identifiers
    registration_number = models.CharField(
        _("registration number"),
        max_length=100,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Official company registration number"),
    )
    tax_id = models.CharField(
        _("tax ID"),
        max_length=100,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Tax identification number"),
    )
    vat_number = models.CharField(
        _("VAT number"),
        max_length=100,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Value Added Tax number"),
    )

    # Contact Information
    email = models.EmailField(
        _("email"),
        blank=True,
        help_text=_("Primary contact email"),
    )
    phone = models.CharField(
        _("phone"),
        max_length=50,
        blank=True,
        help_text=_("Primary contact phone"),
    )
    address = models.TextField(
        _("address"),
        blank=True,
        help_text=_("Physical address"),
    )
    website = models.URLField(
        _("website"),
        blank=True,
        help_text=_("Company website"),
    )

    # Defaults & Localization
    default_currency = models.CharField(
        _("default currency"),
        max_length=3,
        default="MAD",
        help_text=_("ISO 4217 currency code"),
    )
    default_language = models.CharField(
        _("default language"),
        max_length=2,
        default="fr",
        help_text=_("ISO 639-1 language code"),
    )
    timezone = models.CharField(
        _("timezone"),
        max_length=50,
        default="Africa/Casablanca",
        help_text=_("IANA timezone identifier"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=CompanyStatus.choices,
        default=CompanyStatus.ACTIVE,
        help_text=_("Current operational status"),
    )

    # Notes
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Internal notes and archive history"),
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("company")
        verbose_name_plural = _("companies")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["reference"], name="company_ref_idx"),
            models.Index(fields=["name"], name="company_name_idx"),
            models.Index(fields=["status"], name="company_status_idx"),
            models.Index(fields=["tax_id"], name="company_tax_id_idx"),
            models.Index(fields=["registration_number"], name="company_reg_idx"),
            models.Index(fields=["is_archived", "status"], name="company_archive_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_company_reference",
            ),
            models.UniqueConstraint(
                fields=["tax_id"],
                condition=models.Q(tax_id__gt=""),
                name="unique_company_tax_id",
            ),
            models.UniqueConstraint(
                fields=["vat_number"],
                condition=models.Q(vat_number__gt=""),
                name="unique_company_vat_number",
            ),
            models.UniqueConstraint(
                fields=["registration_number"],
                condition=models.Q(registration_number__gt=""),
                name="unique_company_reg_number",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique company reference: CMP-YYYY-NNNNN"""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"CMP-{year}-"
        # Use a loop with retry to handle concurrency and archived/gapped records.
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                # Lock the relevant rows for this year
                last = (
                    Company.all_objects.select_for_update(nowait=False)
                    .filter(reference__startswith=prefix)
                    .order_by("-reference")
                    .first()
                )
                if last:
                    try:
                        num = int(last.reference.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        num = 1
                else:
                    num = 1
                reference = f"{prefix}{num:05d}"
                if not Company.all_objects.filter(reference=reference).exists():
                    return reference
        import random

        return f"{prefix}{random.randint(10000, 99999)}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = self.generate_reference()
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return f"/api/v1/companies/{self.id}/"

    def get_active_accounts(self):
        """Get active financial accounts for this company."""
        return self.financial_accounts.filter(is_archived=False, is_active=True)

    def get_active_financial_accounts(self):
        """Alias for get_active_accounts."""
        return self.get_active_accounts()

    # Managers
    objects = CompanyManager()
    all_objects = models.Manager()


class CompanySettingsManager(models.Manager):
    """Manager for CompanySettings with get_or_create_by_company."""

    def get_by_company(self, company) -> "CompanySettings":
        """Get or create settings for a company."""
        return self.get_or_create(company=company)[0]


class CompanySettings(models.Model):
    """
    CompanySettings - Configuration options for a company.

    One-to-one with Company. Contains all configurable behavioral settings
    that affect how the company operates within the platform.
    """

    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name="settings",
        verbose_name=_("company"),
    )

    # Financial Records Configuration
    default_record_type = models.CharField(
        _("default record type"),
        max_length=100,
        blank=True,
        help_text=_("Default financial record type for new records"),
    )
    auto_validate_records = models.BooleanField(
        _("auto-validate records"),
        default=False,
        help_text=_("Automatically validate records on creation"),
    )
    auto_approve_records = models.BooleanField(
        _("auto-approve records"),
        default=False,
        help_text=_("Automatically approve records on validation"),
    )
    require_payment_confirmation = models.BooleanField(
        _("require payment confirmation"),
        default=True,
        help_text=_("Require explicit confirmation for payments"),
    )

    # Payment Configuration
    default_payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("default payment method"),
    )
    allow_internal_transfers = models.BooleanField(
        _("allow internal transfers"),
        default=True,
        help_text=_("Allow transfers between company accounts"),
    )
    require_transfer_approval = models.BooleanField(
        _("require transfer approval"),
        default=True,
        help_text=_("Require approval for internal transfers"),
    )

    # Reference Prefixes
    record_reference_prefix = models.CharField(
        _("record reference prefix"),
        max_length=20,
        blank=True,
        help_text=_("Prefix for financial record references (e.g., 'INV-')"),
    )
    transaction_reference_prefix = models.CharField(
        _("transaction reference prefix"),
        max_length=20,
        blank=True,
        help_text=_("Prefix for treasury transaction references (e.g., 'TRX-')"),
    )

    # Invoice Settings (Frontend Compatibility)
    invoice_footer_text = models.TextField(
        _("invoice footer text"),
        blank=True,
        help_text=_("Footer text for invoices"),
    )
    default_currency = models.CharField(
        _("default currency"),
        max_length=3,
        default="MAD",
        help_text=_("Default currency for invoices"),
    )
    default_tax_rate = models.DecimalField(
        _("default tax rate"),
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("Default tax rate percentage"),
    )
    auto_send_invoices = models.BooleanField(
        _("auto send invoices"),
        default=False,
        help_text=_("Automatically send invoices upon creation"),
    )

    # Approval Settings
    require_approval = models.BooleanField(
        _("require approval"),
        default=False,
        help_text=_("Require approval for financial records"),
    )
    approval_threshold = models.DecimalField(
        _("approval threshold"),
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=_("Amount threshold requiring approval"),
    )

    # Notifications
    notify_on_payment = models.BooleanField(
        _("notify on payment"),
        default=True,
        help_text=_("Send notifications when payments are recorded"),
    )
    notify_on_transfer = models.BooleanField(
        _("notify on transfer"),
        default=True,
        help_text=_("Send notifications when transfers complete"),
    )
    notify_on_report_generated = models.BooleanField(
        _("notify on report generated"),
        default=True,
        help_text=_("Send notifications when reports are generated"),
    )

    # Permissions Defaults
    assistants_can_manage_records = models.BooleanField(
        _("assistants can manage records"),
        default=True,
        help_text=_("Allow assistants to create/edit records"),
    )
    assistants_can_manage_parties = models.BooleanField(
        _("assistants can manage parties"),
        default=True,
        help_text=_("Allow assistants to create/edit clients/suppliers"),
    )
    assistants_can_create_transfers = models.BooleanField(
        _("assistants can create transfers"),
        default=False,
        help_text=_("Allow assistants to create internal transfers"),
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created at"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Updated at"))
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_settings_created",
        verbose_name=_("Created by"),
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_settings_updated",
        verbose_name=_("Updated by"),
    )

    objects = CompanySettingsManager()

    class Meta:
        verbose_name = _("company settings")
        verbose_name_plural = _("company settings")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Settings for {self.company.reference}"


class CompanyPreferenceType(models.TextChoices):
    """Supported preference value types."""

    STRING = "string", _("String")
    INTEGER = "integer", _("Integer")
    DECIMAL = "decimal", _("Decimal")
    BOOLEAN = "boolean", _("Boolean")
    JSON = "json", _("JSON")


class CompanyPreferenceManager(ActiveManager):
    """Manager for CompanyPreference with convenience methods."""

    def get_by_key(self, company, key: str):
        """Get a preference by key for a company."""
        return self.filter(company=company, key=key).first()

    def get_all_values(self, company) -> dict:
        """Get all preference values as typed dict."""
        return {pref.key: pref.get_typed_value() for pref in self.filter(company=company)}


class CompanyPreference(ArchiveModel):
    """
    CompanyPreference - Flexible key-value configuration per company.

    Supports typed values (string, integer, decimal, boolean, JSON)
    with system/user distinction for upgrade safety.
    """

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="preferences",
        verbose_name=_("company"),
    )
    key = models.CharField(
        _("key"),
        max_length=100,
        help_text=_("Unique preference key (alphanumeric, underscore, hyphen)"),
    )
    value = models.TextField(
        _("value"),
        help_text=_("Stored as string, cast by preference_type"),
    )
    preference_type = models.CharField(
        _("type"),
        max_length=20,
        choices=CompanyPreferenceType.choices,
        default=CompanyPreferenceType.STRING,
        help_text=_("Data type for value casting"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Human-readable description of this preference"),
    )
    is_system = models.BooleanField(
        _("system preference"),
        default=False,
        help_text=_("System preferences cannot be deleted by users"),
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created at"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Updated at"))
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_preferences_created",
        verbose_name=_("Created by"),
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_preferences_updated",
        verbose_name=_("Updated by"),
    )

    objects = CompanyPreferenceManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("company preference")
        verbose_name_plural = _("company preferences")
        ordering = ["company", "key"]
        indexes = [
            models.Index(fields=["company", "key"], name="pref_company_key_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "key"],
                name="unique_company_preference_key",
            ),
        ]

    def __str__(self):
        return f"{self.company.reference}.{self.key} = {self.value}"

    def get_typed_value(self):
        """Return value cast to its proper Python type."""
        if self.preference_type == CompanyPreferenceType.INTEGER:
            try:
                return int(self.value)
            except (ValueError, TypeError):
                return 0
        elif self.preference_type == CompanyPreferenceType.DECIMAL:
            try:
                return Decimal(self.value)
            except (ValueError, TypeError, ImportError):
                return Decimal("0")
        elif self.preference_type == CompanyPreferenceType.BOOLEAN:
            return self.value.lower() in ("true", "1", "yes", "on")
        elif self.preference_type == CompanyPreferenceType.JSON:
            import json

            try:
                return json.loads(self.value)
            except (ValueError, TypeError):
                return {}
        return self.value

    def set_typed_value(self, value):
        """Set value from Python object, converting to string."""
        if self.preference_type == CompanyPreferenceType.JSON:
            import json

            self.value = json.dumps(value)
        elif self.preference_type == CompanyPreferenceType.BOOLEAN:
            self.value = "true" if value else "false"
        else:
            self.value = str(value)
