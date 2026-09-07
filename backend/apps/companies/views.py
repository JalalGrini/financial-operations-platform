from apps.collaboration.querying import TaggedForMeFilterMixin
from apps.common.querying import apply_date_range

# apps/companies/views.py
"""
Company API Views.

Implements REST endpoints for Company domain:
- Companies
- Company Settings
- Company Preferences
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError, Q
from django.utils.translation import gettext_lazy as _
from rest_framework import mixins, status, viewsets

from apps.common.export_mixin import ExportableListMixin
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.querying import apply_archive_visibility
from apps.companies.models import Company, CompanyPreference, CompanySettings
from apps.companies.permissions import CanManageCompany
from apps.companies.serializers import (
    CompanyCreateSerializer,
    CompanyDetailSerializer,
    CompanyPreferenceCreateSerializer,
    CompanyPreferenceSerializer,
    CompanySerializer,
    CompanySettingsCreateSerializer,
    CompanySettingsSerializer,
)


class CompanyViewSet(
    ExportableListMixin,
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for Company."""

    # Export wiring (v17.19). The mixin adds `export` and
    # `export-options` actions; it exports filter_queryset(get_queryset()),
    # so a download matches what the list is showing.
    export_columns = [
        ("reference", "Reference"),
        ("name", "Name"),
        ("trade_name", "Trade name"),
        ("registration_number", "Registration number"),
        ("tax_id", "Tax ID"),
        ("vat_number", "VAT number"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("address", "Address"),
        ("status", "Status"),
        ("default_currency", "Currency"),
    ]
    export_sheet_name = "Companies"
    export_filename_stem = "companies_export"

    queryset = Company.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageCompany]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CompanyDetailSerializer
        elif self.action == "create":
            return CompanyCreateSerializer
        return CompanySerializer

    # `destroy()` used to be overridden here with logic identical to
    # `SoftDeleteViewSetMixin.destroy()` - archive instead of destroy, for
    # exactly the two reasons that docstring gave (soft-delete policy, and
    # avoiding an uncaught ProtectedError -> 500 on companies with financial
    # records). That was a pure duplication once the mixin existed, so it is
    # now removed in favor of the shared implementation (Cycle 17, C-1).

    @action(detail=True, methods=["delete"], url_path="permanent")
    def permanent_delete(self, request, *args, **kwargs):
        """Administrator-only, confirmation-gated true purge (decision C-5).

        Overrides `SoftDeleteViewSetMixin.permanent_delete` to reuse
        `CompanyService.permanent_delete_company()` rather than duplicating
        its archive-first/validate/delete sequence - that service already
        existed before this cycle and is a deliberate, tested feature (see
        state/IMPLEMENTATION_PLAN.md Section 11.3), so companies purge
        through it instead of the mixin's generic body.
        """
        from apps.companies.services import CompanyService

        company = self.get_object()

        if request.data.get("confirm") is not True:
            return Response(
                {"detail": _("Permanent deletion requires confirm: true in the " "request body.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            CompanyService().permanent_delete_company(company, user=request.user, confirmation=True)
        except DjangoValidationError as exc:
            raise DRFValidationError(getattr(exc, "messages", [str(exc)])) from exc
        except ProtectedError as exc:
            blocking = list(getattr(exc, "protected_objects", []) or [])[:10]
            return Response(
                {
                    "detail": _(
                        "Cannot permanently delete: other records still " "reference this one."
                    ),
                    "blocking_references": [str(obj) for obj in blocking],
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        queryset = apply_archive_visibility(Company.all_objects.all(), Company, self.request)

        # Filter by status
        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        # Search
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(trade_name__icontains=search)
                | Q(registration_number__icontains=search)
                | Q(tax_id__icontains=search)
            )

        queryset = apply_date_range(queryset, self.request, "created_at")
        return queryset.select_related("created_by", "updated_by", "archived_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a company."""
        company = self.get_object()
        company.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Company archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived company."""
        company = self.get_object()
        if not company.is_archived:
            return Response(
                {"detail": _("This company is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        company.restore()
        return Response({"message": _("Company restored successfully.")})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search companies by name, registration number, tax ID."""
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return Response({"results": []})

        companies = Company.objects.filter(
            Q(name__icontains=query)
            | Q(trade_name__icontains=query)
            | Q(registration_number__icontains=query)
            | Q(tax_id__icontains=query)
        ).filter(is_archived=False)[:20]

        serializer = CompanySerializer(companies, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get company statistics."""
        total_companies = Company.objects.filter(is_archived=False).count()
        active_companies = Company.objects.filter(is_archived=False, status="active").count()
        archived_companies = Company.all_objects.filter(is_archived=True).count()

        # Get total personnel count across all companies
        from apps.personnel.models import Employment

        total_personnel = Employment.objects.filter(
            is_archived=False, employment_end_date__isnull=True
        ).count()

        # Total balance would come from Treasury (not implemented yet)
        total_balance = 0

        return Response(
            {
                "total_companies": total_companies,
                "active_companies": active_companies,
                "archived_companies": archived_companies,
                "total_personnel": total_personnel,
                "total_balance": total_balance,
            }
        )

    @action(detail=False, methods=["get"])
    def select(self, request):
        """Get company select options for dropdowns."""
        active_only = request.query_params.get("active_only", "true").lower() == "true"
        search = request.query_params.get("search", "")

        queryset = Company.objects.filter(is_archived=False)
        if active_only:
            queryset = queryset.filter(status="active")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(registration_number__icontains=search)
                | Q(tax_id__icontains=search)
            )

        companies = queryset[:50]
        results = []
        for company in companies:
            # Extract city from address
            city = ""
            if company.address:
                parts = company.address.split(",")
                city = parts[-1].strip() if parts else ""

            results.append(
                {
                    "id": str(company.id),
                    "reference": company.reference,
                    "name": company.name,
                    "trade_name": company.trade_name,
                    "city": city,
                    "status": company.status,
                    "budget_amount": 0,  # Will be implemented with Treasury
                    "personnel_count": company.employments.filter(
                        is_archived=False, employment_end_date__isnull=True
                    ).count(),
                }
            )

        return Response(results)


class CompanySettingsViewSet(
    viewsets.GenericViewSet, mixins.RetrieveModelMixin, mixins.UpdateModelMixin
):
    """ViewSet for CompanySettings."""

    queryset = CompanySettings.objects.all()
    serializer_class = CompanySettingsSerializer
    permission_classes = [IsAuthenticated, CanManageCompany]

    def get_object(self):
        company = self.get_company()
        settings, _ = CompanySettings.objects.get_or_create(company=company)
        return settings

    def get_company(self):
        company_id = self.kwargs.get("company_pk") or self.request.query_params.get("company")
        if not company_id:
            # Try to get from request user's companies
            from apps.companies.models import Company

            return Company.objects.filter(is_archived=False).first()

        from apps.companies.models import Company

        return Company.objects.get(id=company_id)

    def get_serializer_class(self):
        if self.action in ["update", "partial_update"]:
            return CompanySettingsCreateSerializer
        return CompanySettingsSerializer


class CompanyPreferenceViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for CompanyPreference.

    Fixes B-3 (state/IMPLEMENTATION_PLAN.md Section 11): this ViewSet always
    had `archive`/`restore` action methods below, but they were never routed
    in urls.py, while plain DELETE *was* routed straight to `destroy` - so a
    preference was reachable for hard delete but unreachable for the archive
    escape hatch. Both mixins are added here; urls.py now also routes the
    `archive`/`restore`/`permanent` action paths.
    """

    queryset = CompanyPreference.objects.all()
    permission_classes = [IsAuthenticated, CanManageCompany]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return CompanyPreferenceCreateSerializer
        return CompanyPreferenceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        company_id = self.kwargs.get("company_pk") or self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        return queryset.select_related("company", "created_by", "updated_by")

    def perform_create(self, serializer):
        company_id = self.kwargs.get("company_pk") or self.request.data.get("company")
        from apps.companies.models import Company

        company = Company.objects.get(id=company_id)
        serializer.save(company=company, created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None, company_pk=None):
        """Archive a preference.

        Accepts ``company_pk`` because this action is routed under the
        company-nested path (``.../companies/<company_pk>/preferences/<pk>/
        archive/``); DRF passes every URL kwarg to the handler, and omitting
        this parameter raised ``TypeError: archive() got an unexpected
        keyword argument 'company_pk'`` the moment B-3's routing fix made
        this action reachable at all.
        """
        preference = self.get_object()
        preference.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Preference archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None, company_pk=None):
        """Restore an archived preference. See `archive` for why `company_pk`
        is accepted here."""
        preference = self.get_object()
        if not preference.is_archived:
            return Response(
                {"detail": _("This preference is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        preference.restore()
        return Response({"message": _("Preference restored successfully.")})
