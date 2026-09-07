# apps/financial_records/models.py
"""
Financial Records domain models.

DESIGN NOTES
------------
Money is Decimal(18, 4) everywhere, never float. The four decimal places match
the personnel payroll models so amounts can move between the two domains
without a rounding step that silently loses centimes.

Double entry: a record owns lines, and the lines must balance. That invariant is
enforced in the validators/services layer rather than in save(), because a
record is legitimately unbalanced while it is being built up line by line. It
becomes binding at the moment of posting, which is the point the record becomes
part of the books.

Immutability: a posted record is a historical fact. It is never edited and never
hard deleted; corrections happen by cancelling and re-issuing. Archiving is soft
(SoftArchiveModel) so nothing is ever destroyed.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import CustomFieldsModel, ReferenceTrackedModel, TrackedModel

MONEY_MAX_DIGITS = 18
MONEY_DECIMAL_PLACES = 4
ZERO = Decimal("0.0000")


class FinancialDocumentTemplate(TrackedModel):
    """Versioned form/output definition for one financial record type."""

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        PUBLISHED = "published", _("Published")
        ARCHIVED = "archived", _("Archived")

    record_type = models.ForeignKey(
        "configuration.FinancialRecordType",
        on_delete=models.PROTECT,
        related_name="document_templates",
        verbose_name=_("record type"),
    )
    name = models.CharField(_("name"), max_length=200)
    version = models.PositiveIntegerField(_("version"))
    status = models.CharField(
        _("status"), max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    description = models.TextField(_("description"), blank=True)
    effective_from = models.DateField(_("effective from"), null=True, blank=True)
    effective_to = models.DateField(_("effective to"), null=True, blank=True)
    is_default = models.BooleanField(_("default"), default=False)
    output_mapping = models.JSONField(_("output mapping"), default=dict, blank=True)
    published_at = models.DateTimeField(_("published at"), null=True, blank=True)
    published_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_financial_document_templates",
        verbose_name=_("published by"),
    )

    class Meta:
        ordering = ["record_type", "-version"]
        indexes = [
            models.Index(fields=["record_type", "status"], name="fdt_type_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["record_type", "version"], name="fdt_unique_type_version"
            ),
            models.UniqueConstraint(
                fields=["record_type"],
                condition=models.Q(status="published", is_default=True, is_archived=False),
                name="fdt_one_default_published",
            ),
        ]

    def __str__(self):
        return f"{self.record_type} / {self.name} v{self.version}"

    def clean(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError(
                {"effective_to": _("Effective-to must not precede effective-from.")}
            )

    def save(self, *args, **kwargs):
        """Published business content is immutable across every ORM caller."""
        if self.pk:
            previous = FinancialDocumentTemplate.all_objects.filter(pk=self.pk).first()
            if previous and previous.status == self.Status.PUBLISHED:
                immutable = (
                    "record_type_id",
                    "name",
                    "version",
                    "description",
                    "effective_from",
                    "effective_to",
                    "output_mapping",
                )
                changed = [
                    name for name in immutable if getattr(previous, name) != getattr(self, name)
                ]
                if changed:
                    raise ValidationError(
                        _(
                            "Published templates are immutable; create a new version to change: %(fields)s"
                        )
                        % {"fields": ", ".join(changed)}
                    )
        super().save(*args, **kwargs)


class FinancialDocumentTemplateField(TrackedModel):
    """One typed field rendered by a document template."""

    class FieldType(models.TextChoices):
        STRING = "string", _("Text (single line)")
        TEXT = "text", _("Text (multi line)")
        INTEGER = "integer", _("Whole number")
        DECIMAL = "decimal", _("Decimal number")
        BOOLEAN = "boolean", _("Yes / No")
        DATE = "date", _("Date")
        CHOICE = "choice", _("Single choice")
        MULTI_CHOICE = "multi_choice", _("Multiple choice")
        EMAIL = "email", _("Email")
        URL = "url", _("URL")

    template = models.ForeignKey(
        FinancialDocumentTemplate,
        on_delete=models.CASCADE,
        related_name="fields",
        verbose_name=_("template"),
    )
    key = models.CharField(_("key"), max_length=60)
    label = models.CharField(_("label"), max_length=120)
    data_type = models.CharField(
        _("field type"),
        max_length=20,
        choices=FieldType.choices,
        default=FieldType.STRING,
    )
    is_required = models.BooleanField(_("required"), default=False)
    display_order = models.PositiveIntegerField(_("display order"), default=0)
    section = models.CharField(_("section"), max_length=100, blank=True)
    help_text = models.TextField(_("help text"), blank=True)
    default_value = models.JSONField(_("default value"), null=True, blank=True)
    choices = models.JSONField(_("choices"), default=list, blank=True)
    max_length = models.PositiveIntegerField(_("maximum length"), null=True, blank=True)
    validation = models.JSONField(_("validation"), default=dict, blank=True)
    output_mapping = models.JSONField(_("output mapping"), default=dict, blank=True)
    is_active = models.BooleanField(_("active"), default=True)

    class Meta:
        ordering = ["display_order", "key"]
        indexes = [
            models.Index(fields=["template", "display_order"], name="fdtf_template_order_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["template", "key"], name="fdtf_unique_template_key"),
        ]

    def __str__(self):
        return f"{self.template_id}.{self.key}"

    def clean(self):
        errors = {}
        if self.key and (not self.key.isidentifier() or self.key.startswith("_")):
            errors["key"] = _(
                "Use letters, digits, and underscores; do not start with a digit or underscore."
            )
        if self.data_type in {self.FieldType.CHOICE, self.FieldType.MULTI_CHOICE}:
            if not self.choices or not all(isinstance(choice, str) for choice in self.choices):
                errors["choices"] = _("Choice fields require a list of string choices.")
        if errors:
            raise ValidationError(errors)

    def _assert_template_is_draft(self):
        status = (
            FinancialDocumentTemplate.all_objects.filter(pk=self.template_id)
            .values_list("status", flat=True)
            .first()
        )
        if status and status != FinancialDocumentTemplate.Status.DRAFT:
            raise ValidationError(
                _("Fields on a published template are immutable; create a new version.")
            )

    def save(self, *args, **kwargs):
        self._assert_template_is_draft()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self._assert_template_is_draft()
        return super().delete(*args, **kwargs)


class FinancialRecord(ReferenceTrackedModel, CustomFieldsModel):
    """A single financial document: an invoice, an expense, a credit note.

    The record carries the business meaning; the lines carry the accounting.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        POSTED = "posted", _("Posted")
        CANCELLED = "cancelled", _("Cancelled")

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        related_name="financial_records",
        verbose_name=_("company"),
        help_text=_("Company the record belongs to."),
    )
    record_type = models.ForeignKey(
        "configuration.FinancialRecordType",
        on_delete=models.PROTECT,
        related_name="financial_records",
        verbose_name=_("record type"),
        help_text=_("Business type, e.g. Purchase Invoice or Fuel Expense."),
    )
    template = models.ForeignKey(
        FinancialDocumentTemplate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="financial_records",
        verbose_name=_("document template"),
        help_text=_("Published template version used when this record was created."),
    )
    template_snapshot = models.JSONField(
        _("template snapshot"),
        default=dict,
        blank=True,
        help_text=_("Immutable schema snapshot retained for historical interpretation."),
    )
    category = models.ForeignKey(
        "configuration.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="financial_records",
        verbose_name=_("category"),
    )
    # Reusable counterparties (blueprint Section 11): a record can involve a
    # client (e.g., sales invoice) and/or a supplier (e.g., purchase invoice).
    # Both optional and SET_NULL so a record never disappears with a party.
    client = models.ForeignKey(
        "parties.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="financial_records",
        verbose_name=_("client"),
        help_text=_("Client this record relates to (e.g., sales invoice)."),
    )
    supplier = models.ForeignKey(
        "parties.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="financial_records",
        verbose_name=_("supplier"),
        help_text=_("Supplier this record relates to (e.g., purchase invoice)."),
    )

    record_date = models.DateField(
        _("record date"),
        help_text=_("Date the document itself bears, not the date it was keyed in."),
    )
    description = models.CharField(_("description"), max_length=255)
    notes = models.TextField(_("notes"), blank=True)

    currency = models.CharField(
        _("currency"),
        max_length=3,
        default="MAD",
        help_text=_("ISO 4217 code. Mixed-currency records are not supported."),
    )
    # Denormalised total, written only by the posting service from the lines.
    # Stored so that list endpoints and dashboards do not aggregate lines on
    # every read; it is never the source of truth.
    total_amount = models.DecimalField(
        _("total amount"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
        help_text=_("Sum of the debit side. Derived from the lines."),
    )

    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    posted_at = models.DateTimeField(_("posted at"), null=True, blank=True)
    posted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_financial_records",
        verbose_name=_("posted by"),
    )
    cancelled_at = models.DateTimeField(_("cancelled at"), null=True, blank=True)
    cancellation_reason = models.TextField(_("cancellation reason"), blank=True)

    class Meta:
        verbose_name = _("financial record")
        verbose_name_plural = _("financial records")
        ordering = ["-record_date", "-created_at"]
        indexes = [
            models.Index(fields=["company", "status"], name="fr_company_status_idx"),
            models.Index(fields=["record_date"], name="fr_record_date_idx"),
            models.Index(fields=["status", "is_archived"], name="fr_status_arch_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_amount__gte=0),
                name="fr_total_amount_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.description}"

    @property
    def is_editable(self) -> bool:
        """Only drafts may be changed. Posted records are historical facts."""
        return self.status == self.Status.DRAFT

    def generate_reference(self):
        """Generate FRC-YYYY-NNNNN.

        Mirrors the retry strategy used by Company.generate_reference rather
        than count() + 1, which races under concurrent creation.
        """
        from django.db import transaction

        year = timezone.now().year
        prefix = f"FRC-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    FinancialRecord.all_objects.select_for_update(nowait=False)
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
                if not FinancialRecord.all_objects.filter(reference=reference).exists():
                    return reference
        raise RuntimeError(
            "Could not allocate a unique financial record reference after "
            f"{max_retries} attempts."
        )


class FinancialRecordLine(TrackedModel):
    """One side of one entry within a record.

    A line carries either a debit or a credit, never both and never neither.
    Representing both on one row is what allows the balance check to be a simple
    sum, and it is the shape accountants expect.
    """

    record = models.ForeignKey(
        FinancialRecord,
        on_delete=models.CASCADE,
        related_name="lines",
        verbose_name=_("record"),
    )
    line_number = models.PositiveIntegerField(
        _("line number"),
        help_text=_("Ordering within the record, 1-based."),
    )
    description = models.CharField(_("description"), max_length=255, blank=True)
    category = models.ForeignKey(
        "configuration.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="financial_record_lines",
        verbose_name=_("category"),
    )

    debit = models.DecimalField(
        _("debit"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
    )
    credit = models.DecimalField(
        _("credit"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
    )

    class Meta:
        verbose_name = _("financial record line")
        verbose_name_plural = _("financial record lines")
        ordering = ["record", "line_number"]
        indexes = [
            models.Index(fields=["record", "line_number"], name="frl_record_line_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["record", "line_number"],
                name="frl_unique_line_number_per_record",
            ),
            models.CheckConstraint(
                condition=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name="frl_amounts_non_negative",
            ),
            # Exactly one side carries a value. Both-zero and both-positive are
            # each meaningless as an accounting entry, and both are easy to
            # produce from a buggy form, so the database refuses them outright.
            models.CheckConstraint(
                condition=(
                    (models.Q(debit__gt=0) & models.Q(credit=0))
                    | (models.Q(credit__gt=0) & models.Q(debit=0))
                ),
                name="frl_exactly_one_side",
            ),
        ]

    def __str__(self):
        side = f"debit {self.debit}" if self.debit else f"credit {self.credit}"
        return f"{self.record_id} line {self.line_number}: {side}"

    @property
    def signed_amount(self) -> Decimal:
        """Debit positive, credit negative. Sums to zero across a balanced record."""
        return self.debit - self.credit


class Attachment(TrackedModel):
    """A supporting document stored in object storage.

    Only the reference is kept in the database. Binary content belongs in R2:
    storing it in Postgres would bloat backups and make every restore slower for
    no benefit.
    """

    record = models.ForeignKey(
        FinancialRecord,
        on_delete=models.CASCADE,
        related_name="attachments",
        verbose_name=_("record"),
    )
    file_key = models.CharField(
        _("file key"),
        max_length=512,
        help_text=_("Object storage key. Not a URL, so the bucket can move."),
    )
    file_name = models.CharField(_("file name"), max_length=255)
    content_type = models.CharField(_("content type"), max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(_("size in bytes"), default=0)

    class Meta:
        verbose_name = _("attachment")
        verbose_name_plural = _("attachments")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["record"], name="fra_record_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["record", "file_key"],
                name="fra_unique_file_per_record",
            ),
        ]

    def __str__(self):
        return self.file_name
