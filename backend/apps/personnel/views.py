# apps/personnel/views.py
"""
Personnel API Views.

Implements REST endpoints for Personnel domain:
- Personnel persons
- Employments
- Employment salaries
- Monthly payroll records
- Payroll adjustments
- Payroll payments
- CNSS declarations
- Monthly CNSS declarations
- Reports
- Document references
"""
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.http import FileResponse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.collaboration.querying import TaggedForMeFilterMixin
from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.querying import apply_archive_visibility as _apply_archive_visibility
from apps.personnel.models import (
    CNSSDeclaration,
    CNSSMonthlyDeclaration,
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PayrollStatus,
    PersonnelDocumentReference,
    PersonnelPerson,
)
from apps.personnel.permissions import (
    CanGenerateReports,
    CanManageCNSS,
    CanManagePayroll,
    CanManagePersonnel,
)
from apps.personnel.schema import (
    CNSSMonthlyPreviewResponseSchema,
    DashboardResponseSchema,
    PayrollMonthlyPreviewResponseSchema,
    ReportErrorResponseSchema,
    ReportTypesResponseSchema,
)
from apps.personnel.serializers import (
    CNSSDeclarationDetailSerializer,
    CNSSDeclarationListSerializer,
    CNSSDeclarationSerializer,
    CNSSMonthlyDeclarationSerializer,
    EmploymentCreateSerializer,
    EmploymentDetailSerializer,
    EmploymentSalarySerializer,
    EmploymentSerializer,
    MonthlyPayrollRecordDetailSerializer,
    MonthlyPayrollRecordListSerializer,
    MonthlyPayrollRecordSerializer,
    PayrollAdjustmentSerializer,
    PayrollPaymentSerializer,
    PersonnelDocumentReferenceSerializer,
    PersonnelPersonCreateSerializer,
    PersonnelPersonDetailSerializer,
    PersonnelPersonSerializer,
    ReportExportSerializer,
    ReportPreviewSerializer,
)
from apps.personnel.services import (
    CNSSService,
    EmploymentService,
    MonthlyPayrollService,
    PersonnelService,
    ReportService,
)
from apps.common.querying import apply_date_range

# Cap on list-export rows: generous enough for any real export, small enough
# that a mistaken unbounded export cannot exhaust worker memory.
EXPORT_ROW_CAP = 10_000


def _export_list_response(request, queryset, rows_builder, sheet_name, filename_stem):
    """Shared implementation for the list-page export actions.

    Audit fix: the frontend list pages called POST .../export/ but no such
    endpoint existed, so every list export button 404'd.

    On filters, verified rather than assumed (v17.19): the frontend puts the
    list filters in the export URL's query string, and each of these three
    ViewSets reads those same params by hand inside get_queryset (search,
    company, status, is_active, employment, is_current). So the export has
    always matched the on-screen filters. What get_queryset alone does NOT
    apply is DRF's filter backends, which here means only OrderingFilter --
    no search_fields or filterset_fields are declared. Call sites therefore
    pass filter_queryset(get_queryset()) so `ordering` is honoured too.
    """
    from django.http import HttpResponse

    output_format = (request.query_params.get("output_format") or "xlsx").lower()
    service = ReportService()
    rows, columns = rows_builder(queryset[:EXPORT_ROW_CAP])
    try:
        content, content_type, ext = service.export_rows(rows, columns, sheet_name, output_format)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename_stem}.{ext}"'
    return response


class PersonnelPersonViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for PersonnelPerson."""

    queryset = PersonnelPerson.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManagePersonnel]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    # Real DB columns only. Without this whitelist DRF accepts ordering by any
    # readable serializer field, and computed ones (``full_name``,
    # ``completeness_percentage``) make the ORM raise FieldError -> HTTP 500.
    ordering_fields = [
        "reference",
        "first_name",
        "last_name",
        "cin",
        "status",
        "created_at",
        "updated_at",
    ]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PersonnelPersonDetailSerializer
        elif self.action == "create":
            return PersonnelPersonCreateSerializer
        return PersonnelPersonSerializer

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            PersonnelPerson.all_objects.all(), PersonnelPerson, self.request
        )

        # Filter by company if provided
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(
                employments__company_id=company_id, employments__is_active=True
            ).distinct()

        # Filter by status
        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(cin__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
            )

        # Filter by company
        company = self.request.query_params.get("company")
        if company:
            queryset = queryset.filter(
                employments__company_id=company, employments__is_active=True
            ).distinct()

        # Annotate the two per-row counts the list serializer needs instead of
        # letting it call .count()/.exists() per row (2 extra queries per
        # person; ~40 wasted queries on a full page at PAGE_SIZE=20).
        # PersonnelPersonSerializer reads these annotations when present and
        # falls back to the model helpers otherwise (Cycle 23, N-1).
        return (
            queryset.select_related("created_by", "updated_by", "archived_by")
            .annotate(
                active_employments_count_annotated=Count(
                    "employments",
                    filter=Q(employments__is_active=True, employments__is_archived=False),
                    distinct=True,
                ),
                has_active_cnss_annotated=Exists(
                    CNSSDeclaration.objects.filter(
                        person=OuterRef("pk"),
                        is_currently_declared=True,
                        is_archived=False,
                    )
                ),
            )
            .order_by("reference", "pk")
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a person."""
        person = self.get_object()
        person.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Person archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived person."""
        person = self.get_object()
        if not person.is_archived:
            return Response(
                {"detail": _("This person is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        person.restore()
        return Response({"message": _("Person restored successfully.")})

    @action(detail=True, methods=["get"])
    def completeness(self, request, pk=None):
        """Get completeness report for a person."""
        person = self.get_object()
        service = PersonnelService()
        report = service.get_completeness_report(person)
        return Response(report)

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search personnel by name, CIN, phone, email."""
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return Response({"results": []})

        persons = PersonnelPerson.objects.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(cin__icontains=query)
            | Q(phone__icontains=query)
            | Q(email__icontains=query)
        ).filter(is_archived=False)[:20]

        serializer = PersonnelPersonSerializer(persons, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"])
    def select(self, request):
        """Get personnel select options for dropdowns (lightweight)."""
        search = request.query_params.get("search", "")
        company_id = request.query_params.get("company", "")

        queryset = PersonnelPerson.objects.filter(is_archived=False)
        if company_id:
            queryset = queryset.filter(
                employments__company_id=company_id, employments__is_active=True
            ).distinct()
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(cin__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
            )

        persons = queryset.select_related("created_by")[:100]
        results = []
        for person in persons:
            results.append(
                {
                    "id": str(person.id),
                    "reference": person.reference,
                    "name": person.get_full_name(),
                    "cin": person.cin or "",
                    "current_company": "",
                }
            )
        return Response(results)

    @action(detail=False, methods=["post"])
    def export(self, request):
        """Export the (filtered) personnel list as CSV or XLSX."""
        return _export_list_response(
            request,
            self.filter_queryset(self.get_queryset()),
            ReportService.persons_export,
            "Personnel",
            "personnel_export",
        )


class EmploymentViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for Employment."""

    queryset = Employment.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManagePersonnel]
    ordering_fields = [
        "employee_reference",
        "hire_date",
        "employment_end_date",
        "employment_status",
        "contract_type",
        "is_active",
        "created_at",
        "updated_at",
    ]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return EmploymentDetailSerializer
        elif self.action in {"create", "update", "partial_update"}:
            return EmploymentCreateSerializer
        return EmploymentSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def get_queryset(self):
        queryset = _apply_archive_visibility(Employment.all_objects.all(), Employment, self.request)

        # Filter by person
        person_id = self.request.query_params.get("person")
        if person_id:
            queryset = queryset.filter(person_id=person_id)

        # Filter by company
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        # Filter by active status
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        # Filter by employment status. The list pages send ``status``;
        # ``employment_status`` stays accepted for backward compatibility.
        employment_status = self.request.query_params.get(
            "status"
        ) or self.request.query_params.get("employment_status")
        if employment_status:
            queryset = queryset.filter(employment_status=employment_status)

        # Search by person name/CIN or employee reference
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(person__first_name__icontains=search)
                | Q(person__last_name__icontains=search)
                | Q(person__cin__icontains=search)
                | Q(employee_reference__icontains=search)
            )

        queryset = apply_date_range(queryset, self.request, "hire_date")
        return queryset.select_related("person", "company", "payment_method").prefetch_related(
            "salaries", "payroll_records", "cnss_declarations"
        )

    @action(detail=True, methods=["post"])
    def terminate(self, request, pk=None):
        """Terminate an employment."""
        employment = self.get_object()
        service = EmploymentService()
        employment = service.terminate_employment(
            employment,
            user=request.user,
            departure_reason=request.data.get("departure_reason", ""),
            resignation_date=request.data.get("resignation_date"),
        )
        serializer = EmploymentDetailSerializer(employment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive an employment."""
        employment = self.get_object()
        employment.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Employment archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived employment."""
        employment = self.get_object()
        if not employment.is_archived:
            return Response(
                {"detail": _("This employment is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        employment.restore()
        return Response({"message": _("Employment restored successfully.")})

    @action(detail=False, methods=["post"])
    def export(self, request):
        """Export the (filtered) employments list as CSV or XLSX."""
        return _export_list_response(
            request,
            self.filter_queryset(self.get_queryset()),
            ReportService.employments_export,
            "Employments",
            "employments_export",
        )


class EmploymentSalaryViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for EmploymentSalary.

    Adds archive/restore actions (decision D-0, Cycle 18): this ViewSet
    previously had no way to bring an archived salary back through the API,
    a tracked committed-backlog gap (state/IMPLEMENTATION_PLAN.md Section 5
    and Section 11.6/12.4). Do not revert to hard delete.
    """

    queryset = EmploymentSalary.objects.filter(is_archived=False)
    serializer_class = EmploymentSalarySerializer
    permission_classes = [IsAuthenticated, CanManagePersonnel]
    ordering_fields = [
        "effective_from",
        "effective_to",
        "fixed_monthly_gross_salary",
        "is_current",
        "created_at",
        "updated_at",
    ]

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            EmploymentSalary.all_objects.all(), EmploymentSalary, self.request
        )

        # Filter by employment
        employment_id = self.request.query_params.get("employment")
        if employment_id:
            queryset = queryset.filter(employment_id=employment_id)

        # Filter by company (through the employment)
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(employment__company_id=company_id)

        # The salaries page sends ``status=current|historical``; map it onto
        # the ``is_current`` flag. A raw ``is_current=true|false`` param keeps
        # working and wins when both are present.
        status_param = self.request.query_params.get("status")
        if status_param == "current":
            queryset = queryset.filter(is_current=True)
        elif status_param == "historical":
            queryset = queryset.filter(is_current=False)

        # Filter current only
        is_current = self.request.query_params.get("is_current")
        if is_current is not None:
            queryset = queryset.filter(is_current=is_current.lower() == "true")

        # Search by person name/CIN or employee reference
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(employment__person__first_name__icontains=search)
                | Q(employment__person__last_name__icontains=search)
                | Q(employment__person__cin__icontains=search)
                | Q(employment__employee_reference__icontains=search)
            )

        return queryset.select_related("employment", "employment__person", "employment__company")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def set_current(self, request, pk=None):
        """Set this salary as current (deactivates others).

        Cycle 25 (state/IMPLEMENTATION_PLAN.md Section 19.4/19.7, finding
        A-7): this used to duplicate the demote-others logic that
        EmploymentSalary.save() already performs, as two independently
        failing writes. The duplicate is removed here - a plain save() now
        does the demote (atomically, per the A-1 fix), and @transaction.atomic
        keeps this endpoint's own read-then-write as one unit.
        """
        salary = self.get_object()
        salary.is_current = True
        salary.updated_by = request.user
        salary.save(update_fields=["is_current", "updated_at", "updated_by"])

        return Response({"message": _("Salary set as current.")})

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a salary record (decision D-0, Cycle 18)."""
        salary = self.get_object()
        salary.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Salary archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived salary record (decision D-0, Cycle 18)."""
        salary = self.get_object()
        if not salary.is_archived:
            return Response(
                {"detail": _("This salary record is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        salary.restore()
        return Response({"message": _("Salary restored successfully.")})

    @action(detail=False, methods=["post"])
    def export(self, request):
        """Export the (filtered) salary history list as CSV or XLSX."""
        return _export_list_response(
            request,
            self.filter_queryset(self.get_queryset()),
            ReportService.salaries_export,
            "Salaries",
            "salaries_export",
        )


class MonthlyPayrollRecordViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for MonthlyPayrollRecord.

    Adds archive/restore actions (decision D-0, Cycle 18) and a domain guard
    refusing to archive or permanently delete an approved/paid payroll
    (decision D-2, Cycle 18 - state/IMPLEMENTATION_PLAN.md Section 12): the
    service layer already refuses to mutate a settled payroll
    (calculate_payroll/add_adjustment/etc.), but the generic soft-delete API
    had no equivalent guard until now - a ``paid`` record could previously
    be archived and then permanently purged through this ViewSet.
    """

    queryset = MonthlyPayrollRecord.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManagePayroll]
    ordering_fields = [
        "year",
        "month",
        "status",
        "payment_status",
        "calculated_net_salary",
        "total_paid",
        "created_at",
        "updated_at",
    ]

    def get_archive_block_reason(self, instance):
        if instance.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot archive or delete an approved or paid payroll record.")
        return None

    def get_update_block_reason(self, instance):
        """Cycle 20, Section 14 (findings G-3/G-3b): mirror the archive/purge
        guard for the generic update path. The serializer already makes
        ``employment`` and the calculation inputs read-only on every update
        (see ``MonthlyPayrollRecordSerializer``); this additionally refuses
        the request outright once the payroll is settled, matching D-2's
        policy that an approved/paid payroll is frozen everywhere.
        """
        if instance.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot edit an approved or paid payroll record.")
        return None

    def get_serializer_class(self):
        if self.action == "retrieve":
            return MonthlyPayrollRecordDetailSerializer
        return MonthlyPayrollRecordSerializer

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            MonthlyPayrollRecord.all_objects.all(), MonthlyPayrollRecord, self.request
        )

        # Filter by employment
        employment_id = self.request.query_params.get("employment")
        if employment_id:
            queryset = queryset.filter(employment_id=employment_id)

        # Filter by company
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(employment__company_id=company_id)

        # Filter by period
        year = self.request.query_params.get("year")
        if year:
            queryset = queryset.filter(year=year)

        month = self.request.query_params.get("month")
        if month:
            queryset = queryset.filter(month=month)

        # Filter by status
        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        # Search by person name/CIN, employee reference or payroll reference
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(employment__person__first_name__icontains=search)
                | Q(employment__person__last_name__icontains=search)
                | Q(employment__person__cin__icontains=search)
                | Q(employment__employee_reference__icontains=search)
                | Q(reference__icontains=search)
            )

        return queryset.select_related(
            "employment", "employment__person", "employment__company"
        ).prefetch_related("adjustments", "payments")

    def create(self, request, *args, **kwargs):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.db import IntegrityError, transaction
        from rest_framework.exceptions import ValidationError as DRFValidationError

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        employment = values["employment"]
        year, month = values["year"], values["month"]
        existing = MonthlyPayrollRecord.all_objects.filter(
            employment=employment, year=year, month=month
        ).first()
        if existing:
            state = "archived" if existing.is_archived else "active"
            raise DRFValidationError(
                {
                    "period": _(
                        "A %(state)s payroll already exists for this employment and month. "
                        "Restore or edit that record instead."
                    )
                    % {"state": state}
                }
            )
        try:
            with transaction.atomic():
                payroll = MonthlyPayrollService().create_payroll_record(
                    employment=employment, year=year, month=month, user=request.user
                )
                editable = (
                    "scheduled_working_days",
                    "worked_days",
                    "absence_days",
                    "authorized_leave_days",
                    "unpaid_leave_days",
                    "declared_days",
                    "notes",
                    "observations",
                )
                for field in editable:
                    if field in values:
                        setattr(payroll, field, values[field])
                payroll.updated_by = request.user
                payroll.calculate_totals()
                payroll.save(
                    update_fields=[
                        *[field for field in editable if field in values],
                        "updated_by",
                        "updated_at",
                        "daily_rate",
                        "absence_deduction",
                        "calculated_net_salary",
                        "total_paid",
                        "remaining_amount",
                        "payment_status",
                    ]
                )
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": exc.messages}
            raise DRFValidationError(detail) from exc
        except IntegrityError as exc:
            raise DRFValidationError(
                {"period": _("A payroll already exists for this employment and month.")}
            ) from exc
        output = self.get_serializer(payroll)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        import calendar
        from datetime import date as date_cls

        data = serializer.validated_data
        year = data.get("year")
        month = data.get("month")
        # Auto-calculate period dates from year/month
        period_start = date_cls(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        period_end = date_cls(year, month, last_day)

        # Auto-fill gross_salary_snapshot from current salary if not provided
        gross = data.get("gross_salary_snapshot")
        if not gross:
            employment = data.get("employment")
            if employment:
                current_salary = employment.salaries.filter(
                    is_current=True, is_archived=False
                ).first()
                if current_salary:
                    gross = current_salary.fixed_monthly_gross_salary

        serializer.save(
            period_start=period_start,
            period_end=period_end,
            gross_salary_snapshot=gross,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="total-paid-drift")
    def total_paid_drift(self, request):
        """Payrolls whose stored ``total_paid`` disagrees with the live sum
        of their payments (Cycle 20, state/IMPLEMENTATION_PLAN.md Section
        14.9 - the read-only integrity report decided alongside the update
        guards, mirroring treasury's ``balance-drift`` action). Surfaces any
        damage already done by the generic-PATCH bypass (finding G-1) before
        this cycle's guards existed; in a correct system this returns an
        empty list forever going forward.
        """
        from apps.personnel.selectors import MonthlyPayrollRecordSelector

        drifted = MonthlyPayrollRecordSelector.get_payroll_total_paid_drift()
        payload = [
            {
                "payroll": MonthlyPayrollRecordSerializer(row["payroll"]).data,
                "stored_total_paid": str(row["stored_total_paid"]),
                "computed_total_paid": str(row["computed_total_paid"]),
                "stored_remaining": str(row["stored_remaining"]),
                "computed_remaining": str(row["computed_remaining"]),
            }
            for row in drifted
        ]
        return Response(payload)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a payroll record (decision D-0, Cycle 18).

        Refused with 409 for an approved/paid payroll - see
        ``get_archive_block_reason`` (decision D-2, Cycle 18).
        """
        payroll = self.get_object()
        block_reason = self.get_archive_block_reason(payroll)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)
        payroll.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Payroll record archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived payroll record (decision D-0, Cycle 18)."""
        payroll = self.get_object()
        if not payroll.is_archived:
            return Response(
                {"detail": _("This payroll record is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payroll.restore()
        return Response({"message": _("Payroll record restored successfully.")})

    @action(detail=True, methods=["post"])
    def calculate(self, request, pk=None):
        """Calculate payroll totals."""
        payroll = self.get_object()
        service = MonthlyPayrollService()
        payroll = service.calculate_payroll(payroll, request.user)
        serializer = self.get_serializer(payroll)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        """Recalculate draft payroll.

        Optional body param:
            daily_rate_override (decimal string): When provided, uses this
                value as the per-day rate instead of computing it automatically
                from gross_salary / scheduled_working_days. Useful when the
                month has a non-standard rate (e.g. partial month, special
                agreement). Pass null or omit to auto-compute.
        """
        payroll = self.get_object()
        from decimal import Decimal, InvalidOperation

        def _parse_rate(field_name, raw):
            if raw in (None, "", "null"):
                return None, None
            try:
                val = Decimal(str(raw))
                if val <= 0:
                    return None, {field_name: "Must be a positive decimal number."}
                return val, None
            except InvalidOperation:
                return None, {field_name: "Must be a valid decimal number."}

        daily_rate_override, err = _parse_rate(
            "daily_rate_override", request.data.get("daily_rate_override")
        )
        if err:
            return Response(err, status=status.HTTP_400_BAD_REQUEST)

        absence_rate_override, err = _parse_rate(
            "absence_rate_override", request.data.get("absence_rate_override")
        )
        if err:
            return Response(err, status=status.HTTP_400_BAD_REQUEST)

        service = MonthlyPayrollService()
        payroll = service.recalculate_payroll(
            payroll,
            daily_rate_override=daily_rate_override,
            absence_rate_override=absence_rate_override,
        )
        serializer = self.get_serializer(payroll)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve payroll."""
        payroll = self.get_object()
        service = MonthlyPayrollService()
        payroll = service.approve_payroll(payroll, request.user)
        serializer = self.get_serializer(payroll)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def unapprove(self, request, pk=None):
        """Unapprove payroll (return to calculated)."""
        payroll = self.get_object()
        service = MonthlyPayrollService()
        payroll = service.unapprove_payroll(payroll, request.user)
        serializer = self.get_serializer(payroll)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def add_adjustment(self, request, pk=None):
        """Add an adjustment to payroll."""
        payroll = self.get_object()
        service = MonthlyPayrollService()

        adjustment = service.add_adjustment(
            payroll=payroll,
            adjustment_type=request.data.get("adjustment_type"),
            direction=request.data.get("direction"),
            amount=request.data.get("amount"),
            description=request.data.get("description", ""),
            effective_date=request.data.get("effective_date"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            user=request.user,
        )
        serializer = PayrollAdjustmentSerializer(adjustment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"])
    def remove_adjustment(self, request, pk=None):
        """Remove an adjustment from this payroll."""
        from apps.personnel.models import PayrollAdjustment

        adjustment_id = request.query_params.get("id") or request.data.get("id")
        if not adjustment_id:
            return Response(
                {"error": _("Adjustment id is required.")}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            adjustment = PayrollAdjustment.objects.get(id=adjustment_id)
        except PayrollAdjustment.DoesNotExist:
            return Response({"error": _("Adjustment not found.")}, status=status.HTTP_404_NOT_FOUND)
        if str(adjustment.payroll_record_id) != pk:
            return Response(
                {"error": _("Adjustment does not belong to this payroll.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = MonthlyPayrollService()
        service.remove_adjustment(adjustment)
        return Response({"message": _("Adjustment removed.")})

    @action(detail=True, methods=["post"])
    def record_payment(self, request, pk=None):
        """Record a payment for payroll."""
        payroll = self.get_object()
        from datetime import date

        service = MonthlyPayrollService()

        payment_date_str = request.data.get("payment_date")
        if isinstance(payment_date_str, str):
            try:
                payment_date = date.fromisoformat(payment_date_str)
            except ValueError:
                from django.utils.translation import gettext_lazy as _
                from rest_framework.exceptions import ValidationError

                raise ValidationError(
                    {"payment_date": _("Invalid date format. Use YYYY-MM-DD.")}
                ) from None
        else:
            payment_date = payment_date_str

        payment = service.record_payment(
            payroll=payroll,
            amount=request.data.get("amount"),
            payment_date=payment_date,
            payment_method=request.data.get("payment_method"),
            payment_kind=request.data.get("payment_kind", "partial_payment"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            observations=request.data.get("observations", ""),
            user=request.user,
        )
        serializer = PayrollPaymentSerializer(payment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def record_advance(self, request, pk=None):
        """Record an advance payment."""
        payroll = self.get_object()
        from datetime import date

        service = MonthlyPayrollService()

        payment_date_str = request.data.get("payment_date")
        if isinstance(payment_date_str, str):
            try:
                payment_date = date.fromisoformat(payment_date_str)
            except ValueError:
                from django.utils.translation import gettext_lazy as _
                from rest_framework.exceptions import ValidationError

                raise ValidationError(
                    {"payment_date": _("Invalid date format. Use YYYY-MM-DD.")}
                ) from None
        else:
            payment_date = payment_date_str

        payment = service.record_advance(
            payroll=payroll,
            amount=request.data.get("amount"),
            payment_date=payment_date,
            payment_method=request.data.get("payment_method"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            user=request.user,
        )
        serializer = PayrollPaymentSerializer(payment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def record_final_payment(self, request, pk=None):
        """Record final payment."""
        payroll = self.get_object()
        from datetime import date

        service = MonthlyPayrollService()

        payment_date_str = request.data.get("payment_date")
        if isinstance(payment_date_str, str):
            try:
                payment_date = date.fromisoformat(payment_date_str)
            except ValueError:
                from django.utils.translation import gettext_lazy as _
                from rest_framework.exceptions import ValidationError

                raise ValidationError(
                    {"payment_date": _("Invalid date format. Use YYYY-MM-DD.")}
                ) from None
        else:
            payment_date = payment_date_str

        payment = service.record_final_payment(
            payroll=payroll,
            amount=request.data.get("amount"),
            payment_date=payment_date,
            payment_method=request.data.get("payment_method"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            user=request.user,
        )
        serializer = PayrollPaymentSerializer(payment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"])
    def void_payment(self, request, pk=None):
        """Void a payment on this payroll."""
        from apps.personnel.models import PayrollPayment

        payment_id = request.query_params.get("id") or request.data.get("id")
        if not payment_id:
            return Response(
                {"error": _("Payment id is required.")}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            payment = PayrollPayment.objects.get(id=payment_id)
        except PayrollPayment.DoesNotExist:
            return Response({"error": _("Payment not found.")}, status=status.HTTP_404_NOT_FOUND)
        if str(payment.payroll_record_id) != pk:
            return Response(
                {"error": _("Payment does not belong to this payroll.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = MonthlyPayrollService()
        service.void_payment(payment, request.user)
        return Response({"message": _("Payment voided.")})

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Bulk create payrolls for a company and period."""
        # Accept both 'company' and 'company_id' for flexibility
        company_id = request.data.get("company") or request.data.get("company_id")
        year = request.data.get("year")
        month = request.data.get("month")

        if not all([company_id, year, month]):
            return Response(
                {"error": _("company (or company_id), year, and month are required.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.companies.models import Company

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({"error": _("Company not found.")}, status=status.HTTP_404_NOT_FOUND)

        from apps.personnel.selectors import EmploymentSelector

        service = MonthlyPayrollService()

        total_employments = EmploymentSelector().get_active_for_company(company).count()
        payrolls = service.bulk_create_payrolls(company, int(year), int(month), request.user)
        skipped_count = max(total_employments - len(payrolls), 0)

        serializer = MonthlyPayrollRecordListSerializer(payrolls, many=True)
        return Response(
            {
                "created_count": len(payrolls),
                "skipped_count": skipped_count,
                "records": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def bulk_calculate(self, request):
        """Bulk calculate payrolls — by IDs or by company+year+month."""
        payroll_ids = request.data.get("payroll_ids", [])

        if payroll_ids:
            payrolls = MonthlyPayrollRecord.objects.filter(id__in=payroll_ids, is_archived=False)
        else:
            company_id = request.data.get("company") or request.data.get("company_id")
            year = request.data.get("year")
            month = request.data.get("month")
            if not all([company_id, year, month]):
                return Response(
                    {"error": _("Provide payroll_ids or company+year+month.")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payrolls = MonthlyPayrollRecord.objects.filter(
                employment__company_id=company_id,
                year=int(year),
                month=int(month),
                status="draft",
                is_archived=False,
            )

        service = MonthlyPayrollService()
        calculated = service.bulk_calculate_payrolls(list(payrolls), request.user)
        serializer = MonthlyPayrollRecordListSerializer(calculated, many=True)
        return Response({"calculated_count": len(calculated), "records": serializer.data})

    @action(detail=False, methods=["post"])
    def bulk_approve(self, request):
        """Bulk approve payrolls — by IDs or by company+year+month."""
        payroll_ids = request.data.get("payroll_ids", [])

        if payroll_ids:
            payrolls = MonthlyPayrollRecord.objects.filter(id__in=payroll_ids, is_archived=False)
        else:
            company_id = request.data.get("company") or request.data.get("company_id")
            year = request.data.get("year")
            month = request.data.get("month")
            if not all([company_id, year, month]):
                return Response(
                    {"error": _("Provide payroll_ids or company+year+month.")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payrolls = MonthlyPayrollRecord.objects.filter(
                employment__company_id=company_id,
                year=int(year),
                month=int(month),
                status="calculated",
                is_archived=False,
            )

        service = MonthlyPayrollService()
        approved = service.bulk_approve_payrolls(list(payrolls), request.user)
        serializer = MonthlyPayrollRecordListSerializer(approved, many=True)
        return Response({"approved_count": len(approved), "records": serializer.data})


class PayrollAdjustmentViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for PayrollAdjustment.

    Adds archive/restore actions (decision D-0, Cycle 18) and a domain guard
    (decision D-2, Cycle 18) refusing to archive/purge an adjustment that
    belongs to an already approved/paid payroll, mirroring
    ``MonthlyPayrollService.add_adjustment``'s/``remove_adjustment``'s own
    guard so an adjustment cannot be silently erased from a settled payroll
    through the generic soft-delete API.
    """

    queryset = PayrollAdjustment.objects.filter(is_archived=False)
    serializer_class = PayrollAdjustmentSerializer
    permission_classes = [IsAuthenticated, CanManagePayroll]

    def get_archive_block_reason(self, instance):
        if instance.payroll_record.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot archive or delete an adjustment on an approved or paid payroll.")
        return None

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            PayrollAdjustment.all_objects.all(), PayrollAdjustment, self.request
        )

        payroll_record_id = self.request.query_params.get("payroll_record")
        if payroll_record_id:
            queryset = queryset.filter(payroll_record_id=payroll_record_id)

        return queryset.select_related("payroll_record")

    def get_update_block_reason(self, instance):
        """Cycle 20, Section 14 (finding G-2): mirror ``get_archive_block_reason``
        for the generic update path, so a generic PATCH can no longer edit an
        adjustment's amount/direction on a settled payroll after
        ``MonthlyPayrollService.add_adjustment``/``remove_adjustment`` already
        refuse to touch it.
        """
        if instance.payroll_record.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot edit an adjustment on an approved or paid payroll.")
        return None

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        """Cycle 20, Section 14 task 5: recompute the parent payroll's
        derived totals after a legitimate (pre-settlement) adjustment edit,
        inside the same atomic wrapper Cycle 18's D-1 already established for
        payroll mutations, so ``calculated_net_salary`` can never drift from
        the adjustments that produced it.
        """
        adjustment = serializer.save(updated_by=self.request.user)
        payroll = adjustment.payroll_record
        payroll.calculate_totals()
        payroll.save(
            update_fields=[
                "supplements_total",
                "other_deductions_total",
                "daily_rate",
                "absence_deduction",
                "calculated_net_salary",
                "total_paid",
                "remaining_amount",
                "payment_status",
                "updated_at",
            ]
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a payroll adjustment (decision D-0, Cycle 18)."""
        adjustment = self.get_object()
        block_reason = self.get_archive_block_reason(adjustment)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)
        adjustment.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Adjustment archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived payroll adjustment (decision D-0, Cycle 18)."""
        adjustment = self.get_object()
        if not adjustment.is_archived:
            return Response(
                {"detail": _("This adjustment is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        adjustment.restore()
        return Response({"message": _("Adjustment restored successfully.")})


class PayrollPaymentViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for PayrollPayment.

    Adds archive/restore actions (decision D-0, Cycle 18) and a domain guard
    (decision D-2, Cycle 18) refusing to archive/purge a payment that
    belongs to an already approved/paid payroll. Voiding a payment (marking
    it CANCELLED) remains available via the dedicated ``void_payment``
    action on ``MonthlyPayrollRecordViewSet`` regardless of payroll status
    guards here - the guard on this generic API is only about outright
    archive/purge of the row, not the domain-specific void workflow.
    """

    queryset = PayrollPayment.objects.filter(is_archived=False)
    serializer_class = PayrollPaymentSerializer
    permission_classes = [IsAuthenticated, CanManagePayroll]

    def get_archive_block_reason(self, instance):
        if instance.payroll_record.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot archive or delete a payment on an approved or paid payroll.")
        return None

    def get_update_block_reason(self, instance):
        """Cycle 20, Section 14 (finding G-1): mirror ``get_archive_block_reason``
        for the generic update path. Before this, a payment on a fully-paid
        payroll could have its ``amount`` edited from 10000.0000 to 1.0000
        through a plain 200-OK PATCH while ``total_paid``/``payment_status``
        kept reporting the payroll as fully settled - the platform's own
        record of what was paid became false. Correcting a settled payment
        must go through ``void_payment`` + a new payment (preserves the
        audit trail); a settled payroll's payments are otherwise frozen.
        """
        if instance.payroll_record.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            return _("Cannot edit a payment on an approved or paid payroll.")
        return None

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            PayrollPayment.all_objects.all(), PayrollPayment, self.request
        )

        payroll_record_id = self.request.query_params.get("payroll_record")
        if payroll_record_id:
            queryset = queryset.filter(payroll_record_id=payroll_record_id)

        return queryset.select_related("payroll_record", "payment_method")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        """Cycle 20, Section 14 tasks 2/5: before this cycle there was no
        ``perform_update`` at all on this ViewSet (a completely bare DRF
        default), so ``updated_by`` was never even stamped on edit. Now also
        recomputes the parent payroll's totals after a legitimate
        (pre-settlement) amount edit, so ``total_paid``/``remaining_amount``
        can never drift from ``SUM(payments)`` (finding G-1).
        """
        payment = serializer.save(updated_by=self.request.user)
        payroll = payment.payroll_record
        payroll.calculate_totals()
        payroll.save(
            update_fields=["total_paid", "remaining_amount", "payment_status", "updated_at"]
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a payroll payment (decision D-0, Cycle 18)."""
        payment = self.get_object()
        block_reason = self.get_archive_block_reason(payment)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)
        payment.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Payment archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived payroll payment (decision D-0, Cycle 18)."""
        payment = self.get_object()
        if not payment.is_archived:
            return Response(
                {"detail": _("This payment is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payment.restore()
        return Response({"message": _("Payment restored successfully.")})


class CNSSDeclarationViewSet(
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for CNSSDeclaration."""

    queryset = CNSSDeclaration.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageCNSS]
    ordering_fields = [
        "declaration_start_date",
        "declaration_end_date",
        "situation",
        "is_currently_declared",
        "cnss_registration_number",
        "created_at",
        "updated_at",
    ]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CNSSDeclarationDetailSerializer
        return CNSSDeclarationSerializer

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            CNSSDeclaration.all_objects.all(), CNSSDeclaration, self.request
        )

        # Filter by person
        person_id = self.request.query_params.get("person")
        if person_id:
            queryset = queryset.filter(person_id=person_id)

        # Filter by company
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        # Filter by situation. The CNSS list page sends its situation filter
        # values under ``status``; ``situation`` stays accepted as well.
        situation = self.request.query_params.get("situation") or self.request.query_params.get(
            "status"
        )
        if situation:
            queryset = queryset.filter(situation=situation)

        # Filter by active status
        is_current = self.request.query_params.get("is_current")
        if is_current is not None:
            queryset = queryset.filter(is_currently_declared=is_current.lower() == "true")

        # Search by person name/CIN or CNSS registration number
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(person__first_name__icontains=search)
                | Q(person__last_name__icontains=search)
                | Q(person__cin__icontains=search)
                | Q(cnss_registration_number__icontains=search)
            )

        queryset = apply_date_range(queryset, self.request, "declaration_start_date")
        return queryset.select_related("person", "company", "employment")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def stop(self, request, pk=None):
        """Stop a CNSS declaration."""
        cnss = self.get_object()
        service = CNSSService()

        cnss = service.stop_cnss_declaration(
            cnss=cnss,
            stop_date=request.data.get("stop_date", date.today()),
            stop_reason=request.data.get("stop_reason", ""),
            user=request.user,
        )
        serializer = self.get_serializer(cnss)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def restart(self, request, pk=None):
        """Restart a stopped CNSS declaration."""
        cnss = self.get_object()
        service = CNSSService()

        cnss = service.restart_cnss_declaration(
            cnss=cnss,
            restart_date=request.data.get("restart_date", date.today()),
            user=request.user,
        )
        serializer = self.get_serializer(cnss)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a CNSS declaration."""
        cnss = self.get_object()
        from apps.personnel.services import CNSSService

        service = CNSSService()
        cnss = service.archive_cnss_declaration(cnss, request.user, request.data.get("reason", ""))
        return Response({"message": _("CNSS declaration archived.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived CNSS declaration.

        Fixes C-3a (state/IMPLEMENTATION_PLAN.md Section 11): this ViewSet
        had an ``archive`` action but no ``restore`` - a roach motel where
        an archived declaration could never come back through the API.
        Reaching the archived row works because ``ArchivableObjectMixin`` is
        now in this class's bases.
        """
        cnss = self.get_object()
        if not cnss.is_archived:
            return Response(
                {"detail": _("This CNSS declaration is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cnss.restore()
        return Response({"message": _("CNSS declaration restored successfully.")})

    @action(detail=True, methods=["post"])
    def create_monthly(self, request, pk=None):
        """Create monthly CNSS declaration."""
        cnss = self.get_object()
        service = CNSSService()

        monthly = service.create_monthly_declaration(
            cnss_declaration=cnss,
            year=request.data.get("year"),
            month=request.data.get("month"),
            declared_days=request.data.get("declared_days", 0),
            declared_salary=request.data.get("declared_salary", Decimal("0")),
            situation=request.data.get("situation", "active"),
            status=request.data.get("status", "draft"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            observations=request.data.get("observations", ""),
            user=request.user,
        )
        serializer = CNSSMonthlyDeclarationSerializer(monthly)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def active_for_company(self, request):
        """Get active CNSS declarations for a company."""
        company_id = request.query_params.get("company")
        if not company_id:
            return Response(
                {"error": _("company parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        declarations = service.get_active_declarations_for_company(company_id)
        serializer = CNSSDeclarationListSerializer(declarations, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def cnss_only_persons(self, request):
        """Get CNSS-only persons for a company."""
        company_id = request.query_params.get("company")
        if not company_id:
            return Response(
                {"error": _("company parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        persons = service.get_cnss_only_persons(company_id)
        serializer = CNSSDeclarationListSerializer(persons, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def employees_without_cnss(self, request):
        """Get employees without CNSS declaration at a company."""
        company_id = request.query_params.get("company")
        if not company_id:
            return Response(
                {"error": _("company parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        employees = service.get_employees_without_cnss(company_id)
        serializer = EmploymentSerializer(employees, many=True)
        return Response(serializer.data)


class CNSSMonthlyDeclarationViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for CNSSMonthlyDeclaration.

    Adds archive/restore actions (decision D-0, Cycle 18): this ViewSet
    previously had no way to bring an archived monthly declaration back
    through the API, a tracked committed-backlog gap
    (state/IMPLEMENTATION_PLAN.md Section 5 and Section 11.6/12.4).
    """

    queryset = CNSSMonthlyDeclaration.objects.filter(is_archived=False)
    serializer_class = CNSSMonthlyDeclarationSerializer
    permission_classes = [IsAuthenticated, CanManageCNSS]
    ordering_fields = [
        "year",
        "month",
        "status",
        "situation",
        "declared_salary",
        "created_at",
        "updated_at",
    ]

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            CNSSMonthlyDeclaration.all_objects.all(), CNSSMonthlyDeclaration, self.request
        )

        # Filter by CNSS declaration
        cnss_declaration_id = self.request.query_params.get("cnss_declaration")
        if cnss_declaration_id:
            queryset = queryset.filter(cnss_declaration_id=cnss_declaration_id)

        # Filter by period
        year = self.request.query_params.get("year")
        if year:
            queryset = queryset.filter(year=year)

        month = self.request.query_params.get("month")
        if month:
            queryset = queryset.filter(month=month)

        # Filter by company
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(cnss_declaration__company_id=company_id)

        # Filter by status
        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        # Filter by situation
        situation = self.request.query_params.get("situation")
        if situation:
            queryset = queryset.filter(situation=situation)

        return queryset.select_related(
            "cnss_declaration", "cnss_declaration__person", "cnss_declaration__company"
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Submit monthly declaration."""
        monthly = self.get_object()
        service = CNSSService()
        monthly = service.submit_monthly_declaration(monthly, request.user)
        serializer = self.get_serializer(monthly)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        """Mark as corrected."""
        monthly = self.get_object()
        service = CNSSService()
        monthly = service.correct_monthly_declaration(monthly, request.user)
        serializer = self.get_serializer(monthly)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def for_period(self, request):
        """Get monthly declarations for a period."""
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        company_id = request.query_params.get("company")

        if not year or not month:
            return Response(
                {"error": _("year and month required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        if company_id:
            monthly = service.get_monthly_declarations_for_period(company_id, int(year), int(month))
        else:
            monthly = service.monthly_selector.for_period(int(year), int(month))

        serializer = self.get_serializer(monthly, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def drafts(self, request):
        """Get draft monthly declarations."""
        service = CNSSService()
        monthly = service.get_draft_monthly_declarations()
        serializer = self.get_serializer(monthly, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def submitted(self, request):
        """Get submitted monthly declarations."""
        service = CNSSService()
        monthly = service.get_submitted_monthly_declarations()
        serializer = self.get_serializer(monthly, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def entrants(self, request):
        """Get entrant declarations."""
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if not year or not month:
            return Response(
                {"error": _("year and month required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        monthly = service.get_entrant_declarations(int(year), int(month))
        serializer = self.get_serializer(monthly, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def sortants(self, request):
        """Get sortant declarations."""
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if not year or not month:
            return Response(
                {"error": _("year and month required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        service = CNSSService()
        monthly = service.get_sortant_declarations(int(year), int(month))
        serializer = self.get_serializer(monthly, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a monthly CNSS declaration (decision D-0, Cycle 18)."""
        monthly = self.get_object()
        monthly.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Monthly declaration archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived monthly CNSS declaration (decision D-0, Cycle 18)."""
        monthly = self.get_object()
        if not monthly.is_archived:
            return Response(
                {"detail": _("This monthly declaration is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        monthly.restore()
        return Response({"message": _("Monthly declaration restored successfully.")})


class PersonnelDocumentReferenceViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for PersonnelDocumentReference.

    Adds archive/restore actions (decision D-0, Cycle 18): this ViewSet
    previously had no way to bring an archived document reference back
    through the API, a tracked committed-backlog gap
    (state/IMPLEMENTATION_PLAN.md Section 5 and Section 11.6/12.4).
    """

    queryset = PersonnelDocumentReference.objects.filter(is_archived=False)
    serializer_class = PersonnelDocumentReferenceSerializer
    permission_classes = [IsAuthenticated, CanManagePersonnel]

    def get_queryset(self):
        queryset = _apply_archive_visibility(
            PersonnelDocumentReference.all_objects.all(), PersonnelDocumentReference, self.request
        )

        # Filter by person
        person_id = self.request.query_params.get("person")
        if person_id:
            queryset = queryset.filter(person_id=person_id)

        # Filter by document type
        doc_type = self.request.query_params.get("document_type")
        if doc_type:
            queryset = queryset.filter(document_type=doc_type)

        return queryset.select_related("person", "employment", "cnss_declaration")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Stream a private personnel document after normal role checks."""
        doc = self.get_object()
        if not doc.file:
            return Response(
                {"detail": _("No ready file is attached to this document.")},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            handle = doc.file.open("rb")
        except FileNotFoundError:
            return Response(
                {"detail": _("The stored file is unavailable.")},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            handle,
            as_attachment=True,
            filename=doc.file_name or doc.file.name.rsplit("/", 1)[-1],
            content_type=doc.content_type or "application/octet-stream",
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a document reference (decision D-0, Cycle 18)."""
        doc = self.get_object()
        doc.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Document reference archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived document reference (decision D-0, Cycle 18)."""
        doc = self.get_object()
        if not doc.is_archived:
            return Response(
                {"detail": _("This document reference is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        doc.restore()
        return Response({"message": _("Document reference restored successfully.")})


class ReportViewSet(viewsets.ViewSet):
    """ViewSet for Personnel Reports."""

    permission_classes = [IsAuthenticated, CanGenerateReports]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.report_service = ReportService()

    @extend_schema(
        request=ReportPreviewSerializer,
        responses={200: CNSSMonthlyPreviewResponseSchema},
        tags=["reports"],
    )
    @action(detail=False, methods=["post"])
    def cnss_monthly_preview(self, request):
        """Preview CNSS monthly report."""
        serializer = ReportPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        rows = self.report_service.build_cnss_monthly_report(
            year=data["year"],
            month=data["month"],
            company_ids=data.get("company_ids"),
        )
        return Response({"rows": rows, "count": len(rows)})

    @extend_schema(
        request=ReportExportSerializer,
        responses={
            (
                200,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ): OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description=(
                    "XLSX file "
                    "(application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)"
                ),
            ),
            400: ReportErrorResponseSchema,
        },
        tags=["reports"],
    )
    @action(detail=False, methods=["post"])
    def cnss_monthly_export(self, request):
        """Export CNSS monthly report."""
        serializer = ReportExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if data["report_type"] != "cnss_monthly":
            return Response(
                {"error": _("Invalid report type.")}, status=status.HTTP_400_BAD_REQUEST
            )

        # Audit fix: CSV was advertised by the serializer (and offered by the
        # frontend) but every non-XLSX request hit "Format not supported
        # yet." The service now builds both formats.
        try:
            from apps.common.export_i18n import normalise_lang

            content, content_type, ext = ReportService().export_cnss_report(
                year=data["year"],
                month=data["month"],
                company_ids=data.get("company_ids"),
                output_format=data["output_format"],
                template=data.get("template"),
                lang=normalise_lang(request.data.get("lang")),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        from django.http import HttpResponse

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="CNSS_{data["month"]:02d}_{data["year"]}.{ext}"'
        )
        return response

    @extend_schema(
        request=ReportPreviewSerializer,
        responses={200: PayrollMonthlyPreviewResponseSchema},
        tags=["reports"],
    )
    @action(detail=False, methods=["post"])
    def payroll_monthly_preview(self, request):
        """Preview payroll monthly report."""
        serializer = ReportPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        rows = self.report_service.build_payroll_monthly_report(
            year=data["year"],
            month=data["month"],
            company_ids=data.get("company_ids"),
            personnel_ids=data.get("personnel_ids"),
        )
        return Response({"rows": rows, "count": len(rows)})

    @extend_schema(
        request=ReportExportSerializer,
        responses={
            (
                200,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ): OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description=(
                    "XLSX file "
                    "(application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)"
                ),
            ),
            400: ReportErrorResponseSchema,
        },
        tags=["reports"],
    )
    @action(detail=False, methods=["post"])
    def payroll_monthly_export(self, request):
        """Export payroll monthly report."""
        serializer = ReportExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if data["report_type"] != "payroll_monthly":
            return Response(
                {"error": _("Invalid report type.")}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from apps.common.export_i18n import normalise_lang

            content, content_type, ext = ReportService().export_payroll_report(
                year=data["year"],
                month=data["month"],
                company_ids=data.get("company_ids"),
                personnel_ids=data.get("personnel_ids"),
                output_format=data["output_format"],
                template=data.get("template"),
                lang=normalise_lang(request.data.get("lang")),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        from django.http import HttpResponse

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="Payroll_{data["month"]:02d}_{data["year"]}.{ext}"'
        )
        return response

    @extend_schema(
        responses={200: ReportTypesResponseSchema},
        tags=["reports"],
    )
    @action(detail=False, methods=["get"])
    def report_types(self, request):
        """Get available report types."""
        return Response(
            {
                "types": [
                    {
                        "id": "cnss_monthly",
                        "name": _("Monthly CNSS Declaration"),
                        "description": _("Monthly CNSS declaration report"),
                    },
                    {
                        "id": "payroll_monthly",
                        "name": _("Monthly Personnel/Payroll"),
                        "description": _("Monthly personnel and payroll report"),
                    },
                ]
            }
        )

    @extend_schema(
        responses={200: DashboardResponseSchema},
        tags=["reports"],
    )
    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Get dashboard summary data."""

        from apps.personnel.selectors import (
            PersonnelClassificationSelector,
            PersonnelPersonSelector,
        )

        # Parse month parameter
        month_param = request.query_params.get("month")
        if month_param:
            try:
                year, month = map(int, month_param.split("-"))
            except (ValueError, AttributeError):
                year = timezone.now().year
                month = timezone.now().month
        else:
            year = timezone.now().year
            month = timezone.now().month

        # Get company filter if provided
        company_id = request.query_params.get("company")

        # Get selectors
        classification_selector = PersonnelClassificationSelector()

        # Build base querysets
        if company_id:
            persons = PersonnelPersonSelector.get_by_company(company_id)
        else:
            persons = PersonnelPersonSelector.get_all()

        # Total personnel
        total_personnel = persons.count()

        # Active employees (persons with active employment)
        active_employees = PersonnelPersonSelector.get_with_active_employment().count()

        # CNSS declared/not-declared/CNSS-only are company-relative figures:
        # a person can be CNSS-declared at one company and not another, so
        # there is no honest "all companies" aggregate to fall back to.
        # Without a company filter these are null, never 0 (Cycle 23,
        # ED-5b) - 0 would be indistinguishable from "genuinely zero".
        cnss_declared = (
            classification_selector.get_employees_declared_to_cnss(company_id).count()
            if company_id
            else None
        )

        not_declared = (
            classification_selector.get_employees_not_declared(company_id).count()
            if company_id
            else None
        )

        cnss_only = (
            classification_selector.get_cnss_only_persons(company_id).count()
            if company_id
            else None
        )

        # Multi-company employees
        multi_company = classification_selector.get_multi_company_employees().count()

        # Incomplete records
        incomplete = classification_selector.get_incomplete_records().count()

        # Archived records — kept visible so archiving never looks like data loss
        archived_personnel = PersonnelPerson.all_objects.filter(is_archived=True).count()

        # Monthly payroll count for the month
        from apps.personnel.selectors import MonthlyPayrollRecordSelector

        monthly_payroll = MonthlyPayrollRecordSelector.get_for_period(year, month).count()

        # Pending payments
        pending_payments = MonthlyPayrollRecordSelector.get_pending_payment().count()

        data = {
            "totalPersonnel": total_personnel,
            "activeEmployees": active_employees,
            "cnssDeclared": cnss_declared,
            "notDeclared": not_declared,
            "cnssOnly": cnss_only,
            "multiCompany": multi_company,
            "incomplete": incomplete,
            "archivedPersonnel": archived_personnel,
            "monthlyPayroll": monthly_payroll,
            "pendingPayments": pending_payments,
        }

        return Response(
            {
                "success": True,
                "message": "Dashboard data retrieved successfully.",
                "data": data,
            }
        )
