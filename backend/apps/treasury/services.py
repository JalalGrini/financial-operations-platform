# apps/treasury/services.py
"""Treasury write operations.

Every state change to an account balance goes through this module. The views
never call save() for business state, because the balance invariant and the
immutability rules live here and a direct write would bypass them silently.

LOCKING. post_transaction and the transfer path take select_for_update on the
account row before reading and rewriting current_balance. That read-modify-write
is the classic lost-update race: two concurrent posts both read 1000, both write
their own result, and one movement vanishes from the balance while remaining in
the ledger.

STATED PLAINLY: select_for_update is a no-op on SQLite, which is what the test
suite runs on here. These locks are therefore written correctly but remain
UNPROVEN until the suite runs against PostgreSQL. The drift detector in
selectors.py exists partly because of that gap.
"""

import uuid
from decimal import Decimal

from django.db import transaction as db_transaction
from django.utils import timezone

from apps.treasury.models import Account, Reconciliation, Transaction
from apps.treasury.validators import (
    validate_account_is_usable,
    validate_amount_positive,
    validate_can_be_cancelled,
    validate_can_be_posted,
    validate_currency_matches_account,
    validate_financial_record_matches_account,
    validate_reconciliation_is_open,
    validate_transaction_in_period,
    validate_transaction_is_editable,
    validate_transfer,
)

ZERO = Decimal("0.0000")

EDITABLE_TRANSACTION_FIELDS = (
    "transaction_type",
    "payment_method",
    "financial_record",
    "transaction_date",
    "description",
    "notes",
    "external_reference",
    "amount",
)


def create_account(
    *,
    company,
    name,
    user,
    kind=Account.AccountKind.BANK,
    currency="MAD",
    opening_balance=ZERO,
    **extra,
):
    """Open an account.

    The opening balance seeds current_balance directly rather than through a
    transaction. That is a deliberate simplification: an opening balance is a
    statement of fact from before the platform existed, not a movement anyone
    can point at a counterparty for.
    """
    if not isinstance(opening_balance, Decimal):
        raise ValueError("opening_balance must be Decimal, never float.")
    account = Account(
        company=company,
        name=name,
        kind=kind,
        currency=currency,
        opening_balance=opening_balance,
        current_balance=opening_balance,
        created_by=user,
        **extra,
    )
    account.full_clean(exclude=["reference"])
    account.save()
    return account


def create_transaction(
    *, account, transaction_type, direction, amount, transaction_date, description, user, **extra
):
    """Record a movement as a DRAFT. Nothing hits the balance until posting."""
    validate_account_is_usable(account)
    validate_amount_positive(amount)
    currency = extra.pop("currency", None) or account.currency
    validate_currency_matches_account(account=account, currency=currency)
    validate_financial_record_matches_account(
        account=account, financial_record=extra.get("financial_record")
    )

    txn = Transaction(
        account=account,
        transaction_type=transaction_type,
        direction=direction,
        amount=amount,
        currency=currency,
        transaction_date=transaction_date,
        description=description,
        status=Transaction.Status.DRAFT,
        created_by=user,
        **extra,
    )
    txn.save()
    return txn


def update_transaction(*, transaction, user, **fields):
    """Edit a draft. Refuses anything the editable-field list does not name."""
    validate_transaction_is_editable(transaction)
    for key in fields:
        if key not in EDITABLE_TRANSACTION_FIELDS:
            raise ValueError(
                f"Field '{key}' cannot be edited on a transaction. "
                f"Editable fields are: {', '.join(EDITABLE_TRANSACTION_FIELDS)}."
            )
    if "amount" in fields:
        validate_amount_positive(fields["amount"])
    if "financial_record" in fields:
        validate_financial_record_matches_account(
            account=transaction.account, financial_record=fields["financial_record"]
        )
    for key, value in fields.items():
        setattr(transaction, key, value)
    transaction.updated_by = user
    transaction.save()
    return transaction


@db_transaction.atomic
def post_transaction(*, transaction, user):
    """Post a draft and move the account balance in the same atomic block.

    The lock is taken on the account, not the transaction, because the account
    balance is the contended resource.
    """
    validate_can_be_posted(transaction)

    account = Account.objects.select_for_update().get(pk=transaction.account_id)
    account.current_balance = account.current_balance + transaction.signed_amount
    account.updated_by = user
    account.save(update_fields=["current_balance", "updated_by", "updated_at"])

    transaction.status = Transaction.Status.POSTED
    transaction.posted_at = timezone.now()
    transaction.posted_by = user
    transaction.updated_by = user
    transaction.save(update_fields=["status", "posted_at", "posted_by", "updated_by", "updated_at"])
    transaction.account = account
    return transaction


@db_transaction.atomic
def cancel_transaction(*, transaction, user, reason):
    """Cancel a transaction, reversing its balance effect if it was posted.

    Cancelling a posted movement must give the money back to the account. This
    is the mirror of post_transaction and takes the same lock.
    """
    if not reason or not str(reason).strip():
        raise ValueError("A cancellation reason is required.")
    validate_can_be_cancelled(transaction)

    if transaction.status == Transaction.Status.POSTED:
        account = Account.objects.select_for_update().get(pk=transaction.account_id)
        account.current_balance = account.current_balance - transaction.signed_amount
        account.updated_by = user
        account.save(update_fields=["current_balance", "updated_by", "updated_at"])
        transaction.account = account

    # A cancelled movement must not silently remain part of an in-progress
    # reconciliation; its disappearance from the POSTED filter would change
    # that reconciliation's total underneath whoever is working on it. A
    # transaction attached to a COMPLETED reconciliation never reaches this
    # point because validate_can_be_cancelled already refuses it via
    # is_reconciled, so that path is untouched.
    if transaction.reconciliation_id is not None:
        transaction.reconciliation = None

    transaction.status = Transaction.Status.CANCELLED
    transaction.cancelled_at = timezone.now()
    transaction.cancellation_reason = str(reason).strip()
    transaction.updated_by = user
    transaction.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancellation_reason",
            "reconciliation",
            "updated_by",
            "updated_at",
        ]
    )
    return transaction


