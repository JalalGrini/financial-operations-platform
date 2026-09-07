# apps/reports/services.py
"""Reports Engine write operations.

Every state change to a GeneratedReport/ReportVersion goes through this
module, matching the apps.treasury.services convention: the view layer never
calls Model.save() for business state, because the version-immutability rule
and the one-current-official invariant live here (and, for the invariant, in
a database constraint - see models.py) and a direct write would bypass them
silently.

GENERATION ONLY FROM POSTED RECORDS (blueprint Section 1/7). generate() takes
an explicit list of pre-computed values rather than hard-coding a calculation
per report type, because the actual per-report-type aggregation (P&L, cash
flow, etc.) is business logic that belongs to report templates, not to the
engine itself. The engine's job is lifecycle, versioning, traceability and
the official-report invariant; a caller supplies the numbers and which
Financial Records back them.
"""
from django.db import transaction as db_transaction
from django.utils import timezone

from apps.reports.models import (
    GeneratedReport,
    ReportLifecycleStatus,
    ReportValue,
    ReportValueSource,
    ReportVersion,
)
from apps.reports.validators import (
    validate_approval_notes_for_rejection,
    validate_can_approve,
    validate_can_submit_for_review,
    validate_financial_records_are_posted,
    validate_period,
    validate_regeneration_reason,
    validate_report_not_archived,
    validate_version_is_editable,
)


def _get_or_create_report(*, company, report_type, period_start, period_end, period_label):
    validate_period(period_start=period_start, period_end=period_end)
    report, _created = GeneratedReport.objects.get_or_create(
        company=company,
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        defaults={
            "period_label": period_label,
            "status": ReportLifecycleStatus.PREVIEW,
        },
    )
    return report


