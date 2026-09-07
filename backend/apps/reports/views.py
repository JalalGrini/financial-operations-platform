from apps.collaboration.querying import TaggedForMeFilterMixin

# apps/reports/views.py
"""
Reports Engine API views.

Every write routes through apps.reports.services, matching
apps.treasury.views: the viewset never calls Model.save() for business
state, because the version-immutability rule and the one-current-official
invariant live in the services (and, for the invariant, in a database
constraint); a view that wrote directly would silently bypass them.

IMMUTABILITY GUARDS SHIPPED FROM THE FIRST COMMIT (decision R-6, Cycle 21
architect pass, state/IMPLEMENTATION_PLAN.md Section 15.6). Cycles 18-20
spent three cycles retrofitting `get_update_block_reason`/
`get_archive_block_reason` onto modules that shipped without them. This
module defines both from day one, on both ViewSets, and is registered in
`apps.common.tests.test_soft_delete_guard`'s structural guard sets in the
same commit, specifically to avoid repeating that hardening loop.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.reports.models import ReportLifecycleStatus, ReportVersion
from apps.reports.permissions import CanApproveReports, CanManageReports
from apps.reports.selectors import (
    reports_with_outdated_sources,
    search_reports,
    values_for_version,
)
from apps.reports.serializers import (
    ApproveReportVersionSerializer,
    GeneratedReportDetailSerializer,
    GeneratedReportSerializer,
    GenerateReportSerializer,
    RegenerateReportSerializer,
    ReportValueSerializer,
    ReportVersionDetailSerializer,
    ReportVersionSerializer,
    UploadReadyReportSerializer,
)
from apps.reports.services import approve, generate, regenerate, submit_for_review


def _as_drf_error(exc):
    """Translate a service-layer refusal into a DRF 400 (same convention as
    apps.treasury.views._as_drf_error)."""
    if isinstance(exc, DjangoValidationError):
        return DRFValidationError(getattr(exc, "messages", [str(exc)]))
    return DRFValidationError([str(exc)])


# Statuses that make a report/version a historical fact (blueprint Sections
# 13/20): never archived or purged through the generic API, and a version in
# one of these is never editable (see ReportVersion.is_editable).
_IMMUTABLE_REPORT_STATUSES = (
    ReportLifecycleStatus.APPROVED,
    ReportLifecycleStatus.CURRENT_OFFICIAL,
    ReportLifecycleStatus.OUTDATED,
)


class GeneratedReportViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """Reports: generation, search, and the read-only drift report.

    Read-only from the generic API on purpose (`http_method_names` omits
    put/patch): identity, period, and status only ever change through the
    explicit `generate`/`regenerate`/versions-`approve` actions below, which
    route through the service layer. This makes `get_update_block_reason`
    unreachable in practice, but it is still defined (returning a permanent
    block) so the structural guard's expectations are met explicitly rather
    than by omission, and so a future relaxation of `http_method_names`
    does not silently reopen the generic PATCH path.
    """

    permission_classes = [IsAuthenticated, CanManageReports]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return GeneratedReportDetailSerializer
        if self.action == "generate":
            return GenerateReportSerializer
        if self.action == "regenerate":
            return RegenerateReportSerializer
        if self.action == "upload_ready":
            return UploadReadyReportSerializer
        return GeneratedReportSerializer

    def get_queryset(self):
        return (
            search_reports(
                company=self.request.query_params.get("company"),
                report_type=self.request.query_params.get("report_type"),
                year=self.request.query_params.get("year"),
                month=self.request.query_params.get("month"),
                status=self.request.query_params.get("status"),
            )
            .select_related("company", "report_type", "current_version")
            .prefetch_related("versions")
        )

    def get_archive_block_reason(self, instance):
        """Blueprint Section 13/20: an approved, current-official, or
        outdated report is a historical fact and is never archived or
        purged through the generic API."""
        if instance.status in _IMMUTABLE_REPORT_STATUSES:
            return _(
                "Cannot archive or delete a report that has been reviewed. It is part of the permanent record."
            )
        return None

    def get_update_block_reason(self, instance):
        """See the class docstring: the generic update/partial_update path
        is already closed by `http_method_names`, but this is still defined
        explicitly (decision R-6) rather than left to the mixin default.
        """
        return _("Reports are never edited directly. Use generate/regenerate instead.")

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate a new Preview version of a report (blueprint Section 5).

        Submitting for review and approval are separate, explicit steps
        (see the versions ViewSet below) so a freshly generated report can
        never become official by accident.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            version = generate(user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(ReportVersionDetailSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="upload-ready")
    def upload_ready(self, request):
        """Upload a finished report while preserving the normal review flow."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        upload = data.pop("file")
        try:
            version = generate(
                user=request.user,
                values=[],
                mode="manual",
                calculation_mode="keep_missing",
                **data,
            )
            version.ready_file = upload
            version.ready_file_name = upload.name
            version.ready_file_content_type = getattr(upload, "content_type", "") or ""
            version.ready_file_size_bytes = upload.size
            version.updated_by = request.user
            version.save(
                update_fields=[
                    "ready_file",
                    "ready_file_name",
                    "ready_file_content_type",
                    "ready_file_size_bytes",
                    "updated_by",
                    "updated_at",
                ]
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(ReportVersionDetailSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def regenerate(self, request, pk=None):
        """Regenerate a report (blueprint Section 9): always creates a new
        version, never overwrites the current one."""
        report = self.get_object()
        serializer = RegenerateReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # No identity fields to strip any more: RegenerateReportSerializer no
        # longer inherits them from GenerateReportSerializer, because
        # regenerate() derives company/report_type/period from `report`
        # itself. The pops that used to live here were discarding fields the
        # serializer had just forced the client to supply.
        data = dict(serializer.validated_data)

        try:
            version = regenerate(
                report=report, user=request.user, reason=data.pop("regeneration_reason"), **data
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(ReportVersionDetailSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="outdated-drift")
    def outdated_drift(self, request):
        """Current Official reports whose sources changed without the
        status flipping to Outdated (blueprint Section 12; decision R-5,
        Cycle 21 architect pass) - the read-only integrity probe mirroring
        treasury's `balance-drift` and personnel's `total-paid-drift`.
        """
        drifted = reports_with_outdated_sources()
        payload = [
            {
                "report": GeneratedReportSerializer(report).data,
                "version_number": version.version_number,
                "stale_financial_record_ids": [str(fid) for fid in stale_ids],
            }
            for report, version, stale_ids in drifted
        ]
        return Response(payload)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        report = self.get_object()
        if not report.is_archived:
            return Response(
                {"detail": _("This report is not archived.")}, status=status.HTTP_400_BAD_REQUEST
            )
        report.restore()
        return Response(GeneratedReportSerializer(report).data)


class ReportVersionViewSet(viewsets.ReadOnlyModelViewSet):
    """Report versions: read-only plus the explicit review workflow
    actions. Read-only (`ReadOnlyModelViewSet`) rather than a
    `ModelViewSet` with guards bolted on, because a version is never
    created, edited, archived, or deleted directly through this API at
    all - not even in its Preview state. It is only ever produced by
    `GeneratedReportViewSet.generate`/`regenerate` and transitioned by the
    actions below, so there is no generic write path to close in the first
    place (decision R-6 taken one step further than the mixin pattern:
    the safest generic PATCH/DELETE is one that literally does not exist).
    """

    permission_classes = [IsAuthenticated, CanManageReports]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReportVersionDetailSerializer
        return ReportVersionSerializer

    def get_queryset(self):
        queryset = ReportVersion.objects.filter(is_archived=False).select_related(
            "report", "reviewed_by"
        )
        report_id = self.request.query_params.get("report")
        if report_id:
            queryset = queryset.filter(report_id=report_id)
        version_number = self.request.query_params.get("version_number")
        if version_number:
            queryset = queryset.filter(version_number=version_number)
        mode = self.request.query_params.get("mode")
        if mode:
            queryset = queryset.filter(generation_mode=mode)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    @action(detail=True, methods=["post"], url_path="submit-for-review")
    def submit_for_review(self, request, pk=None):
        """Preview -> Pending Review (blueprint Section 7)."""
        version = self.get_object()
        try:
            version = submit_for_review(version=version, user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(ReportVersionDetailSerializer(version).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, CanApproveReports],
    )
    def approve(self, request, pk=None):
        """Approve or reject a Pending Review version (blueprint Section 7).

        Restricted to Administrator/Director (`CanApproveReports`), narrower
        than the module's default `CanManageReports` - an Assistant can
        generate and submit a report but not sign off on it.
        """
        version = self.get_object()
        serializer = ApproveReportVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            version = approve(version=version, user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(ReportVersionDetailSerializer(version).data)

    @action(detail=True, methods=["get"])
    def values(self, request, pk=None):
        """Blueprint Section 11 drill-down tree for this version."""
        version = self.get_object()
        rows = values_for_version(version)
        return Response(ReportValueSerializer(rows, many=True).data)

    @action(detail=True, methods=["get"], url_path="download-ready-file")
    def download_ready_file(self, request, pk=None):
        version = self.get_object()
        if not version.ready_file:
            return Response(
                {"detail": _("No ready file is attached to this report version.")},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            handle = version.ready_file.open("rb")
        except FileNotFoundError:
            return Response(
                {"detail": _("The stored file is unavailable.")},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            handle,
            as_attachment=True,
            filename=version.ready_file_name or version.ready_file.name.rsplit("/", 1)[-1],
            content_type=version.ready_file_content_type or "application/octet-stream",
        )

    @action(detail=False, methods=["get"], url_path="export-xlsx")
    def export_xlsx(self, request):
        """Export a version's values as an Excel workbook (blueprint Section
        15). PDF is deferred to Phase 2 - no reportlab/weasyprint available
        offline (decision R-7, Cycle 21 architect pass).

        Reuses the same openpyxl-based build pattern as
        `apps.personnel.services.ReportService._build_xlsx`, generalised
        here for arbitrary report values rather than duplicated.
        """
        from django.http import HttpResponse

        from apps.reports.xlsx import build_report_version_xlsx

        version_id = request.query_params.get("version")
        if not version_id:
            raise DRFValidationError({"version": _("A version id is required.")})
        version = self.get_queryset().filter(pk=version_id).first()
        if version is None:
            from django.http import Http404

            raise Http404

        rows = list(values_for_version(version))
        workbook_bytes = build_report_version_xlsx(version=version, values=rows)

        response = HttpResponse(
            workbook_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{version.report.reference}-v{version.version_number}.xlsx"'
        )
        return response
