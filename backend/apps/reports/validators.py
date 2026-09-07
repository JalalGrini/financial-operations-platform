# apps/reports/validators.py
"""Reports Engine business rules, stated once and reused by the service
layer. These raise Django ValidationError, translated by views._as_drf_error
into a 400 so a refused rule is actionable rather than indistinguishable
from a crash - the same convention as apps.treasury.validators.
"""
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from apps.financial_records.models import FinancialRecord


def validate_period(*, period_start, period_end):
    if period_start is None or period_end is None:
        raise ValidationError(_("Both a period start and period end are required."))
    if period_end < period_start:
        raise ValidationError(_("Period end cannot be before period start."))


def validate_report_not_archived(report):
    if report.is_archived:
        raise ValidationError(_("This report is archived and cannot be regenerated."))


def validate_version_is_editable(version):
    """Blueprint Section 13/20: approved, current-official, and outdated
    versions are historical facts. Only Preview and Pending Review versions
    may still be changed."""
    if not version.is_editable:
        raise ValidationError(
            _("This report version has already been reviewed and can no longer be modified.")
        )


def validate_can_submit_for_review(version):
    from apps.reports.models import ReportLifecycleStatus

    if version.status != ReportLifecycleStatus.PREVIEW:
        raise ValidationError(_("Only a Preview version can be submitted for review."))


def validate_can_approve(version):
    """Blueprint Section 7: approval is a reviewer act, distinct from
    generation. Only a Pending Review version may be approved."""
    from apps.reports.models import ReportLifecycleStatus

    if version.status != ReportLifecycleStatus.PENDING_REVIEW:
        raise ValidationError(_("Only a version pending review can be approved."))


def validate_financial_records_are_posted(financial_record_ids):
    """Blueprint Section 1/7: reports are generated only from approved
    (posted) Financial Records, never from drafts, and never hand-written.
    """
    if not financial_record_ids:
        return
    non_posted = FinancialRecord.objects.filter(id__in=financial_record_ids).exclude(
        status=FinancialRecord.Status.POSTED
    )
    if non_posted.exists():
        raise ValidationError(
            _(
                "Reports can only be generated from posted Financial Records. "
                "%(count)d referenced record(s) are not posted."
            )
            % {"count": non_posted.count()}
        )


def validate_regeneration_reason(reason):
    if not reason or not str(reason).strip():
        raise ValidationError(
            _("A regeneration reason is required when superseding an existing version.")
        )


def validate_approval_notes_for_rejection(*, approved, notes):
    if not approved and (not notes or not str(notes).strip()):
        raise ValidationError(
            _("Notes are required when a report version is rejected rather than approved.")
        )
