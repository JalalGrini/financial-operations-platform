# apps/extensibility/models.py
"""
Runtime extensibility: custom attributes and importable templates.

WHY THIS APP EXISTS
-------------------
Two things must be changeable after the platform is deployed, by an
administrator, without a code release and without a database migration:

1. Templates. The configuration "type" records (financial record types, report
   types, payment methods, transaction types, notification types, categories)
   are business templates the client fills in over time. They must be
   importable and exportable as JSON bundles.

2. Entity attributes. An administrator may need to add an attribute to an
   entity, for example a "domains" attribute on Company, long after launch.

The honest trade-off: attributes added this way live in a JSON column. They
cannot have database-level foreign keys or unique constraints, and filtering on
them is materially better on PostgreSQL (JSONB) than on SQLite, where the
`__contains` lookup is not supported at all. Anything that needs referential
integrity should still be a real migrated column. This system is for genuine
per-deployment attributes, not a substitute for schema design.
"""

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TrackedModel

# Models that may carry administrator-defined attributes. A model qualifies by
# inheriting CustomFieldsModel; this tuple is the allow-list the API and the
# admin UI present, so a typo in an entity label is rejected rather than
# silently creating attributes nothing will ever read.
SUPPORTED_ENTITIES = (
    "companies.Company",
    "financial_records.FinancialRecord",
    "parties.Client",
    "parties.Supplier",
)

# Configuration models that can be delivered as importable templates.
# Restricting this is a security control, not a convenience: template import
# writes to the database, so it must never be able to address an arbitrary
# model such as accounts.User.
IMPORTABLE_TEMPLATE_MODELS = (
    "configuration.Category",
    "configuration.FinancialRecordType",
    "configuration.PaymentMethod",
    "configuration.TransactionType",
    "configuration.ReportType",
    "configuration.NotificationType",
)


class CustomFieldDefinition(TrackedModel):
    """An attribute an administrator added to an entity at runtime.

    The definition lives in a table, so creating one is an ordinary INSERT.
    That is what makes it possible after deployment: no migration, no restart.
    """

    class DataType(models.TextChoices):
        STRING = "string", _("Text (single line)")
        TEXT = "text", _("Text (multi line)")
        INTEGER = "integer", _("Whole number")
        DECIMAL = "decimal", _("Decimal number")
        BOOLEAN = "boolean", _("Yes / No")
        DATE = "date", _("Date")
        CHOICE = "choice", _("Single choice")
        MULTI_CHOICE = "multi_choice", _("Multiple choice")
        EMAIL = "email", _("Email address")
        URL = "url", _("URL")

    entity = models.CharField(
        _("entity"),
        max_length=100,
        db_index=True,
        help_text=_("Which entity this attribute belongs to, e.g. companies.Company"),
    )
    key = models.CharField(
        _("key"),
        max_length=60,
        help_text=_("Machine name used in the API payload, e.g. domains"),
    )
    label = models.CharField(
        _("label"),
        max_length=120,
        help_text=_("Human readable label shown in the interface"),
    )
    description = models.TextField(_("description"), blank=True)

    data_type = models.CharField(
        _("data type"),
        max_length=20,
        choices=DataType.choices,
        default=DataType.STRING,
    )
    is_required = models.BooleanField(_("required"), default=False)
    default_value = models.TextField(
        _("default value"),
        blank=True,
        help_text=_("Applied when the attribute is absent. Stored as text."),
    )
    choices = models.JSONField(
        _("choices"),
        default=list,
        blank=True,
        help_text=_("Allowed values for choice and multi_choice types"),
    )
    max_length = models.PositiveIntegerField(
        _("maximum length"),
        null=True,
        blank=True,
        help_text=_("Optional length limit for text attributes"),
    )

    display_order = models.PositiveIntegerField(_("display order"), default=0)
    is_active = models.BooleanField(
        _("active"),
        default=True,
        db_index=True,
        help_text=_(
            "Deactivate instead of deleting. Existing stored values are kept so "
            "turning an attribute back on does not lose data."
        ),
    )

    class Meta:
        verbose_name = _("custom field definition")
        verbose_name_plural = _("custom field definitions")
        ordering = ["entity", "display_order", "key"]
        indexes = [
            models.Index(fields=["entity", "is_active"], name="cfd_entity_active_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["entity", "key"],
                name="cfd_unique_key_per_entity",
            ),
        ]

    def __str__(self):
        return f"{self.entity}.{self.key}"

    def clean(self):
        """Reject definitions that could never work before they are saved."""
        errors = {}

        if self.entity not in SUPPORTED_ENTITIES:
            errors["entity"] = _(
                "'%(entity)s' does not support custom attributes. Supported: %(list)s"
            ) % {"entity": self.entity, "list": ", ".join(SUPPORTED_ENTITIES)}

        if self.key:
            if not self.key.isidentifier() or self.key.startswith("_"):
                errors["key"] = _(
                    "Key must be a valid identifier: letters, digits and "
                    "underscores, not starting with a digit or an underscore."
                )
            elif self.entity in SUPPORTED_ENTITIES:
                # An attribute that shadows a real column would be invisible:
                # readers would get the column and never the custom value.
                if self.key in self._concrete_field_names():
                    errors["key"] = _(
                        "'%(key)s' is already a real field on %(entity)s. Pick " "another name."
                    ) % {"key": self.key, "entity": self.entity}

        if self.data_type in (self.DataType.CHOICE, self.DataType.MULTI_CHOICE):
            if not self.choices:
                errors["choices"] = _("Choice attributes must define their choices.")
            elif not all(isinstance(choice, str) for choice in self.choices):
                errors["choices"] = _("Choices must be a list of strings.")

        if errors:
            raise ValidationError(errors)

    def _concrete_field_names(self):
        from django.apps import apps as django_apps

        try:
            app_label, model_name = self.entity.split(".")
            model = django_apps.get_model(app_label, model_name)
        except (ValueError, LookupError):
            return set()
        return {field.name for field in model._meta.get_fields()}


class TemplateImportLog(TrackedModel):
    """A record of every template bundle import.

    Imports change business configuration on a live system. Without a log there
    is no way to answer "who changed the report types last Tuesday", which is
    the first question asked when a report starts producing surprising output.
    """

    class Outcome(models.TextChoices):
        APPLIED = "applied", _("Applied")
        DRY_RUN = "dry_run", _("Dry run")
        FAILED = "failed", _("Failed")

    bundle_name = models.CharField(_("bundle name"), max_length=200)
    bundle_version = models.CharField(_("bundle version"), max_length=50, blank=True)
    source = models.CharField(
        _("source"),
        max_length=200,
        blank=True,
        help_text=_("File name or upload origin"),
    )
    outcome = models.CharField(
        _("outcome"),
        max_length=20,
        choices=Outcome.choices,
        default=Outcome.APPLIED,
    )

    created_count = models.PositiveIntegerField(_("created"), default=0)
    updated_count = models.PositiveIntegerField(_("updated"), default=0)
    skipped_count = models.PositiveIntegerField(_("skipped"), default=0)

    details = models.JSONField(
        _("details"),
        default=dict,
        blank=True,
        help_text=_("Per-template outcome and any errors"),
    )

    class Meta:
        verbose_name = _("template import log")
        verbose_name_plural = _("template import logs")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["bundle_name"], name="til_bundle_idx"),
        ]

    def __str__(self):
        return f"{self.bundle_name} ({self.get_outcome_display()})"
