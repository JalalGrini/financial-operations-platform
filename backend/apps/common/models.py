# apps/common/models.py
"""
Common abstract base models for the Financial Operations Platform.

These models provide reusable infrastructure for:
- UUID primary keys
- Created/updated timestamps
- Soft archive functionality
- Creator/updater tracking
- Active/archived managers
- Reference code generation strategy
"""
import uuid

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class UUIDModel(models.Model):
    """
    Abstract base model that uses UUID as primary key.

    Rationale:
    - UUIDs prevent enumeration attacks on business entities.
    - UUIDs work well in distributed systems and avoid primary key collisions.
    - Human-facing references are handled separately via reference codes.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name=_("ID"),
    )

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class TimeStampedModel(models.Model):
    """
    Abstract base model that provides created_at and updated_at timestamps.

    Rationale:
    - Every business entity needs audit timestamps.
    - Using a shared base ensures consistent naming and behavior.
    - auto_now_add and auto_now handle timezone-aware timestamps automatically.
    """

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_("Created at"),
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_("Updated at"),
    )

    class Meta:
        abstract = True


class SoftArchiveModel(models.Model):
    """
    Abstract base model that provides soft archive (soft delete) functionality.

    Fields:
    - is_archived: Boolean flag indicating archived status
    - archived_at: Timestamp when the record was archived
    - archived_by: User who performed the archive action

    Rationale:
    - Business data should never be hard-deleted by normal workflows.
    - Archive preserves referential integrity and audit trail.
    - Archived records are excluded from default querysets.
    """

    is_archived = models.BooleanField(
        default=False,
        verbose_name=_("Archived"),
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Archived at"),
    )
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_archived_by",
        verbose_name=_("Archived by"),
    )

    class Meta:
        abstract = True

    def archive(self, user=None, reason: str = ""):
        """Archive this instance.

        Cycle 25 (state/IMPLEMENTATION_PLAN.md Section 19.4, finding A-9):
        when a reason is given this performs two saves; a failure on the
        second used to leave the row archived without recording why.
        transaction.atomic makes the pair all-or-nothing.
        """
        with transaction.atomic():
            self.is_archived = True
            self.archived_at = timezone.now()
            self.archived_by = user
            self.save(update_fields=["is_archived", "archived_at", "archived_by"])
            if reason and hasattr(self, "observations"):
                # `observations` is a convention on personnel and company models, not
                # a field this abstract base declares. Guarding by hasattr keeps the
                # reason trail where the field exists and stops archive(reason=...)
                # from raising AttributeError on models that simply do not have it.
                self.observations = (
                    f"{self.observations}\n[Archived: {reason}]"
                    if self.observations
                    else f"[Archived: {reason}]"
                )
                self.save(update_fields=["observations"])

    def restore(self):
        """Restore this instance from archive."""
        self.is_archived = False
        self.archived_at = None
        self.archived_by = None
        self.save(update_fields=["is_archived", "archived_at", "archived_by"])


class CreatorModel(models.Model):
    """
    Abstract base model that tracks who created and last updated the record.

    Rationale:
    - Audit requirements demand knowing who created/modified records.
    - Using SET_NULL preserves record integrity if user is deleted.
    - related_name uses %(class)s to avoid clashes across models.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
        verbose_name=_("Created by"),
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
        verbose_name=_("Updated by"),
    )

    class Meta:
        abstract = True


class ActiveManager(models.Manager):
    """
    Manager that returns only non-archived (active) instances.

    Usage:
        class MyModel(ArchiveModel):
            objects = ActiveManager()
            all_objects = models.Manager()  # Includes archived
    """

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=False)


