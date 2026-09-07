# apps/reports/models.py
"""
Reports Engine domain models (state/IMPLEMENTATION_PLAN.md Section 15).

DESIGN NOTES
------------
CONFIGURATION IS NOT DUPLICATED HERE. `apps.configuration.ReportType` already
models report *definitions* (frequency, template, export formats, available
filters). This app models report *instances*: what was actually generated,
when, by whom, at what version, and which Financial Records back every
computed figure. Re-modelling ReportType here would fork configuration in two
places, the exact duplication the extensibility work exists to prevent.

ARCHIVED IS NOT A STATUS. The blueprint (09_Report_Engine.md Section 10)
lists "Archived" alongside Preview/Pending Review/Approved/Current
Official/Outdated as if it were one more lifecycle value. It is not encoded
that way here: `SoftArchiveModel.is_archived` (inherited from
ReferenceTrackedModel) already provides an orthogonal archived flag used
identically across every other domain in this codebase. Encoding "archived"
twice - once as a status value and once as the shared flag - is exactly the
kind of two-sources-of-truth drift Cycles 16-20 kept finding and fixing
elsewhere; it is not reintroduced here on a brand new module.

ONE CURRENT OFFICIAL PER PERIOD IS A DATABASE CONSTRAINT, NOT ONLY A SERVICE
RULE (blueprint Section 8). Cycles 18, 19 and 20 proved repeatedly that a
service-layer-only guard is bypassable through serializers, bare ORM writes,
and the generic DRF update/destroy path. The partial unique constraint below
is enforced by the database itself and cannot be bypassed by any application
code path, present or future.

VERSIONS ARE APPEND-ONLY (blueprint Section 9/13/20: "Immutable approved
reports", "Historical reports cannot be modified"). No version row is ever
updated once generated except by the approval workflow's own status
transition; the ViewSet layer (views.py) enforces this from its first commit
rather than retrofitting it after a bug is found, which is the one thing this
module can do differently from Financial Records/Treasury/Personnel's own
history.

TRACEABILITY (blueprint Section 11). Every computed figure (ReportValue) is
linked to the Financial Records that produced it (ReportValueSource), so a
user can drill down from "Annual Fuel Expense" to "January Total" to the
twelve underlying Financial Records to each record's own attachment, exactly
as the blueprint's worked example describes.
"""
from decimal import Decimal

from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    CustomFieldsModel,
    ReferenceTrackedModel,
    TrackedModel,
    generate_sequential_reference,
)


class ReportLifecycleStatus(models.TextChoices):
    """The five lifecycle values from blueprint Section 10, minus Archived
    (see module docstring: archived is the shared SoftArchiveModel flag, not
    a sixth status value)."""

    PREVIEW = "preview", _("Preview")
    PENDING_REVIEW = "pending_review", _("Pending Review")
    APPROVED = "approved", _("Approved")
    CURRENT_OFFICIAL = "current_official", _("Current Official")
    OUTDATED = "outdated", _("Outdated")


class ReportGenerationMode(models.TextChoices):
    """Blueprint Section 5: the three generation modes."""

    SCHEDULED = "scheduled", _("Scheduled")
    MANUAL = "manual", _("Manual")
    PREVIEW = "preview", _("Preview")


class ReportCalculationMode(models.TextChoices):
    """Blueprint Section 6: how a partial reporting period is handled."""

    KEEP_MISSING = "keep_missing", _("Keep missing values")
    TREAT_MISSING_AS_ZERO = "treat_missing_as_zero", _("Treat missing periods as zero")


