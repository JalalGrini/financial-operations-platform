# apps/transfers/models.py
"""
Transfers domain models.

DESIGN NOTES
------------
A CashTransfer records the flow of money between two entities within the
platform. Entities can be Companies or Associated Persons (directors,
employees). This budget is a completely isolated variable — it tracks
inter-entity obligations and flows only, separate from Financial Records,
Treasury accounts, and Payroll.

Transfers are NEVER locked: even confirmed transfers can be edited or
archived at any time by authorised users. The status (draft/confirmed)
is informational only — it indicates whether the transfer has been
acknowledged, but does not restrict further modification.

The confirmed transfer amount is considered "taken from the budget" —
the summary endpoint tracks total confirmed flow per entity.
"""

from decimal import Decimal

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    ReferenceTrackedModel,
    TrackedModel,
    generate_sequential_reference,
)

MONEY_MAX_DIGITS = 18
MONEY_DECIMAL_PLACES = 4
ZERO = Decimal("0.0000")


class EntityType(models.TextChoices):
    COMPANY = "company", _("Company")
    ASSOCIATED_PERSON = "associated_person", _("Associated Person")


class TransferStatus(models.TextChoices):
    DRAFT = "draft", _("Draft")
    CONFIRMED = "confirmed", _("Confirmed")


class CashTransfer(ReferenceTrackedModel):
    """
    A single money-flow event between two entities.

    Transfers are NEVER immutable: status is informational only.
    Use archive() to soft-delete; hard delete is not exposed.
    """

    # --- Source entity ---
    from_entity_type = models.CharField(
        _("from entity type"),
        max_length=30,
        choices=EntityType.choices,
        db_index=True,
    )
    from_company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="outgoing_transfers",
        verbose_name=_("from company"),
    )
    from_associated_person = models.ForeignKey(
        "parties.AssociatedPerson",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="outgoing_transfers",
        verbose_name=_("from associated person"),
    )

    # --- Destination entity ---
    to_entity_type = models.CharField(
        _("to entity type"),
        max_length=30,
        choices=EntityType.choices,
        db_index=True,
    )
    to_company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_transfers",
        verbose_name=_("to company"),
    )
    to_associated_person = models.ForeignKey(
        "parties.AssociatedPerson",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_transfers",
        verbose_name=_("to associated person"),
    )

    # --- Transfer details ---
    amount = models.DecimalField(
        _("amount"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
    )
    currency = models.CharField(
        _("currency"),
        max_length=3,
        default="MAD",
    )
    transfer_date = models.DateField(
        _("transfer date"),
        help_text=_("Date the transfer occurred or is planned."),
    )
    note = models.TextField(
        _("note"),
        blank=True,
        help_text=_("Optional free-text note about this transfer."),
    )

    # --- Lifecycle ---
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=TransferStatus.choices,
        default=TransferStatus.DRAFT,
        db_index=True,
    )
    confirmed_at = models.DateTimeField(_("confirmed at"), null=True, blank=True)
    confirmed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_transfers",
        verbose_name=_("confirmed by"),
    )

    class Meta:
        verbose_name = _("cash transfer")
        verbose_name_plural = _("cash transfers")
        ordering = ["-transfer_date", "-created_at"]
        indexes = [
            models.Index(fields=["status", "transfer_date"], name="transfer_status_date_idx"),
            models.Index(fields=["from_entity_type", "transfer_date"], name="transfer_from_type_idx"),
            models.Index(fields=["to_entity_type", "transfer_date"], name="transfer_to_type_idx"),
        ]

    def __str__(self):
        return f"{self.reference} ({self.status}) — {self.amount} {self.currency}"

    def generate_reference(self):
        """Generate TRF-YYYY-NNNNN.

        This override was missing entirely until v17.7 manual testing, which
        meant `ReferenceModel.save()` fell through to the abstract base's
        `generate_reference()` and raised NotImplementedError on *every*
        insert - so no cash transfer could ever be created. Uses the shared
        archive-safe helper rather than a hand-rolled counter, because
        `reference` is unique across archived rows too (Cycle 24 F-1/F-2).

        The year comes from `timezone.now()`, matching every other reference
        generator in the codebase (TRX, CLI, AP, ...), so a back-dated
        `transfer_date` does not produce a reference from a prior year's
        sequence.
        """
        year = timezone.now().year
        return generate_sequential_reference(CashTransfer, f"TRF-{year}-")

    @property
    def from_label(self):
        if self.from_entity_type == EntityType.COMPANY and self.from_company:
            return self.from_company.name
        if self.from_entity_type == EntityType.ASSOCIATED_PERSON and self.from_associated_person:
            return self.from_associated_person.get_full_name()
        return "Unknown"

    @property
    def to_label(self):
        if self.to_entity_type == EntityType.COMPANY and self.to_company:
            return self.to_company.name
        if self.to_entity_type == EntityType.ASSOCIATED_PERSON and self.to_associated_person:
            return self.to_associated_person.get_full_name()
        return "Unknown"

    @property
    def is_editable(self):
        """Transfers are NEVER locked. Always editable."""
        return True


