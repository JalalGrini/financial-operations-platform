# apps/reports/signals.py
"""
Reports Engine signals.

Blueprint Section 12: a report must be marked Outdated when a source
Financial Record is modified, archived, restored, recategorised, or has its
amount changed. Decision R-5 (Cycle 21 architect pass,
state/IMPLEMENTATION_PLAN.md Section 15.5): this cannot be service-layer
only, because Cycles 18-20 established as fact that edits reach models
through paths that never call a service (bare ORM writes, generic
serializers). A signal on FinancialRecord catches every save path
regardless of how it was triggered; `selectors.reports_with_outdated_sources`
is the read-only backstop for whatever a signal implementation still misses.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.financial_records.models import FinancialRecord

logger = logging.getLogger(__name__)

# Fields whose change on a Financial Record can invalidate a report that
# cites it (blueprint Section 12): status (posted/cancelled/archived),
# category (recategorisation), and the amount itself.
_INVALIDATING_FIELDS = ("status", "category_id", "total_amount", "is_archived")


@receiver(post_save, sender=FinancialRecord)
def financial_record_post_save_invalidate_reports(sender, instance, created, **kwargs):
    """Mark any Current Official report citing this record as Outdated.

    Skipped on creation: a brand new Financial Record cannot yet be cited by
    any existing report's ReportValueSource rows, so there is nothing to
    invalidate. On update, this fires unconditionally rather than trying to
    diff old vs new field values in the signal itself - `update_fields` is
    not reliably populated by every write path (the exact class of gap this
    signal exists to close), so being conservative and re-checking every
    update is safer than trying to be clever about which fields changed.
    """
    if created:
        return

    from apps.reports.models import GeneratedReport, ReportLifecycleStatus, ReportValueSource
    from apps.reports.services import mark_outdated

    affected_report_ids = (
        ReportValueSource.objects.filter(financial_record_id=instance.pk)
        .values_list("value__version__report_id", flat=True)
        .distinct()
    )
    if not affected_report_ids:
        return

    affected_reports = GeneratedReport.objects.filter(
        pk__in=affected_report_ids, status=ReportLifecycleStatus.CURRENT_OFFICIAL
    )
    if not affected_reports.exists():
        return

    mark_outdated(
        reports=list(affected_reports),
        reason=f"Source Financial Record {instance.reference} was modified.",
    )
    logger.info(
        "Marked %d report(s) outdated after Financial Record %s changed.",
        affected_reports.count(),
        instance.reference,
    )