class GeneratedReport(ReferenceTrackedModel, CustomFieldsModel):
    """
    GeneratedReport - the logical report for one (company, report type,
    reporting period). Reference format: RPG-YYYY-NNNNN.

    This row tracks *which version is current*; the versions themselves
    (ReportVersion) hold the actual generated content and are never
    overwritten (blueprint Section 9).
    """

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        related_name="generated_reports",
        verbose_name=_("company"),
    )
    report_type = models.ForeignKey(
        "configuration.ReportType",
        on_delete=models.PROTECT,
        related_name="generated_reports",
        verbose_name=_("report type"),
    )
    period_start = models.DateField(_("period start"))
    period_end = models.DateField(_("period end"))
    period_label = models.CharField(
        _("period label"),
        max_length=50,
        help_text=_("Human-readable period, e.g. '2026-07' or 'FY2026'"),
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ReportLifecycleStatus.choices,
        default=ReportLifecycleStatus.PREVIEW,
    )
    current_version = models.ForeignKey(
        "reports.ReportVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("current version"),
        help_text=_("The latest version generated for this report, regardless of approval status."),
    )
    latest_version_number = models.PositiveIntegerField(
        _("latest version number"),
        default=0,
        help_text=_(
            "Denormalised counter so the next version number never requires a COUNT() race."
        ),
    )

    objects = models.Manager()

    class Meta:
        verbose_name = _("generated report")
        verbose_name_plural = _("generated reports")
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["company", "report_type", "period_start"], name="gr_company_type_period_idx"
            ),
            models.Index(fields=["status"], name="gr_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_generated_report_reference",
            ),
            # Blueprint Section 8: only one Current Official Report may exist
            # for a given company + report type + reporting period. Enforced
            # at the database layer (see module docstring) in addition to the
            # service layer's own check in services.approve().
            models.UniqueConstraint(
                fields=["company", "report_type", "period_start", "period_end"],
                condition=models.Q(
                    status=ReportLifecycleStatus.CURRENT_OFFICIAL, is_archived=False
                ),
                name="unique_current_official_report_per_period",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.report_type_id} - {self.period_label}"

    def generate_reference(self):
        """Generate unique reference: RPG-YYYY-NNNNN"""
        year = timezone.now().year
        return generate_sequential_reference(GeneratedReport, f"RPG-{year}-")


class ReportVersion(TrackedModel):
    """
    ReportVersion - one immutable, append-only generation of a
    GeneratedReport (blueprint Section 9). Version numbers start at 1 and
    never repeat or get reused within a report.
    """

    report = models.ForeignKey(
        GeneratedReport,
        on_delete=models.PROTECT,
        related_name="versions",
        verbose_name=_("report"),
    )
    version_number = models.PositiveIntegerField(_("version number"))
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=ReportLifecycleStatus.choices,
        default=ReportLifecycleStatus.PREVIEW,
    )
    generation_mode = models.CharField(
        _("generation mode"),
        max_length=20,
        choices=ReportGenerationMode.choices,
        default=ReportGenerationMode.MANUAL,
    )
    calculation_mode = models.CharField(
        _("calculation mode"),
        max_length=30,
        choices=ReportCalculationMode.choices,
        default=ReportCalculationMode.KEEP_MISSING,
        help_text=_(
            "How this version handled an incomplete reporting period (blueprint Section 6)."
        ),
    )
    is_partial = models.BooleanField(
        _("is partial"),
        default=False,
        help_text=_("True when the reporting period was incomplete at generation time."),
    )
    missing_periods = models.JSONField(
        _("missing periods"),
        default=list,
        blank=True,
        help_text=_("Sub-periods marked Waiting/Pending/N-A because no data existed yet."),
    )
    payload = models.JSONField(
        _("payload"),
        default=dict,
        blank=True,
        encoder=DjangoJSONEncoder,
        help_text=_(
            "Full computed report snapshot as generated, independent of ReportValue rows. Uses DjangoJSONEncoder because generated values are Decimal, which the default JSON encoder cannot serialize."
        ),
    )
    ready_file = models.FileField(
        _("uploaded ready file"),
        upload_to="private/report-versions/%Y/%m/",
        max_length=500,
        blank=True,
        help_text=_("An uploaded finished report kept beside the generated snapshot."),
    )
    ready_file_name = models.CharField(_("original file name"), max_length=255, blank=True)
    ready_file_content_type = models.CharField(_("content type"), max_length=100, blank=True)
    ready_file_size_bytes = models.PositiveBigIntegerField(_("file size"), default=0)
    generated_at = models.DateTimeField(_("generated at"), default=timezone.now)
    reviewed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_report_versions",
        verbose_name=_("reviewed by"),
    )
    approved_at = models.DateTimeField(_("approved at"), null=True, blank=True)
    notes = models.TextField(_("notes"), blank=True)
    regeneration_reason = models.TextField(
        _("regeneration reason"),
        blank=True,
        help_text=_("Required when this version supersedes a prior one for the same report."),
    )
    outdated_at = models.DateTimeField(_("outdated at"), null=True, blank=True)
    outdated_reason = models.TextField(_("outdated reason"), blank=True)

    class Meta:
        verbose_name = _("report version")
        verbose_name_plural = _("report versions")
        ordering = ["report", "-version_number"]
        indexes = [
            models.Index(fields=["report", "status"], name="rv_report_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["report", "version_number"],
                name="unique_report_version_number",
            ),
        ]

    def __str__(self):
        return f"{self.report.reference} v{self.version_number} ({self.status})"

    @property
    def is_editable(self):
        """Only Preview and Pending Review versions may still be changed.
        Approved, Current Official and Outdated versions are historical facts
        (blueprint Sections 13/20) and are immutable from this point on."""
        return self.status in (ReportLifecycleStatus.PREVIEW, ReportLifecycleStatus.PENDING_REVIEW)