class EntityOpeningBalance(TrackedModel):
    """The starting position of one entity before any transfer is recorded.

    WHY THIS LIVES IN THE TRANSFERS APP
    -----------------------------------
    The obvious alternative was a `transfer_opening_balance` column on
    `companies.Company` and `parties.AssociatedPerson`. That was rejected:
    `CashTransfer`'s module docstring states this budget is deliberately
    isolated from Financial Records, Treasury and Payroll, and putting a
    transfers-domain number on two unrelated core models would leak the
    concept across app boundaries and force migrations there.

    Keeping it here also means the entity pairing rule (`entity_type` selects
    which of the two nullable FKs must be set) is expressed once, next to the
    identical rule on `CashTransfer`.

    Deliberately NOT a `ReferenceTrackedModel`: an opening balance is not a
    document a user cites by code, so it needs no `reference` - and therefore
    cannot reacquire the missing-`generate_reference()` defect that made
    `CashTransfer` unsaveable.

    `amount` is signed: a negative opening balance means the entity started
    owing the group.
    """

    entity_type = models.CharField(
        _("entity type"),
        max_length=30,
        choices=EntityType.choices,
        db_index=True,
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfer_opening_balances",
        verbose_name=_("company"),
    )
    associated_person = models.ForeignKey(
        "parties.AssociatedPerson",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfer_opening_balances",
        verbose_name=_("associated person"),
    )
    amount = models.DecimalField(
        _("opening amount"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
        help_text=_("Signed starting balance. Negative means the entity starts in deficit."),
    )
    currency = models.CharField(_("currency"), max_length=3, default="MAD")
    as_of_date = models.DateField(
        _("as of date"),
        help_text=_("Date this starting position is effective from."),
    )
    note = models.TextField(_("note"), blank=True)

    class Meta:
        verbose_name = _("entity opening balance")
        verbose_name_plural = _("entity opening balances")
        ordering = ["entity_type", "-created_at"]
        constraints = [
            # One opening balance per entity per currency. Partial constraints
            # (condition on the FK being set) are required because the unused
            # side is always NULL, and NULLs do not collide in SQL.
            models.UniqueConstraint(
                fields=["company", "currency"],
                condition=models.Q(company__isnull=False),
                name="opening_balance_unique_company_currency",
            ),
            models.UniqueConstraint(
                fields=["associated_person", "currency"],
                condition=models.Q(associated_person__isnull=False),
                name="opening_balance_unique_person_currency",
            ),
        ]

    def __str__(self):
        return f"{self.entity_label}: {self.amount} {self.currency}"

    @property
    def entity_label(self):
        if self.entity_type == EntityType.COMPANY and self.company:
            return self.company.name
        if self.entity_type == EntityType.ASSOCIATED_PERSON and self.associated_person:
            return self.associated_person.get_full_name()
        return "Unknown"

    @property
    def entity_id(self):
        """The pk of whichever entity this balance belongs to."""
        if self.entity_type == EntityType.COMPANY:
            return self.company_id
        return self.associated_person_id
