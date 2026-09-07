# apps/financial_records/selectors.py
"""
Read operations for the Financial Records domain.

Selectors never write. They exist so views and reports share one definition of
what "the posted records for this company" means, rather than each rebuilding a
slightly different queryset.
"""

from decimal import Decimal

from django.db.models import Sum

from apps.financial_records.models import FinancialRecord, FinancialRecordLine

ZERO = Decimal("0.0000")


def all_records():
    """Every record, with the joins list/detail views always need."""
    return (
        FinancialRecord.all_objects.select_related(
            "company", "record_type", "template", "category", "client", "supplier"
        )
        .prefetch_related("lines", "attachments")
        .all()
    )


def active_records():
    """Every non-archived record, preserving the canonical eager loading."""
    return all_records().filter(is_archived=False)


def records_for_company(company):
    return active_records().filter(company=company)


def posted_records():
    return active_records().filter(status=FinancialRecord.Status.POSTED)


def record_balance(record):
    """Debits minus credits for one record.

    Zero for any balanced record. A non-zero result on a *posted* record means
    something bypassed the posting service and the books are wrong, which is
    worth being able to detect cheaply.
    """
    totals = FinancialRecordLine.objects.filter(record=record).aggregate(
        debit=Sum("debit"),
        credit=Sum("credit"),
    )
    return (totals["debit"] or ZERO) - (totals["credit"] or ZERO)


def unbalanced_posted_records():
    """Posted records whose lines do not balance.

    This should always be empty. It is a cheap integrity probe for the health
    endpoint and for reconciliation reports.
    """
    offenders = []
    for record in posted_records():
        if record_balance(record) != ZERO:
            offenders.append(record)
    return offenders


def company_totals(company):
    """Posted totals for a company, as Decimal."""
    total = posted_records().filter(company=company).aggregate(total=Sum("total_amount"))["total"]
    return total or ZERO