@db_transaction.atomic
def generate(
    *,
    company,
    report_type,
    period_start,
    period_end,
    period_label,
    values,
    user,
    mode,
    calculation_mode,
    is_partial=False,
    missing_periods=None,
    regeneration_reason="",
):
    """Generate a new, immutable version of a report.

    `values` is a list of dicts: {key, label, amount, is_available,
    period_label, parent_key (optional), source_record_ids (list of
    FinancialRecord ids), source_contributions (optional dict of
    record_id -> Decimal contribution, defaults to the full amount)}.

    Every new version starts life as Preview regardless of `mode` - mode
    only records *how* it was produced (blueprint Section 5); moving past
    Preview always requires the explicit submit_for_review/approve steps
    below, so a generated report can never become official by accident.
    """
    report = _get_or_create_report(
        company=company,
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
    )
    validate_report_not_archived(report)

    if report.latest_version_number > 0:
        validate_regeneration_reason(regeneration_reason)

    all_record_ids = set()
    for row in values:
        all_record_ids.update(row.get("source_record_ids") or [])
    validate_financial_records_are_posted(all_record_ids)

    next_version_number = report.latest_version_number + 1

    version = ReportVersion.objects.create(
        report=report,
        version_number=next_version_number,
        status=ReportLifecycleStatus.PREVIEW,
        generation_mode=mode,
        calculation_mode=calculation_mode,
        is_partial=is_partial,
        missing_periods=missing_periods or [],
        payload={"values": values},
        generated_at=timezone.now(),
        regeneration_reason=regeneration_reason,
        created_by=user,
    )

    key_to_value = {}
    for row in values:
        value = ReportValue.objects.create(
            version=version,
            key=row["key"],
            label=row.get("label", row["key"]),
            amount=row.get("amount") or 0,
            period_label=row.get("period_label", ""),
            is_available=row.get("is_available", True),
            created_by=user,
        )
        key_to_value[row["key"]] = value

    for row in values:
        value = key_to_value[row["key"]]
        parent_key = row.get("parent_key")
        if parent_key and parent_key in key_to_value:
            value.parent = key_to_value[parent_key]
            value.save(update_fields=["parent"])

        source_ids = row.get("source_record_ids") or []
        contributions = row.get("source_contributions") or {}
        for record_id in source_ids:
            ReportValueSource.objects.create(
                value=value,
                financial_record_id=record_id,
                contribution_amount=contributions.get(record_id, row.get("amount") or 0),
                created_by=user,
            )

    previous_current_version = None
    # Generating a new version marks any prior Current Official as Outdated:
    # a report is either being freshly built (Preview) or it is the official
    # record, never both at once for the same GeneratedReport row. This must
    # demote the *version* row too, not only the report - otherwise the
    # superseded version keeps reporting itself as Current Official forever,
    # violating the same one-current-official invariant the partial unique
    # constraint enforces at the report level (R-4).
    if report.status == ReportLifecycleStatus.CURRENT_OFFICIAL:
        report.status = ReportLifecycleStatus.OUTDATED
        previous_current_version = report.current_version
    else:
        report.status = ReportLifecycleStatus.PREVIEW
    report.current_version = version
    report.latest_version_number = next_version_number
    report.updated_by = user
    report.save(
        update_fields=[
            "current_version",
            "latest_version_number",
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    if previous_current_version is not None:
        previous_current_version.status = ReportLifecycleStatus.OUTDATED
        previous_current_version.outdated_at = timezone.now()
        previous_current_version.outdated_reason = regeneration_reason
        previous_current_version.updated_by = user
        previous_current_version.save(
            update_fields=["status", "outdated_at", "outdated_reason", "updated_by", "updated_at"]
        )

    return version


@db_transaction.atomic
def submit_for_review(*, version, user):
    """Preview -> Pending Review (blueprint Section 7)."""
    validate_version_is_editable(version)
    validate_can_submit_for_review(version)

    version.status = ReportLifecycleStatus.PENDING_REVIEW
    version.updated_by = user
    version.save(update_fields=["status", "updated_by", "updated_at"])

    report = version.report
    report.status = ReportLifecycleStatus.PENDING_REVIEW
    report.updated_by = user
    report.save(update_fields=["status", "updated_by", "updated_at"])
    return version


@db_transaction.atomic
def approve(*, version, user, notes="", approved=True):
    """Approve (or reject) a Pending Review version (blueprint Section 7/8).

    On approval: this version becomes Current Official; any other Current
    Official version for the same (company, report_type, period) is demoted
    to Outdated first, inside the same atomic block, so the database is
    never observed with two current officials even transiently. The partial
    unique constraint on GeneratedReport (models.py) is the backstop if this
    service is ever bypassed.

    On rejection: the version returns to Preview so it can be corrected and
    resubmitted; it is never silently discarded, preserving the audit trail.
    """
    validate_can_approve(version)
    validate_approval_notes_for_rejection(approved=approved, notes=notes)

    report = version.report

    if not approved:
        version.status = ReportLifecycleStatus.PREVIEW
        version.notes = notes
        version.reviewed_by = user
        version.updated_by = user
        version.save(update_fields=["status", "notes", "reviewed_by", "updated_by", "updated_at"])

        report.status = ReportLifecycleStatus.PREVIEW
        report.updated_by = user
        report.save(update_fields=["status", "updated_by", "updated_at"])
        return version

    # Demote any existing Current Official for this exact (company,
    # report_type, period) before promoting this one - see docstring above.
    GeneratedReport.objects.filter(
        company=report.company,
        report_type=report.report_type,
        period_start=report.period_start,
        period_end=report.period_end,
        status=ReportLifecycleStatus.CURRENT_OFFICIAL,
    ).exclude(pk=report.pk).update(status=ReportLifecycleStatus.OUTDATED, updated_by=user)

    now = timezone.now()
    version.status = ReportLifecycleStatus.CURRENT_OFFICIAL
    version.notes = notes
    version.reviewed_by = user
    version.approved_at = now
    version.updated_by = user
    version.save(
        update_fields=["status", "notes", "reviewed_by", "approved_at", "updated_by", "updated_at"]
    )

    report.status = ReportLifecycleStatus.CURRENT_OFFICIAL
    report.updated_by = user
    report.save(update_fields=["status", "updated_by", "updated_at"])
    return version


@db_transaction.atomic
def mark_outdated(*, reports, reason, user=None):
    """Blueprint Section 12: flip Current Official reports to Outdated.

    Called by the invalidation signal (signals.py) when a source Financial
    Record is modified/archived/restored/recategorised/amount-changed, and
    available for the drift selector's remediation path too.
    """
    updated = []
    for report in reports:
        if report.status != ReportLifecycleStatus.CURRENT_OFFICIAL:
            continue
        report.status = ReportLifecycleStatus.OUTDATED
        report.updated_by = user
        report.save(update_fields=["status", "updated_by", "updated_at"])
        if report.current_version_id:
            version = report.current_version
            version.outdated_at = timezone.now()
            version.outdated_reason = reason
            version.save(update_fields=["outdated_at", "outdated_reason", "updated_at"])
        updated.append(report)
    return updated


@db_transaction.atomic
def regenerate(
    *, report, reason, user, values, mode, calculation_mode, is_partial=False, missing_periods=None
):
    """Blueprint Section 9: regenerating always creates a brand new version,
    never overwrites an existing one. Thin wrapper around generate() that
    forces the regeneration_reason requirement to be explicit at the call
    site.
    """
    validate_regeneration_reason(reason)
    return generate(
        company=report.company,
        report_type=report.report_type,
        period_start=report.period_start,
        period_end=report.period_end,
        period_label=report.period_label,
        values=values,
        user=user,
        mode=mode,
        calculation_mode=calculation_mode,
        is_partial=is_partial,
        missing_periods=missing_periods,
        regeneration_reason=reason,
    )