class ArchivedManager(models.Manager):
    """Manager that returns only archived instances."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=True)


class ActiveQuerySet(models.QuerySet):
    """QuerySet that filters to active (non-archived) instances."""

    def active(self):
        return self.filter(is_archived=False)

    def archived(self):
        return self.filter(is_archived=True)


class ReferenceModel(models.Model):
    """
    Abstract base model that provides a human-readable reference code.

    The reference code is generated using a pluggable strategy pattern
    to avoid race conditions. Subclasses must implement `generate_reference`.

    Rationale:
    - Users work with human-readable codes (e.g., INV-2026-00001), not UUIDs.
    - Reference generation must be concurrency-safe (no count()+1).
    - Strategy pattern allows each business domain to define its own format.
    """

    reference = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name=_("Reference"),
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = self.generate_reference()
        super().save(*args, **kwargs)

    def generate_reference(self):
        """
        Generate a unique reference code.

        Subclasses MUST override this method with a concurrency-safe strategy.
        Recommended approaches:
        - Database sequence (PostgreSQL SEQUENCE)
        - UUID prefix + sequence
        - Timestamp + random component
        - External ID generator service

        Do NOT use count() + 1 or similar race-condition-prone approaches.
        """
        raise NotImplementedError(
            "Subclasses must implement generate_reference() " "with a concurrency-safe strategy."
        )


def generate_sequential_reference(model_cls, prefix, width=5):
    """
    Shared concurrency- and archive-safe sequential reference generator.

    Extracted in Cycle 24 (state/IMPLEMENTATION_PLAN.md Section 18) from the
    strategy already proven correct in `Company.generate_reference`. Twelve
    models had reimplemented this with `Model.objects.filter(...).count() + 1`
    instead of calling something like this, which silently regresses the
    moment any row is archived: `objects` excludes archived rows, but
    `reference` is `unique=True` across *all* rows including archived ones, so
    the next create collides with a soft-deleted row that still occupies its
    reference. This helper is the single implementation going forward so the
    rule can no longer be violated by copy-paste.

    Requires `model_cls` to have an `all_objects` manager (all `ReferenceModel`
    subclasses do, via `ArchiveModel`) and a `reference` field formatted as
    `"{prefix}{NNN...N}"` with a numeric, zero-padded suffix.

    @param model_cls - The concrete model class (e.g. `Category`).
    @param prefix - The full reference prefix, e.g. `f"CAT-{year}-"`.
    @param width - Zero-padding width of the numeric suffix. Defaults to 5.
    @returns A reference string guaranteed unique across `model_cls.all_objects`
        at the time of generation, modulo the same accepted fallback-collision
        risk `Company.generate_reference` already accepted (random fallback
        after `max_retries` contested attempts).
    """
    import random

    from django.db import transaction

    max_retries = 10
    for _attempt in range(max_retries):
        with transaction.atomic():
            last = (
                model_cls.all_objects.select_for_update(nowait=False)
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
            reference = f"{prefix}{num:0{width}d}"
            if not model_cls.all_objects.filter(reference=reference).exists():
                return reference
    return f"{prefix}{random.randint(10 ** (width - 1), 10 ** width - 1)}"


class BaseModel(UUIDModel, TimeStampedModel):
    """
    Base model combining UUID primary key and timestamps.

    Most models should inherit from this or one of its extended variants.
    """

    class Meta:
        abstract = True


class ArchiveModel(BaseModel, SoftArchiveModel):
    """
    Base model with UUID, timestamps, and soft archive.

    Provides:
    - id (UUID)
    - created_at, updated_at
    - is_archived, archived_at, archived_by
    - objects (ActiveManager) - excludes archived
    - all_objects (models.Manager) - includes archived
    """

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True


class TrackedModel(ArchiveModel, CreatorModel):
    """
    Full-featured base model with UUID, timestamps, archive, and creator tracking.

    Use for core business entities that require full audit trail.
    """

    class Meta:
        abstract = True


class ReferenceTrackedModel(TrackedModel, ReferenceModel):
    """
    Full-featured base model with reference code generation.

    Use for entities that need human-readable reference codes
    (Financial Records, Treasury Transactions, Reports, etc.).
    """

    class Meta:
        abstract = True


class CustomFieldsModel(models.Model):
    """Abstract base giving a model administrator-defined attributes.

    Values live in a JSON column, so adding an attribute after deployment is an
    INSERT into a definition table rather than a migration. The definitions
    themselves live in apps.extensibility.

    Deliberate limitation, stated plainly: values here cannot have database
    foreign keys or unique constraints, and querying them is far better on
    PostgreSQL JSONB than on SQLite, where the `__contains` lookup does not
    work at all. Anything requiring referential integrity belongs in a real
    migrated column.
    """

    custom_fields = models.JSONField(
        _("custom fields"),
        default=dict,
        blank=True,
        help_text=_("Administrator-defined attributes for this record."),
    )

    class Meta:
        abstract = True

    def get_custom(self, key, default=None):
        return (self.custom_fields or {}).get(key, default)

    def set_custom(self, key, value):
        if self.custom_fields is None:
            self.custom_fields = {}
        self.custom_fields[key] = value
