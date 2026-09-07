# apps/parties/models.py
"""
Party Domain Models.

Implements the Party domain:
- Client: Customer related to Financial Records or Transactions
- Supplier: Vendor or service provider
- AssociatedPerson: Employee, director, agent, or other internal person
- ExternalParty: Counterparty not represented by other party types
- AssociatedPersonType: Classification for AssociatedPerson

All models follow base patterns from apps.common.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    ActiveManager,
    ReferenceTrackedModel,
    generate_sequential_reference,
)


class PartyStatus(models.TextChoices):
    """Status for all party types."""

    ACTIVE = "active", _("Active")
    INACTIVE = "inactive", _("Inactive")
    SUSPENDED = "suspended", _("Suspended")
    ARCHIVED = "archived", _("Archived")


class AssociatedPersonTypeStatus(models.TextChoices):
    """Status for AssociatedPersonType."""

    ACTIVE = "active", _("Active")
    INACTIVE = "inactive", _("Inactive")


class AssociatedPersonType(ReferenceTrackedModel):
    """
    AssociatedPersonType - Classification for AssociatedPerson.

    Configurable entity type for categorizing associated persons.
    Examples: Employee, Director, Agent, Salesperson, Accountant, etc.
    """

    name = models.CharField(
        _("name"),
        max_length=100,
        unique=True,
        help_text=_("Type name (e.g., Employee, Director, Agent)"),
    )
    description = models.TextField(
        _("description"),
        blank=True,
        help_text=_("Description of this person type"),
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=AssociatedPersonTypeStatus.choices,
        default=AssociatedPersonTypeStatus.ACTIVE,
    )
    is_default = models.BooleanField(
        _("default"),
        default=False,
        help_text=_("Default type for new associated persons"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("associated person type")
        verbose_name_plural = _("associated person types")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="ap_type_name_idx"),
            models.Index(fields=["status"], name="ap_type_status_idx"),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique reference: APT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(AssociatedPersonType, f"APT-{year}-")

    def save(self, *args, **kwargs):
        """Cycle 25 (state/IMPLEMENTATION_PLAN.md Section 19.4, finding A-8):
        demoting other defaults and saving self used to run without a shared
        transaction, so a failure in super().save() could leave zero default
        types. transaction.atomic makes the pair all-or-nothing.
        """
        with transaction.atomic():
            if self.is_default:
                AssociatedPersonType.objects.filter(is_default=True).update(is_default=False)
            super().save(*args, **kwargs)


class PartyType(models.TextChoices):
    """Type for all party types."""

    CLIENT = "client", _("Client")
    SUPPLIER = "supplier", _("Supplier")
    ASSOCIATED_PERSON = "associated_person", _("Associated Person")
    EXTERNAL_PARTY = "external_party", _("External Party")


class ClientKind(models.TextChoices):
    INDIVIDUAL = "individual", _("Individual")
    ORGANIZATION = "organization", _("Organization")


class Client(ReferenceTrackedModel):
    """
    Client - Customer related to Financial Records or Transactions.

    Represents a customer who can be referenced in financial operations.
    """

    # Identity
    client_kind = models.CharField(
        _("client kind"),
        max_length=20,
        choices=ClientKind.choices,
        default=ClientKind.ORGANIZATION,
        db_index=True,
    )
    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)
    national_id = models.CharField(
        _("national ID"), max_length=100, blank=True, null=True, unique=True
    )
    passport_number = models.CharField(
        _("passport number"), max_length=100, blank=True, null=True, unique=True
    )
    name = models.CharField(
        _("name"),
        max_length=255,
        help_text=_("Client name"),
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
        help_text=_("Official registration number"),
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
        help_text=_("Website URL"),
    )

    # Company linkage (optional)
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clients",
        verbose_name=_("company"),
        help_text=_("Company this client belongs to"),
    )

    # Payment defaults
    default_payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("default payment method"),
    )
    credit_limit = models.DecimalField(
        _("credit limit"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Maximum credit allowed"),
    )
    payment_terms = models.CharField(
        _("payment terms"),
        max_length=100,
        blank=True,
        help_text=_("Default payment terms (e.g., Net 30)"),
    )
    default_currency = models.CharField(
        _("default currency"),
        max_length=3,
        default="MAD",
        help_text=_("ISO 4217 currency code"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PartyStatus.choices,
        default=PartyStatus.ACTIVE,
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("client")
        verbose_name_plural = _("clients")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="client_name_idx"),
            models.Index(fields=["client_kind"], name="client_kind_idx"),
            models.Index(fields=["status"], name="client_status_idx"),
            models.Index(fields=["tax_id"], name="client_tax_id_idx"),
            models.Index(fields=["vat_number"], name="client_vat_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(client_kind=ClientKind.ORGANIZATION) & ~models.Q(name=""))
                | (
                    models.Q(client_kind=ClientKind.INDIVIDUAL)
                    & ~models.Q(first_name="")
                    & ~models.Q(last_name="")
                ),
                name="client_kind_identity_required",
            ),
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_client_reference",
            ),
            models.UniqueConstraint(
                fields=["tax_id"],
                condition=models.Q(tax_id__gt=""),
                name="unique_client_tax_id",
            ),
            models.UniqueConstraint(
                fields=["vat_number"],
                condition=models.Q(vat_number__gt=""),
                name="unique_client_vat_number",
            ),
            models.UniqueConstraint(
                fields=["registration_number"],
                condition=models.Q(registration_number__gt=""),
                name="unique_client_reg_number",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique client reference: CLI-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(Client, f"CLI-{year}-")


class Supplier(ReferenceTrackedModel):
    """
    Supplier - Vendor or service provider.

    Represents a vendor who provides goods or services.
    """

    # Identity
    name = models.CharField(
        _("name"),
        max_length=255,
        help_text=_("Supplier name"),
    )
    trade_name = models.CharField(
        _("trade name"),
        max_length=255,
        blank=True,
        help_text=_("Commercial/trade name"),
    )

    # Legal/Regulatory Identifiers
    registration_number = models.CharField(
        _("registration number"),
        max_length=100,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Official registration number"),
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
        help_text=_("Website URL"),
    )

    # Company linkage (optional)
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suppliers",
        verbose_name=_("company"),
        help_text=_("Company this supplier belongs to"),
    )

    # Payment defaults
    default_payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("default payment method"),
    )
    payment_terms = models.CharField(
        _("payment terms"),
        max_length=100,
        blank=True,
        help_text=_("Default payment terms (e.g., Net 30)"),
    )
    default_currency = models.CharField(
        _("default currency"),
        max_length=3,
        default="MAD",
        help_text=_("ISO 4217 currency code"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PartyStatus.choices,
        default=PartyStatus.ACTIVE,
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("supplier")
        verbose_name_plural = _("suppliers")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="supplier_name_idx"),
            models.Index(fields=["status"], name="supplier_status_idx"),
            models.Index(fields=["tax_id"], name="supplier_tax_id_idx"),
            models.Index(fields=["vat_number"], name="supplier_vat_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_supplier_reference",
            ),
            models.UniqueConstraint(
                fields=["tax_id"],
                condition=models.Q(tax_id__gt=""),
                name="unique_supplier_tax_id",
            ),
            models.UniqueConstraint(
                fields=["vat_number"],
                condition=models.Q(vat_number__gt=""),
                name="unique_supplier_vat_number",
            ),
            models.UniqueConstraint(
                fields=["registration_number"],
                condition=models.Q(registration_number__gt=""),
                name="unique_supplier_reg_number",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique supplier reference: SUP-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(Supplier, f"SUP-{year}-")


class AssociatedPerson(ReferenceTrackedModel):
    """
    AssociatedPerson - Employee, director, agent, or other internal person.

    Represents a person who participates in financial interactions within the platform.
    Can be linked to a User account for notifications and account visibility.
    """

    # Personal Information
    first_name = models.CharField(
        _("first name"),
        max_length=150,
    )
    last_name = models.CharField(
        _("last name"),
        max_length=150,
    )
    middle_name = models.CharField(
        _("middle name"),
        max_length=150,
        blank=True,
    )

    # Identity Documents
    national_id = models.CharField(
        _("national ID"),
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text=_("National identity card number"),
    )
    passport_number = models.CharField(
        _("passport number"),
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Passport number"),
    )

    # Professional Information
    person_type = models.ForeignKey(
        AssociatedPersonType,
        on_delete=models.PROTECT,
        related_name="persons",
        verbose_name=_("person type"),
        help_text=_("Classification of this person"),
    )
    employee_id = models.CharField(
        _("employee ID"),
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text=_("Internal employee identification number"),
    )
    job_title = models.CharField(
        _("job title"),
        max_length=150,
        blank=True,
        help_text=_("Current job title/position"),
    )
    department = models.CharField(
        _("department"),
        max_length=100,
        blank=True,
        help_text=_("Department or division"),
    )
    hire_date = models.DateField(
        _("hire date"),
        null=True,
        blank=True,
        help_text=_("Date of hiring/association"),
    )
    termination_date = models.DateField(
        _("termination date"),
        null=True,
        blank=True,
        help_text=_("Date of termination/separation"),
    )

    # Management Hierarchy
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subordinates",
        verbose_name=_("manager"),
        help_text=_("Direct manager/supervisor"),
    )

    # Contact Information
    email = models.EmailField(
        _("email"),
        blank=True,
        help_text=_("Professional email address for notifications"),
    )
    phone = models.CharField(
        _("phone"),
        max_length=50,
        blank=True,
        help_text=_("Phone number"),
    )
    mobile = models.CharField(
        _("mobile"),
        max_length=50,
        blank=True,
        help_text=_("Mobile phone number"),
    )
    address = models.TextField(
        _("address"),
        blank=True,
        help_text=_("Home address"),
    )

    # User Account Linking
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="associated_person",
        verbose_name=_("user account"),
        help_text=_("Linked platform user account"),
    )

    # Company linkage (optional)
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="associated_persons",
        verbose_name=_("company"),
        help_text=_("Company this person is associated with"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PartyStatus.choices,
        default=PartyStatus.ACTIVE,
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("associated person")
        verbose_name_plural = _("associated persons")
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["last_name", "first_name"], name="ap_name_idx"),
            models.Index(fields=["status"], name="ap_status_idx"),
            models.Index(fields=["national_id"], name="ap_national_id_idx"),
            models.Index(fields=["email"], name="ap_email_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_associated_person_reference",
            ),
            models.UniqueConstraint(
                fields=["national_id"],
                condition=models.Q(national_id__gt=""),
                name="unique_ap_national_id",
            ),
            models.UniqueConstraint(
                fields=["passport_number"],
                condition=models.Q(passport_number__gt=""),
                name="unique_ap_passport_number",
            ),
            models.UniqueConstraint(
                fields=["employee_id"],
                condition=models.Q(employee_id__gt=""),
                name="unique_ap_employee_id",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.get_full_name()}"

    def get_full_name(self):
        """Return full name."""
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(p for p in parts if p)

    @property
    def full_name(self):
        """Property alias so serializers can use .full_name directly."""
        return self.get_full_name()

    def generate_reference(self):
        """Generate unique associated person reference: AP-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(AssociatedPerson, f"AP-{year}-")

    def get_absolute_url(self):
        return f"/api/v1/parties/associated-persons/{self.id}/"


