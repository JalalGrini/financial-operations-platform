# apps/reports/selectors.py
"""Read paths for the Reports Engine.

`reports_with_outdated_sources` is an integrity probe, mirroring
`treasury.selectors.accounts_with_balance_drift` and
`personnel.selectors.get_payroll_total_paid_drift`: it recomputes whether a
Current Official report's source Financial Records have changed since
generation, independent of whether the `signals.py` invalidation hook fired.
In a correct system it returns nothing; if it ever returns a row, invalidation
was bypassed somewhere and the report is stale despite still claiming to be
official.
"""
from apps.financial_records.models import FinancialRecord
from apps.reports.models import GeneratedReport, ReportLifecycleStatus, ReportValueSource


def active_reports():
    return GeneratedReport.objects.filter(is_archived=False).select_related(
        "company", "report_type", "current_version"
    )


def reports_for_company(company):
    return active_reports().filter(company=company)


def current_official_reports(company=None):
    queryset = active_reports().filter(status=ReportLifecycleStatus.CURRENT_OFFICIAL)
    if company is not None:
        queryset = queryset.filter(company=company)
    return queryset


def search_reports(
    *,
    company=None,
    report_type=None,
    year=None,
    month=None,
    status=None,
    generated_by=None,
    reviewed_by=None,
):
    """Blueprint Section 14 search surface: company/type/year/month/status/
    generator/reviewer. `version_number` and `mode` are searched on
    ReportVersion directly, not here, since they are per-version attributes.
    """
    queryset = active_reports()
    if company is not None:
        queryset = queryset.filter(company=company)
    if report_type is not None:
        queryset = queryset.filter(report_type=report_type)
    if year is not None:
        queryset = queryset.filter(period_start__year=year)
    if month is not None:
        queryset = queryset.filter(period_start__month=month)
    if status is not None:
        queryset = queryset.filter(status=status)
    if generated_by is not None:
        queryset = queryset.filter(versions__created_by=generated_by).distinct()
    if reviewed_by is not None:
        queryset = queryset.filter(versions__reviewed_by=reviewed_by).distinct()
    return queryset


def versions_for_report(report):
    return report.versions.filter(is_archived=False).order_by("-version_number")


def values_for_version(version):
    return version.values.select_related("parent").prefetch_related("sources__financial_record")


def sources_for_value(value):
    """Blueprint Section 11 drill-down: the Financial Records (and, through
    them, attachments) backing one computed figure."""
    return ReportValueSource.objects.filter(value=value).select_related(
        "financial_record", "financial_record__record_type", "financial_record__category"
    )


def reports_with_outdated_sources():
    """Current Official reports whose backing Financial Records have been
    modified/archived after the report's current version was generated, but
    whose status was never flipped to Outdated.

    Returns a list of (report, version, stale_financial_record_ids) tuples.
    """
    drifted = []
    for report in current_official_reports().select_related("current_version"):
        version = report.current_version
        if version is None:
            continue
        record_ids = (
            ReportValueSource.objects.filter(value__version=version)
            .values_list("financial_record_id", flat=True)
            .distinct()
        )
        if not record_ids:
            continue
        stale_ids = list(
            FinancialRecord.all_objects.filter(id__in=record_ids)
            .filter(models_updated_after(version.generated_at))
            .values_list("id", flat=True)
        )
        if stale_ids:
            drifted.append((report, version, stale_ids))
    return drifted


def models_updated_after(timestamp):
    from django.db.models import Q

    return Q(updated_at__gt=timestamp) | Q(is_archived=True)