class ReportValue(TrackedModel):
    """
    ReportValue - one computed figure within a ReportVersion (blueprint
    Section 11's "Annual Fuel Expense -> January Total" tree is a set of
    these rows linked by `parent`).
    """

    version = models.ForeignKey(
        ReportVersion,
        on_delete=models.CASCADE,
        related_name="values",
        verbose_name=_("version"),
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name=_("parent value"),
    )
    key = models.CharField(
        _("key"),
        max_length=100,
        help_text=_("Stable machine key, e.g. 'fuel_expense.2026.01'."),
    )
    label = models.CharField(_("label"), max_length=255)
    amount = models.DecimalField(
        _("amount"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0.0000"),
    )
    period_label = models.CharField(_("period label"), max_length=50, blank=True)
    is_available = models.BooleanField(
        _("is available"),
        default=True,
        help_text=_(
            "False for Waiting/Pending/N-A values from an incomplete period (blueprint Section 6)."
        ),
    )

    class Meta:
        verbose_name = _("report value")
        verbose_name_plural = _("report values")
        ordering = ["version", "key"]
        indexes = [
            models.Index(fields=["version", "key"], name="rval_version_key_idx"),
        ]

    def __str__(self):
        return f"{self.version} - {self.key} = {self.amount}"


class ReportValueSource(TrackedModel):
    """
    ReportValueSource - the drill-down edge from a computed ReportValue back
    to the Financial Record that contributed to it (blueprint Section 11).
    """

    value = models.ForeignKey(
        ReportValue,
        on_delete=models.CASCADE,
        related_name="sources",
        verbose_name=_("value"),
    )
    financial_record = models.ForeignKey(
        "financial_records.FinancialRecord",
        # PROTECT, matching the Cycle 18 D-3 precedent for personnel financial
        # foreign keys: a Financial Record that is cited as report evidence
        # must not silently vanish out from under that evidence via CASCADE.
        on_delete=models.PROTECT,
        related_name="report_value_sources",
        verbose_name=_("financial record"),
    )
    contribution_amount = models.DecimalField(
        _("contribution amount"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text=_("This record's own contribution to the parent ReportValue's amount."),
    )

    class Meta:
        verbose_name = _("report value source")
        verbose_name_plural = _("report value sources")
        ordering = ["value", "financial_record"]
        constraints = [
            models.UniqueConstraint(
                fields=["value", "financial_record"],
                name="unique_report_value_source",
            ),
        ]

    def __str__(self):
        return f"{self.value_id} <- {self.financial_record_id}"
