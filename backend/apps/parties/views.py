# apps/parties/views.py
"""
Parties API Views.

Implements REST endpoints for Parties domain:
- Clients
- Suppliers
- Associated Persons
- Associated Person Types
- External Parties
"""
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets

from apps.common.company_scope import filter_queryset_by_company
from apps.common.export_mixin import ExportableListMixin
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.querying import apply_archive_visibility
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ExternalParty,
    Supplier,
)
from apps.parties.permissions import CanManageParty
from apps.parties.serializers import (
    AssociatedPersonCreateSerializer,
    AssociatedPersonDetailSerializer,
    AssociatedPersonSerializer,
    AssociatedPersonTypeCreateSerializer,
    AssociatedPersonTypeSerializer,
    ClientCreateSerializer,
    ClientDetailSerializer,
    ClientSerializer,
    ExternalPartyCreateSerializer,
    ExternalPartySerializer,
    SupplierCreateSerializer,
    SupplierDetailSerializer,
    SupplierSerializer,
)
from apps.common.querying import apply_date_range


class ClientViewSet(
    ExportableListMixin,
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for Client."""

    # Export wiring (v17.19). The mixin adds `export` and
    # `export-options` actions; it exports filter_queryset(get_queryset()),
    # so a download matches what the list is showing.
    export_columns = [
        ("reference", "Reference"),
        ("name", "Name"),
        ("client_kind", "Kind"),
        ("first_name", "First name"),
        ("last_name", "Last name"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("tax_id", "Tax ID"),
        ("vat_number", "VAT number"),
        ("company__name", "Company"),
        ("payment_terms", "Payment terms"),
        ("default_currency", "Currency"),
        ("status", "Status"),
    ]
    export_sheet_name = "Clients"
    export_filename_stem = "clients_export"

    queryset = Client.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageParty]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClientDetailSerializer
        elif self.action in {"create", "update", "partial_update"}:
            return ClientCreateSerializer
        return ClientSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(Client.all_objects.all(), Client, self.request)

        queryset = filter_queryset_by_company(
            queryset, field="company", raw=self.request.query_params.get("company")
        )

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(tax_id__icontains=search)
            )

        queryset = apply_date_range(queryset, self.request, "created_at")
        return queryset.select_related("company", "created_by", "updated_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a client."""
        client = self.get_object()
        client.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Client archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived client."""
        client = self.get_object()
        if not client.is_archived:
            return Response(
                {"detail": _("This client is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        client.restore()
        return Response({"message": _("Client restored successfully.")})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search clients by name, email, phone, tax_id."""
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return Response({"results": []})

        clients = Client.objects.filter(
            Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone__icontains=query)
            | Q(tax_id__icontains=query)
        ).filter(is_archived=False)[:20]

        serializer = ClientSerializer(clients, many=True)
        return Response({"results": serializer.data})


class SupplierViewSet(
    ExportableListMixin,
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for Supplier."""

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
        ("company__name", "Company"),
        ("payment_terms", "Payment terms"),
    ]
    export_sheet_name = "Suppliers"
    export_filename_stem = "suppliers_export"

    queryset = Supplier.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageParty]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SupplierDetailSerializer
        elif self.action == "create":
            return SupplierCreateSerializer
        return SupplierSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(Supplier.all_objects.all(), Supplier, self.request)

        queryset = filter_queryset_by_company(
            queryset, field="company", raw=self.request.query_params.get("company")
        )

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(tax_id__icontains=search)
            )

        queryset = apply_date_range(queryset, self.request, "created_at")
        return queryset.select_related("company", "created_by", "updated_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a supplier."""
        supplier = self.get_object()
        supplier.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Supplier archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived supplier."""
        supplier = self.get_object()
        if not supplier.is_archived:
            return Response(
                {"detail": _("This supplier is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        supplier.restore()
        return Response({"message": _("Supplier restored successfully.")})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search suppliers by name, email, phone, tax_id."""
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return Response({"results": []})

        suppliers = Supplier.objects.filter(
            Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone__icontains=query)
            | Q(tax_id__icontains=query)
        ).filter(is_archived=False)[:20]

        serializer = SupplierSerializer(suppliers, many=True)
        return Response({"results": serializer.data})


class AssociatedPersonViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for AssociatedPerson."""

    queryset = AssociatedPerson.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageParty]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AssociatedPersonDetailSerializer
        elif self.action == "create":
            return AssociatedPersonCreateSerializer
        return AssociatedPersonSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            AssociatedPerson.all_objects.all(), AssociatedPerson, self.request
        )

        queryset = filter_queryset_by_company(
            queryset, field="company", raw=self.request.query_params.get("company")
        )

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by type
        person_type = self.request.query_params.get("person_type")
        if person_type:
            queryset = queryset.filter(person_type_id=person_type)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(national_id__icontains=search)
            )

        return queryset.select_related("company", "person_type", "created_by", "updated_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive an associated person."""
        person = self.get_object()
        person.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Associated person archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived associated person."""
        person = self.get_object()
        if not person.is_archived:
            return Response(
                {"detail": _("This associated person is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        person.restore()
        return Response({"message": _("Associated person restored successfully.")})


class AssociatedPersonTypeViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for AssociatedPersonType.

    Adds archive/restore actions (decision D-0, Cycle 18): this ViewSet
    previously had no way to bring an archived row back through the API
    (only via admin/shell) - a tracked committed-backlog gap
    (state/IMPLEMENTATION_PLAN.md Section 5 and Section 11.6/12.4), now
    closed the same way as every other soft-deletable ViewSet in this
    project.
    """

    queryset = AssociatedPersonType.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageParty]

    def get_serializer_class(self):
        if self.action == "create":
            return AssociatedPersonTypeCreateSerializer
        return AssociatedPersonTypeSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            AssociatedPersonType.all_objects.all(), AssociatedPersonType, self.request
        )
        return queryset.select_related("created_by", "updated_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive an associated person type (decision D-0, Cycle 18)."""
        instance = self.get_object()
        instance.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Associated person type archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived associated person type (decision D-0, Cycle 18)."""
        instance = self.get_object()
        if not instance.is_archived:
            return Response(
                {"detail": _("This associated person type is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.restore()
        return Response({"message": _("Associated person type restored successfully.")})


class ExternalPartyViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for ExternalParty.

    NOTE: ExternalParty has no `company` relationship in the current model
    (see EFOP Engineering Log C-03). Filtering/selecting by company is not
    implemented here; see Open Question 7 ("Party company scope").
    """

    queryset = ExternalParty.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageParty]

    def get_serializer_class(self):
        if self.action == "create":
            return ExternalPartyCreateSerializer
        return ExternalPartySerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            ExternalParty.all_objects.all(), ExternalParty, self.request
        )

        # Filter by category
        category = self.request.query_params.get("party_category")
        if category:
            queryset = queryset.filter(party_category=category)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search)
            )

        return queryset.select_related("created_by", "updated_by")

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive an external party."""
        party = self.get_object()
        party.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("External party archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived external party."""
        party = self.get_object()
        if not party.is_archived:
            return Response(
                {"detail": _("This external party is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        party.restore()
        return Response({"message": _("External party restored successfully.")})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search external parties by name, email, phone."""
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return Response({"results": []})

        parties = ExternalParty.objects.filter(
            Q(name__icontains=query) | Q(email__icontains=query) | Q(phone__icontains=query)
        ).filter(is_archived=False)[:20]

        serializer = ExternalPartySerializer(parties, many=True)
        return Response({"results": serializer.data})