class ExternalParty(ReferenceTrackedModel):
    """
    ExternalParty - Counterparty not represented by other party types.

    Used for one-off or occasional counterparties who don't fit
    into Client, Supplier, or AssociatedPerson categories.
    """

    # Identity
    name = models.CharField(
        _("name"),
        max_length=255,
        help_text=_("Party name"),
    )
    trade_name = models.CharField(
        _("trade name"),
        max_length=255,
        blank=True,
        help_text=_("Commercial/trade name"),
    )

    # Categorization
    party_category = models.CharField(
        _("party category"),
        max_length=100,
        blank=True,
        help_text=_("Category for grouping (e.g., 'Freelancer', 'Government Agency')"),
    )

    # Identity Documents
    tax_id = models.CharField(
        _("tax ID"),
        max_length=100,
        blank=True,
        help_text=_("Tax identification number"),
    )
    vat_number = models.CharField(
        _("VAT number"),
        max_length=100,
        blank=True,
        help_text=_("Value Added Tax number"),
    )

    # Contact Information
    email = models.EmailField(
        _("email"),
        blank=True,
        help_text=_("Contact email"),
    )
    phone = models.CharField(
        _("phone"),
        max_length=50,
        blank=True,
        help_text=_("Contact phone"),
    )
    address = models.TextField(
        _("address"),
        blank=True,
        help_text=_("Physical address"),
    )

    # Classification
    is_recurring = models.BooleanField(
        _("recurring"),
        default=False,
        help_text=_("Whether this party is used frequently"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PartyStatus.choices,
        default=PartyStatus.ACTIVE,
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("external party")
        verbose_name_plural = _("external parties")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="ext_party_name_idx"),
            models.Index(fields=["party_category"], name="ext_party_cat_idx"),
            models.Index(fields=["is_recurring"], name="ext_party_recurring_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_external_party_reference",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate unique external party reference: EXT-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(ExternalParty, f"EXT-{year}-")
