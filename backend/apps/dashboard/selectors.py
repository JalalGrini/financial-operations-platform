# apps/dashboard/selectors.py
"""Read-only aggregation for the Executive Dashboard.

Every selector here composes on top of `financial_records.selectors.
posted_records()` and `reports.selectors.active_reports()` rather than the
raw managers, so BR-023 ("dashboards display only approved Financial
Records and Current Official Reports; Preview reports are excluded") holds
by construction rather than by every caller remembering to filter
(blueprint 02_Business_Rules.md Section 7, decision ED-2).

Money is always grouped and returned per-currency, never collapsed into one
figure - mirroring `treasury.selectors.company_cash_position`. A
FinancialRecord's `currency` is per-record, and this platform has no
exchange-rate source, so summing across currencies would fabricate a number
(decision ED-10; `financial_records.selectors.company_totals` is the
cautionary example of a helper that does this wrong and is unused anywhere
for exactly that reason - decision ED-3).

No caching, no persisted snapshot: Domain Model Section 3.14 says a
Dashboard never stores business data, and computing on every read is what
makes BR-022 ("dashboards update automatically") true for free (decision
ED-1).
"""
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from apps.configuration.models import FinancialRecordType
from apps.financial_records.selectors import posted_records
from apps.reports.models import ReportLifecycleStatus
from apps.reports.selectors import active_reports

ZERO = Decimal("0.0000")

INCOME = FinancialRecordType.RecordNature.INCOME
EXPENSE = FinancialRecordType.RecordNature.EXPENSE


def _scope(*, company=None, start=None, end=None):
    """The one BR-023-safe base queryset every selector below builds on."""
    queryset = posted_records()
    if company is not None:
        queryset = queryset.filter(company=company)
    if start is not None:
        queryset = queryset.filter(record_date__gte=start)
    if end is not None:
        queryset = queryset.filter(record_date__lte=end)
    return queryset


def _amounts_by_currency(queryset, *, nature):
    """{currency: Decimal total} for one nature slice of a queryset.

    A plain dict, not a defaultdict keyed on every known currency: callers
    should not silently observe a currency that no record actually used.
    """
    rows = (
        queryset.filter(record_type__nature=nature)
        .values("currency")
        .annotate(total=Sum("total_amount"))
        .order_by("currency")
    )
    return {row["currency"]: (row["total"] or ZERO) for row in rows}


def revenue_expense_totals(*, company=None, start=None, end=None):
    """Revenue and Expense KPIs (Business Requirements Section 10), plus a
    Net figure - each keyed by currency, never summed across currencies.
    """
    queryset = _scope(company=company, start=start, end=end)
    revenue = _amounts_by_currency(queryset, nature=INCOME)
    expenses = _amounts_by_currency(queryset, nature=EXPENSE)
    net = {
        currency: revenue.get(currency, ZERO) - expenses.get(currency, ZERO)
        for currency in set(revenue) | set(expenses)
    }
    return {"revenue": revenue, "expenses": expenses, "net": net}


def monthly_cash_flow(*, company=None, months=12):
    """Income/Expense per currency, one bucket per calendar month that
    actually has data, oldest of the last `months` such months first.

    Buckets are built from whichever months exist in the data, not a fixed
    window anchored on "today": this is a bookkeeping platform where records
    are frequently entered well after the fact, so anchoring on wall-clock
    time would show empty recent months while real postings for an earlier
    month were simply entered late.
    """
    queryset = _scope(company=company)
    rows = (
        queryset.annotate(month=TruncMonth("record_date"))
        .values("month", "currency", "record_type__nature")
        .annotate(total=Sum("total_amount"))
        .order_by("month")
    )
    buckets = {}
    for row in rows:
        month_key = row["month"]
        if month_key is None:
            continue
        bucket = buckets.setdefault(month_key, {"income": {}, "expense": {}})
        nature = row["record_type__nature"]
        if nature == INCOME:
            bucket["income"][row["currency"]] = row["total"] or ZERO
        elif nature == EXPENSE:
            bucket["expense"][row["currency"]] = row["total"] or ZERO
    ordered_months = sorted(buckets.keys())
    if months:
        ordered_months = ordered_months[-months:]
    return [{"month": month.strftime("%Y-%m"), **buckets[month]} for month in ordered_months]


def company_comparison(*, start=None, end=None):
    """Income/Expense per currency, one row per company with at least one
    posted record in scope. Deliberately not company-filtered - comparing
    companies is the entire point of this widget (Business Requirements
    Section 10: "Company comparison").
    """
    queryset = _scope(start=start, end=end)
    rows = (
        queryset.values("company_id", "company__name", "currency", "record_type__nature")
        .annotate(total=Sum("total_amount"))
        .order_by("company__name")
    )
    companies = {}
    for row in rows:
        company_id = row["company_id"]
        entry = companies.setdefault(
            company_id,
            {
                "company": str(company_id),
                "company_name": row["company__name"],
                "income": {},
                "expense": {},
            },
        )
        nature = row["record_type__nature"]
        if nature == INCOME:
            entry["income"][row["currency"]] = row["total"] or ZERO
        elif nature == EXPENSE:
            entry["expense"][row["currency"]] = row["total"] or ZERO
    return sorted(companies.values(), key=lambda entry: entry["company_name"])


def category_analysis(*, company=None, start=None, end=None):
    """Posted totals grouped by category, per currency. Uncategorised
    records are grouped under a literal "Uncategorized" label rather than
    dropped, so category totals still reconcile against the KPI totals
    above instead of silently under-reporting.
    """
    queryset = _scope(company=company, start=start, end=end)
    rows = (
        queryset.values("category_id", "category__name", "currency")
        .annotate(total=Sum("total_amount"))
        .order_by("category__name")
    )
    categories = {}
    for row in rows:
        category_id = row["category_id"]
        label = row["category__name"] or "Uncategorized"
        entry = categories.setdefault(
            category_id,
            {
                "category": str(category_id) if category_id else None,
                "category_name": label,
                "total": {},
            },
        )
        entry["total"][row["currency"]] = row["total"] or ZERO
    return sorted(categories.values(), key=lambda entry: entry["category_name"])


def recent_posted_records(*, company=None, limit=10):
    """The most recently posted records, newest first.

    Deliberately named and scoped as "recent records", not a general
    "activity feed": no audit-log model exists anywhere in this platform to
    back a broader claim about who did what, when (decision ED-7).
    """
    queryset = (
        _scope(company=company).select_related("company", "record_type", "category")
        # `_scope()` builds on `financial_records.selectors.posted_records()`,
        # which prefetches `lines` for the list views that need line-level
        # detail. This widget only ever renders record-level fields, so that
        # prefetch is dropped here - otherwise every call pays for fetching
        # every line of every one of the (at most `limit`) records for no
        # reason, a cost that is easy to miss because Django skips it
        # entirely when the base queryset happens to return zero rows.
        .prefetch_related(None)
    )
    return list(queryset.order_by("-posted_at", "-record_date", "-id")[: limit or 10])


def report_status_summary(*, company=None):
    """Counts of active (non-archived) reports by lifecycle status - backs
    the "Report status"/"Pending Reports" widgets. Every status is
    represented explicitly with 0 rather than omitted, so a caller can
    render a fixed set of tiles without a KeyError.
    """
    queryset = active_reports()
    if company is not None:
        queryset = queryset.filter(company=company)
    counts = {status: 0 for status in ReportLifecycleStatus.values}
    rows = queryset.values("status").annotate(total=Count("id"))
    for row in rows:
        counts[row["status"]] = row["total"]
    return counts
