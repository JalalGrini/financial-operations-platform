# apps/treasury/selectors.py
"""Read paths for treasury.

Every money total here is computed in Decimal. Aggregates are given an explicit
DecimalField output_field so the database driver cannot hand back a float and
quietly reintroduce binary rounding into a balance.
"""

from decimal import Decimal

from django.db.models import Case, DecimalField, F, Q, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.treasury.models import Account, Reconciliation, Transaction

MONEY_MAX_DIGITS = 18
MONEY_DECIMAL_PLACES = 4
ZERO = Decimal("0.0000")

_MONEY = DecimalField(max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES)

# Inbound adds, outbound subtracts. Expressed once, reused by every aggregate
# below so the sign convention cannot drift between two queries.
SIGNED_AMOUNT = Case(
    When(direction=Transaction.Direction.OUTBOUND, then=-F("amount")),
    default=F("amount"),
    output_field=_MONEY,
)


def all_accounts():
    return Account.all_objects.select_related("company")


def active_accounts():
    return all_accounts().filter(is_archived=False)


def accounts_for_company(company):
    return active_accounts().filter(company=company)


def all_transactions():
    return Transaction.all_objects.select_related(
        "account", "transaction_type", "payment_method", "financial_record"
    )


def active_transactions():
    return all_transactions().filter(is_archived=False)


def posted_transactions():
    return active_transactions().filter(status=Transaction.Status.POSTED)


def transactions_for_account(account):
    return active_transactions().filter(account=account)


def ledger_balance(account):
    """Recompute an account balance from the ledger itself.

    This is the authoritative number. Account.current_balance is a maintained
    cache of it; when the two disagree, this one is right and something wrote
    outside the service layer.
    """
    total = (
        Transaction.objects.filter(
            account=account,
            status=Transaction.Status.POSTED,
            is_archived=False,
        ).aggregate(total=Coalesce(Sum(SIGNED_AMOUNT), Value(ZERO), output_field=_MONEY))
    )["total"]
    return account.opening_balance + total


def accounts_with_balance_drift():
    """Accounts whose stored balance disagrees with their ledger.

    An integrity probe, not a report. In a correct system this returns an empty
    list forever; if it ever returns a row, the maintained balance has been
    corrupted and the ledger should be trusted over it.

    Returns a list of (account, stored_balance, ledger_balance) tuples.
    """
    drifted = []
    for account in active_accounts():
        computed = ledger_balance(account)
        if computed != account.current_balance:
            drifted.append((account, account.current_balance, computed))
    return drifted


def account_totals(account):
    """Inbound, outbound and net for one account, posted movements only."""
    aggregates = Transaction.objects.filter(
        account=account,
        status=Transaction.Status.POSTED,
        is_archived=False,
    ).aggregate(
        inbound=Coalesce(
            Sum("amount", filter=Q(direction=Transaction.Direction.INBOUND)),
            Value(ZERO),
            output_field=_MONEY,
        ),
        outbound=Coalesce(
            Sum("amount", filter=Q(direction=Transaction.Direction.OUTBOUND)),
            Value(ZERO),
            output_field=_MONEY,
        ),
    )
    aggregates["net"] = aggregates["inbound"] - aggregates["outbound"]
    aggregates["opening_balance"] = account.opening_balance
    aggregates["closing_balance"] = account.opening_balance + aggregates["net"]
    return aggregates


def company_cash_position(company):
    """Total held across a company's accounts.

    Sums the maintained balances rather than recomputing every ledger, because
    this feeds dashboards. Pair it with accounts_with_balance_drift if the
    number is ever in doubt.

    Only accounts sharing a single currency can be meaningfully summed, so the
    result is broken down by currency rather than collapsed into one figure.
    """
    position = {}
    for account in accounts_for_company(company).filter(is_active=True):
        position.setdefault(account.currency, ZERO)
        position[account.currency] += account.current_balance
    return position


def running_balance(account, *, limit=None):
    """Posted movements oldest-first, each with the balance after it.

    This is what a statement view renders. Computed in Python over an ordered
    queryset rather than with a window function, because window support differs
    across the SQLite test database and the PostgreSQL production one, and a
    statement that only balances on one of them is worse than useless.
    """
    queryset = (
        Transaction.objects.filter(
            account=account,
            status=Transaction.Status.POSTED,
            is_archived=False,
        )
        .select_related("transaction_type", "payment_method")
        .order_by("transaction_date", "created_at")
    )
    if limit is not None:
        queryset = queryset[:limit]

    balance = account.opening_balance
    rows = []
    for txn in queryset:
        balance = balance + txn.signed_amount
        rows.append({"transaction": txn, "balance_after": balance})
    return rows


def unreconciled_posted_transactions(account, *, up_to=None):
    """Posted movements not yet tied to a completed reconciliation."""
    queryset = Transaction.objects.filter(
        account=account,
        status=Transaction.Status.POSTED,
        is_archived=False,
        is_reconciled=False,
    )
    if up_to is not None:
        queryset = queryset.filter(transaction_date__lte=up_to)
    return queryset.order_by("transaction_date")


def reconciliation_baseline(reconciliation):
    """The balance a period starts from.

    The closing statement balance of the most recent COMPLETED reconciliation
    that ended before this period began; the account opening balance if there
    is none. The statement figure is used rather than our own computed one
    because the statement is the externally agreed fact, and it is what the
    bank itself carries forward into the next period.
    """
    previous = (
        Reconciliation.objects.filter(
            account=reconciliation.account,
            status=Reconciliation.Status.COMPLETED,
            is_archived=False,
            period_end__lt=reconciliation.period_start,
        )
        .order_by("-period_end")
        .first()
    )
    if previous is not None:
        return previous.statement_balance
    return reconciliation.account.opening_balance


def reconciliation_computed_balance(reconciliation):
    """Ledger balance implied by the entries attached to this reconciliation.

    The period's baseline (see reconciliation_baseline) plus every posted
    movement on the account that has been attached to this reconciliation.
    This is the number that must equal the bank statement before the period
    can be closed.
    """
    total = reconciliation.transactions.filter(
        status=Transaction.Status.POSTED,
        is_archived=False,
    ).aggregate(total=Coalesce(Sum(SIGNED_AMOUNT), Value(ZERO), output_field=_MONEY))["total"]
    return reconciliation_baseline(reconciliation) + total


def open_reconciliations(account=None):
    queryset = Reconciliation.objects.filter(
        status=Reconciliation.Status.OPEN, is_archived=False
    ).select_related("account")
    if account is not None:
        queryset = queryset.filter(account=account)
    return queryset


def transfer_legs(transfer_group):
    """Both sides of a transfer, so a UI can show them as one movement."""
    return active_transactions().filter(transfer_group=transfer_group).order_by("direction")
