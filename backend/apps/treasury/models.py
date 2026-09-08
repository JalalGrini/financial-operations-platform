# apps/treasury/models.py
"""
Treasury domain models: where the money actually sits and moves.

DESIGN NOTES
------------
Money is Decimal(18, 4) everywhere, matching financial_records and personnel so
amounts move between domains without a rounding step that loses centimes.

BALANCE STRATEGY. Account.current_balance is a maintained (denormalised) column
updated by the services under a row lock, NOT a property computed on every read.
A dashboard listing fifty accounts must not run fifty aggregate queries. The
cost of that choice is that the column can drift from the transactions if
anything ever writes outside the service layer, so selectors.py ships a drift
detector (`accounts_with_balance_drift`) that recomputes from the ledger and
reports disagreement. A denormalised total without a drift check is how books
quietly go wrong.

DIRECTION, NOT SIGNED AMOUNTS. `amount` is always positive and the direction is
a separate field. Storing negative amounts invites a missing abs() somewhere to
turn a withdrawal into a deposit. The sign is derived in one place
(`signed_amount`) and nowhere else.

TRANSFERS are two transactions, not one. An outbound leg on the source account
and an inbound leg on the destination, sharing a `transfer_group`. A single
row with two account foreign keys would make every balance query a union of two
different joins forever. The two legs are created in one atomic block.

IMMUTABILITY. A posted transaction is a historical fact; a reconciled one is a
fact someone has signed off against a bank statement. Neither is edited. The
`is_editable` property is the single definition of that rule.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import CustomFieldsModel, ReferenceTrackedModel, TimeStampedModel, UUIDModel

MONEY_MAX_DIGITS = 18
MONEY_DECIMAL_PLACES = 4
ZERO = Decimal("0.0000")


class Account(ReferenceTrackedModel, CustomFieldsModel):
    """A place money sits: a bank account, a cash box, a mobile wallet."""

    class AccountKind(models.TextChoices):
        BANK = "bank", _("Bank account")
        CASH = "cash", _("Cash box")
        WALLET = "wallet", _("Mobile wallet")
        OTHER = "other", _("Other")

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.PROTECT,
        related_name="treasury_accounts",
        verbose_name=_("company"),
    )
    name = models.CharField(_("name"), max_length=150)
    kind = models.CharField(
        _("kind"),
        max_length=20,
        choices=AccountKind.choices,
        default=AccountKind.BANK,
    )
    currency = models.CharField(_("currency"), max_length=3, default="MAD")

    # Bank identification. Deliberately plain text and optional: a cash box has
    # none of it, and validating IBANs per country is a separate concern.
    bank_name = models.CharField(_("bank name"), max_length=150, blank=True)
    account_number = models.CharField(_("account number"), max_length=64, blank=True)
    iban = models.CharField(_("IBAN"), max_length=64, blank=True)
    swift = models.CharField(_("SWIFT/BIC"), max_length=20, blank=True)

    opening_balance = models.DecimalField(
        _("opening balance"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
        help_text=_("Balance at the moment the account was brought onto the platform."),
    )
    current_balance = models.DecimalField(
        _("current balance"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
        help_text=_(
            "Maintained by the treasury services. Never write this directly; "
            "use post_transaction so the ledger and the balance stay in step."
        ),
    )

    is_active = models.BooleanField(_("active"), default=True)
    notes = models.TextField(_("notes"), blank=True)

    class Meta:
        verbose_name = _("account")
        verbose_name_plural = _("accounts")
        ordering = ["company", "name"]
        indexes = [
            models.Index(fields=["company", "is_active"], name="trs_acc_company_active_idx"),
            models.Index(fields=["kind"], name="trs_acc_kind_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                condition=models.Q(is_archived=False),
                name="trs_acc_unique_name_per_company",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.name}"

    def generate_reference(self):
        """Generate ACC-YYYY-NNNNN.

        Mirrors the retry strategy used by Company.generate_reference rather
        than count() + 1, which races under concurrent creation.
        """
        from django.db import transaction

        year = timezone.now().year
        prefix = f"ACC-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    Account.all_objects.select_for_update(nowait=False)
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
                candidate = f"{prefix}{num:05d}"
                if not Account.all_objects.filter(reference=candidate).exists():
                    return candidate
        raise RuntimeError("Could not allocate an account reference after 10 attempts.")


class Reconciliation(ReferenceTrackedModel):
    """A signed-off comparison between our ledger and a bank statement.

    Completing one freezes every transaction attached to it. That is the point:
    a reconciled period is evidence, and evidence that can still be edited is
    not evidence.
    """

    class Status(models.TextChoices):
        OPEN = "open", _("Open")
        COMPLETED = "completed", _("Completed")
        CANCELLED = "cancelled", _("Cancelled")

    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="reconciliations",
        verbose_name=_("account"),
    )
    period_start = models.DateField(_("period start"))
    period_end = models.DateField(_("period end"))

    statement_balance = models.DecimalField(
        _("statement balance"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        help_text=_("Closing balance printed on the bank statement."),
    )
    computed_balance = models.DecimalField(
        _("computed balance"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        default=ZERO,
        help_text=_("Ledger balance at period end, recorded when completed."),
    )

    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)
    completed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_reconciliations",
        verbose_name=_("completed by"),
    )
    notes = models.TextField(_("notes"), blank=True)

    class Meta:
        verbose_name = _("reconciliation")
        verbose_name_plural = _("reconciliations")
        ordering = ["-period_end", "-created_at"]
        indexes = [
            models.Index(fields=["account", "status"], name="trs_rec_account_status_idx"),
            models.Index(fields=["period_end"], name="trs_rec_period_end_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(period_end__gte=models.F("period_start")),
                name="trs_rec_period_end_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.account.name} to {self.period_end}"

    @property
    def difference(self):
        """Statement minus ledger. Zero means the period agrees."""
        return self.statement_balance - self.computed_balance

    @property
    def is_editable(self):
        return self.status == self.Status.OPEN and not self.is_archived

    def generate_reference(self):
        """Generate REC-YYYY-NNNNN."""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"REC-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    Reconciliation.all_objects.select_for_update(nowait=False)
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
                candidate = f"{prefix}{num:05d}"
                if not Reconciliation.all_objects.filter(reference=candidate).exists():
                    return candidate
        raise RuntimeError("Could not allocate a reconciliation reference after 10 attempts.")


class Transaction(ReferenceTrackedModel, CustomFieldsModel):
    """A single movement of money into or out of one account.

    Amount is always positive; `direction` carries the sign. See module notes.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        POSTED = "posted", _("Posted")
        CANCELLED = "cancelled", _("Cancelled")

    class Direction(models.TextChoices):
        INBOUND = "inbound", _("Inbound")
        OUTBOUND = "outbound", _("Outbound")

    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="transactions",
        verbose_name=_("account"),
    )
    transaction_type = models.ForeignKey(
        "configuration.TransactionType",
        on_delete=models.PROTECT,
        related_name="treasury_transactions",
        verbose_name=_("transaction type"),
    )
    payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treasury_transactions",
        verbose_name=_("payment method"),
    )
    financial_record = models.ForeignKey(
        "financial_records.FinancialRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treasury_transactions",
        verbose_name=_("financial record"),
        help_text=_("The invoice or expense this payment settles, if any."),
    )

    direction = models.CharField(_("direction"), max_length=20, choices=Direction.choices)
    amount = models.DecimalField(
        _("amount"),
        max_digits=MONEY_MAX_DIGITS,
        decimal_places=MONEY_DECIMAL_PLACES,
        help_text=_("Always positive. The direction field carries the sign."),
    )
    currency = models.CharField(_("currency"), max_length=3, default="MAD")
    transaction_date = models.DateField(_("transaction date"))
    description = models.CharField(_("description"), max_length=255)
    notes = models.TextField(_("notes"), blank=True)
    external_reference = models.CharField(
        _("external reference"),
        max_length=120,
        blank=True,
        help_text=_("Cheque number, wire reference, receipt number."),
    )

    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    posted_at = models.DateTimeField(_("posted at"), null=True, blank=True)
    posted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_transactions",
        verbose_name=_("posted by"),
    )
    cancelled_at = models.DateTimeField(_("cancelled at"), null=True, blank=True)
    cancellation_reason = models.TextField(_("cancellation reason"), blank=True)

    # Transfer linkage. Both legs of a transfer share this identifier.
    transfer_group = models.UUIDField(
        _("transfer group"),
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Shared by the two legs of an internal transfer."),
    )

    reconciliation = models.ForeignKey(
        Reconciliation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
        verbose_name=_("reconciliation"),
    )
    is_reconciled = models.BooleanField(_("reconciled"), default=False)

    class Meta:
        verbose_name = _("transaction")
        verbose_name_plural = _("transactions")
        ordering = ["-transaction_date", "-created_at"]
        indexes = [
            models.Index(fields=["account", "status"], name="trs_txn_account_status_idx"),
            models.Index(fields=["transaction_date"], name="trs_txn_date_idx"),
            models.Index(fields=["status", "is_archived"], name="trs_txn_status_arch_idx"),
            models.Index(fields=["is_reconciled"], name="trs_txn_reconciled_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=Decimal("0")),
                name="trs_txn_amount_strictly_positive",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.description}"

    @property
    def signed_amount(self):
        """The only place the sign of a transaction is decided."""
        if self.direction == self.Direction.OUTBOUND:
            return -self.amount
        return self.amount

    @property
    def is_editable(self):
        """Draft, unreconciled and unarchived. The single definition of the rule."""
        return self.status == self.Status.DRAFT and not self.is_reconciled and not self.is_archived

    @property
    def is_transfer_leg(self):
        return self.transfer_group is not None

    def generate_reference(self):
        """Generate TRX-YYYY-NNNNN."""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"TRX-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    Transaction.all_objects.select_for_update(nowait=False)
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
                candidate = f"{prefix}{num:05d}"
                if not Transaction.all_objects.filter(reference=candidate).exists():
                    return candidate
        raise RuntimeError("Could not allocate a transaction reference after 10 attempts.")


class DailyBudget(UUIDModel, TimeStampedModel):
    """One cash-on-hand figure per company per calendar day.

    Missing days are treated as carried-over from the last filled date. The
    GET list computes that without writing; a management command persists
    midnight carry-over rows when a scheduler is available.
    """

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="daily_budgets",
        verbose_name=_("company"),
    )
    date = models.DateField(_("date"))
    amount = models.DecimalField(
        _("amount"),
        max_digits=15,
        decimal_places=2,
    )
    filled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="daily_budgets_filled",
        verbose_name=_("filled by"),
    )
    filled_at = models.DateTimeField(_("filled at"), auto_now_add=True)
    note = models.TextField(_("note"), blank=True, default="")
    is_carried_over = models.BooleanField(
        _("carried over"),
        default=False,
        help_text=_("True when this day's amount was copied from a previous day."),
    )

    class Meta:
        verbose_name = _("daily budget")
        verbose_name_plural = _("daily budgets")
        ordering = ["-date", "company__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "date"],
                name="unique_daily_budget_per_company_date",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "date"], name="daily_budget_co_date_idx"),
            models.Index(fields=["date"], name="daily_budget_date_idx"),
        ]

    def __str__(self):
        return f"{self.company_id} {self.date} {self.amount}"