@db_transaction.atomic
def transfer_between_accounts(
    *,
    source_account,
    destination_account,
    amount,
    transaction_date,
    description,
    transaction_type,
    user,
    post=True,
):
    """Move money between two of our own accounts as two linked legs.

    Returns (outbound_leg, inbound_leg). Both legs are created and, by default,
    posted inside one atomic block: a transfer that debits one account without
    crediting the other is money destroyed on paper.
    """
    validate_transfer(
        source_account=source_account,
        destination_account=destination_account,
        amount=amount,
    )
    group = uuid.uuid4()

    outbound = create_transaction(
        account=source_account,
        transaction_type=transaction_type,
        direction=Transaction.Direction.OUTBOUND,
        amount=amount,
        transaction_date=transaction_date,
        description=description,
        user=user,
        transfer_group=group,
    )
    inbound = create_transaction(
        account=destination_account,
        transaction_type=transaction_type,
        direction=Transaction.Direction.INBOUND,
        amount=amount,
        transaction_date=transaction_date,
        description=description,
        user=user,
        transfer_group=group,
    )

    if post:
        post_transaction(transaction=outbound, user=user)
        post_transaction(transaction=inbound, user=user)

    return outbound, inbound


def archive_transaction(*, transaction, user, reason=""):
    """Soft archive. Nothing in treasury is ever destroyed."""
    if transaction.status == Transaction.Status.POSTED:
        raise ValueError(
            "A posted transaction cannot be archived. Cancel it first so the "
            "account balance is corrected, then archive."
        )
    transaction.archive(user=user, reason=reason)
    return transaction


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


def open_reconciliation(*, account, period_start, period_end, statement_balance, user, notes=""):
    if not isinstance(statement_balance, Decimal):
        raise ValueError("statement_balance must be Decimal, never float.")
    reconciliation = Reconciliation(
        account=account,
        period_start=period_start,
        period_end=period_end,
        statement_balance=statement_balance,
        notes=notes,
        created_by=user,
    )
    reconciliation.full_clean(exclude=["reference"])
    reconciliation.save()
    return reconciliation


@db_transaction.atomic
def attach_transaction_to_reconciliation(*, reconciliation, transaction, user):
    """Mark one posted transaction as appearing on the statement."""
    validate_reconciliation_is_open(reconciliation)
    validate_transaction_in_period(transaction=transaction, reconciliation=reconciliation)

    transaction.reconciliation = reconciliation
    transaction.updated_by = user
    transaction.save(update_fields=["reconciliation", "updated_by", "updated_at"])
    return transaction


@db_transaction.atomic
def complete_reconciliation(*, reconciliation, user):
    """Freeze the period.

    Refuses to complete while the statement and the ledger disagree. Completing
    a reconciliation that does not balance would record a signature against
    numbers nobody actually agreed on.
    """
    from apps.treasury.selectors import reconciliation_computed_balance

    validate_reconciliation_is_open(reconciliation)

    computed = reconciliation_computed_balance(reconciliation)
    if computed != reconciliation.statement_balance:
        raise ValueError(
            f"Reconciliation does not balance: the statement says "
            f"{reconciliation.statement_balance} but the attached ledger "
            f"entries total {computed}. Difference of "
            f"{reconciliation.statement_balance - computed}."
        )

    attached = list(reconciliation.transactions.all())
    for txn in attached:
        txn.is_reconciled = True
        txn.updated_by = user
        txn.save(update_fields=["is_reconciled", "updated_by", "updated_at"])

    reconciliation.computed_balance = computed
    reconciliation.status = Reconciliation.Status.COMPLETED
    reconciliation.completed_at = timezone.now()
    reconciliation.completed_by = user
    reconciliation.updated_by = user
    reconciliation.save(
        update_fields=[
            "computed_balance",
            "status",
            "completed_at",
            "completed_by",
            "updated_by",
            "updated_at",
        ]
    )
    return reconciliation


@db_transaction.atomic
def reopen_reconciliation(*, reconciliation, user, reason):
    """Unfreeze a completed period so its transactions can be corrected.

    Deliberately requires a reason: reopening signed-off books is exactly the
    kind of action an auditor will ask about later.
    """
    if not reason or not str(reason).strip():
        raise ValueError("A reason is required to reopen a completed reconciliation.")
    if reconciliation.status != Reconciliation.Status.COMPLETED:
        raise ValueError("Only a completed reconciliation can be reopened.")

    for txn in reconciliation.transactions.all():
        txn.is_reconciled = False
        txn.updated_by = user
        txn.save(update_fields=["is_reconciled", "updated_by", "updated_at"])

    reconciliation.status = Reconciliation.Status.OPEN
    reconciliation.completed_at = None
    reconciliation.completed_by = None
    reconciliation.notes = f"{reconciliation.notes}\nReopened: {str(reason).strip()}".strip()
    reconciliation.updated_by = user
    reconciliation.save(
        update_fields=[
            "status",
            "completed_at",
            "completed_by",
            "notes",
            "updated_by",
            "updated_at",
        ]
    )
    return reconciliation
