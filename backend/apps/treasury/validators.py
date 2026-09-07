# apps/treasury/validators.py
"""Treasury business rules, stated once and reused by the services.

These raise Django ValidationError. The API layer translates that into a 400
(see views._as_drf_error), so a refused rule is actionable by the client rather
than indistinguishable from a crash.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

ZERO = Decimal("0.0000")


def validate_amount_positive(amount):
    """Zero and negative amounts are refused.

    A zero-amount movement is not a harmless no-op: it pollutes statements and
    reconciliation counts with rows that mean nothing. Negatives are refused
    because direction, not sign, carries meaning in this schema.
    """
    if amount is None:
        raise ValidationError({"amount": _("An amount is required.")})
    if not isinstance(amount, Decimal):
        raise ValidationError(
            {"amount": _("Amounts must be Decimal. Floats are refused to avoid rounding drift.")}
        )
    if amount <= ZERO:
        raise ValidationError({"amount": _("Amount must be strictly greater than zero.")})


def validate_account_is_usable(account):
    """Refuse movements against an account that is out of use.

    Archived and inactive accounts are supposed to be closed to new activity;
    letting drafts accumulate against them silently reopens accounts nobody
    intended to keep using.
    """
    if account.is_archived:
        raise ValidationError(_("This account is archived and cannot take new movements."))
    if not account.is_active:
        raise ValidationError(_("This account is inactive and cannot take new movements."))


def validate_financial_record_matches_account(*, account, financial_record):
    """A payment must settle an invoice belonging to the same company.

    Without this, a movement on Company A's bank account could be attached to
    Company B's invoice, silently corrupting outstanding-balance reporting for
    both companies.
    """
    if financial_record is None:
        return
    if financial_record.company_id != account.company_id:
        raise ValidationError(
            {
                "financial_record": _(
                    "That financial record belongs to a different company than "
                    "this account. Linking them would corrupt outstanding-balance "
                    "reporting for both companies."
                )
            }
        )


def validate_transaction_is_editable(transaction):
    """A posted, reconciled or archived transaction is a historical fact."""
    if transaction.is_reconciled:
        raise ValidationError(
            _(
                "This transaction has been reconciled against a bank statement "
                "and can no longer be modified."
            )
        )
    if transaction.is_archived:
        raise ValidationError(_("An archived transaction cannot be modified."))
    if transaction.status != transaction.Status.DRAFT:
        raise ValidationError(
            _("Only draft transactions can be modified. Cancel and re-issue instead.")
        )


def validate_can_be_posted(transaction):
    """Posting is the moment a movement becomes part of the books."""
    if transaction.status == transaction.Status.POSTED:
        raise ValidationError(_("This transaction has already been posted."))
    if transaction.status == transaction.Status.CANCELLED:
        raise ValidationError(_("A cancelled transaction cannot be posted."))
    if transaction.is_archived:
        raise ValidationError(_("An archived transaction cannot be posted."))
    validate_amount_positive(transaction.amount)
    if not transaction.account.is_active:
        raise ValidationError(_("Cannot post to an inactive account."))


def validate_can_be_cancelled(transaction):
    if transaction.status == transaction.Status.CANCELLED:
        raise ValidationError(_("This transaction is already cancelled."))
    if transaction.is_reconciled:
        raise ValidationError(
            _("A reconciled transaction cannot be cancelled. Reopen the reconciliation first.")
        )


def validate_transfer(*, source_account, destination_account, amount):
    """Rules specific to moving money between two of our own accounts."""
    validate_amount_positive(amount)
    if source_account.pk == destination_account.pk:
        raise ValidationError(_("A transfer needs two different accounts."))
    if source_account.currency != destination_account.currency:
        raise ValidationError(
            _(
                "Cross-currency transfers are not supported yet. Both accounts "
                "must use the same currency, because recording one without an "
                "explicit exchange rate would silently invent one."
            )
        )
    if not source_account.is_active or not destination_account.is_active:
        raise ValidationError(_("Both accounts must be active to transfer between them."))


def validate_currency_matches_account(*, account, currency):
    if currency and currency != account.currency:
        raise ValidationError(
            {
                "currency": _(
                    "Transaction currency must match the account currency. "
                    "Mixing currencies in one account would make its balance meaningless."
                )
            }
        )


def validate_reconciliation_is_open(reconciliation):
    if reconciliation.status != reconciliation.Status.OPEN:
        raise ValidationError(_("This reconciliation is no longer open."))
    if reconciliation.is_archived:
        raise ValidationError(_("An archived reconciliation cannot be modified."))


def validate_transaction_in_period(*, transaction, reconciliation):
    """A transaction can only be reconciled by the period that contains it."""
    if transaction.account_id != reconciliation.account_id:
        raise ValidationError(_("That transaction belongs to a different account."))
    if transaction.status != transaction.Status.POSTED:
        raise ValidationError(_("Only posted transactions can be reconciled."))
    if not (
        reconciliation.period_start <= transaction.transaction_date <= reconciliation.period_end
    ):
        raise ValidationError(_("That transaction falls outside the reconciliation period."))
