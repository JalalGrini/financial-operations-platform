# apps/transfers/views.py
from django.db import models as db_models
from django.utils import timezone
from rest_framework import status, viewsets

from apps.common.export_mixin import ExportableListMixin
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin
from apps.transfers.models import CashTransfer, EntityOpeningBalance, TransferStatus
from apps.transfers.permissions import CanManageTransfers
from apps.transfers.selectors import DEFAULT_CURRENCY, entity_balances
from apps.transfers.serializers import (
    CashTransferSerializer,
    CashTransferWriteSerializer,
    EntityBalanceReportSerializer,
    EntityOpeningBalanceSerializer,
    EntityOpeningBalanceWriteSerializer,
)
from apps.common.querying import apply_date_range


class CashTransferViewSet(
    ExportableListMixin,
    ArchivableObjectMixin, viewsets.ModelViewSet):
    """
    CRUD for cash transfers between companies and associated persons.

    Transfers are NEVER locked regardless of status.
    Use the /archive/ action to soft-delete instead of the DELETE method.
    The DELETE method is also kept for convenience but uses soft-archive.
    """

    # Export wiring (v17.19). The mixin adds `export` and
    # `export-options` actions; it exports filter_queryset(get_queryset()),
    # so a download matches what the list is showing.
    export_columns = [
        ("reference", "Reference"),
        ("transfer_date", "Date"),
        ("from_entity_type", "From type"),
        ("from_company__name", "From company"),
        ("to_entity_type", "To type"),
        ("to_company__name", "To company"),
        ("amount", "Amount"),
        ("currency", "Currency"),
        ("status", "Status"),
        ("note", "Note"),
    ]
    export_sheet_name = "Cash transfers"
    export_filename_stem = "cash_transfers_export"

    permission_classes = [IsAuthenticated, CanManageTransfers]
    serializer_class = CashTransferSerializer

    def get_queryset(self):
        include_archived = self.request.query_params.get("include_archived") == "true"
        base = CashTransfer.objects.select_related(
            "from_company",
            "from_associated_person",
            "to_company",
            "to_associated_person",
            "confirmed_by",
        )
        # Archive filter applied first; remaining filters stack on top
        qs = base if include_archived else base.filter(is_archived=False)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        from_type = self.request.query_params.get("from_entity_type")
        if from_type:
            qs = qs.filter(from_entity_type=from_type)

        to_type = self.request.query_params.get("to_entity_type")
        if to_type:
            qs = qs.filter(to_entity_type=to_type)

        company_id = self.request.query_params.get("company")
        if company_id:
            qs = qs.filter(
                db_models.Q(from_company_id=company_id) | db_models.Q(to_company_id=company_id)
            )

        person_id = self.request.query_params.get("associated_person")
        if person_id:
            qs = qs.filter(
                db_models.Q(from_associated_person_id=person_id)
                | db_models.Q(to_associated_person_id=person_id)
            )

        qs = apply_date_range(qs, self.request, "transfer_date")

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                db_models.Q(reference__icontains=search)
                | db_models.Q(note__icontains=search)
                | db_models.Q(from_company__name__icontains=search)
                | db_models.Q(to_company__name__icontains=search)
                | db_models.Q(from_associated_person__first_name__icontains=search)
                | db_models.Q(from_associated_person__last_name__icontains=search)
                | db_models.Q(to_associated_person__first_name__icontains=search)
                | db_models.Q(to_associated_person__last_name__icontains=search)
            )

        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return CashTransferWriteSerializer
        return CashTransferSerializer

    def perform_create(self, serializer):
        """Record who created the transfer.

        This was missing, so every transfer landed with created_by=NULL and the
        audit trail could not say who moved the money - matching the convention
        already used across apps/personnel/views.py.
        """
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def _read_representation(self, instance):
        """Serialise `instance` with the READ serializer.

        `get_serializer_class` returns the thin write serializer for
        create/update, and DRF's default mixins echo *that* serializer back as
        the response body. The write serializer has no `id`, so the client
        received a 201 with no primary key: the frontend's
        `router.push('/transfers/' + result.id)` navigated to
        `/transfers/undefined` and the save looked like it had failed even
        though the row was committed. Responses must describe the saved
        resource, not the accepted input.
        """
        return CashTransferSerializer(instance, context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        data = self._read_representation(serializer.instance)
        return Response(data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(data))

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        return Response(self._read_representation(serializer.instance))

    def destroy(self, request, *args, **kwargs):
        """Soft-archive instead of hard delete."""
        instance = self.get_object()
        instance.archive(user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """Mark transfer as CONFIRMED (informational only — does not lock it)."""
        instance = self.get_object()
        if instance.status == TransferStatus.CONFIRMED:
            return Response(
                {"detail": "Transfer is already confirmed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.status = TransferStatus.CONFIRMED
        instance.confirmed_at = timezone.now()
        instance.confirmed_by = request.user
        instance.save(update_fields=["status", "confirmed_at", "confirmed_by", "updated_at"])
        return Response(CashTransferSerializer(instance).data)

    @action(detail=True, methods=["post"])
    def revert_to_draft(self, request, pk=None):
        """Revert a confirmed transfer back to DRAFT."""
        instance = self.get_object()
        if instance.status == TransferStatus.DRAFT:
            return Response(
                {"detail": "Transfer is already a draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.status = TransferStatus.DRAFT
        instance.confirmed_at = None
        instance.confirmed_by = None
        instance.save(update_fields=["status", "confirmed_at", "confirmed_by", "updated_at"])
        return Response(CashTransferSerializer(instance).data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Soft-archive a transfer (hides it from default list views)."""
        instance = self.get_object()
        instance.archive(user=request.user)
        return Response({"detail": "Transfer archived."})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Bring an archived transfer back into use.

        This used to call ``CashTransfer.objects.get(pk=pk)``, which was
        broken two ways at once - the exact B-1/B-2 pair documented on
        ``ArchivableObjectMixin``. ``objects`` is an ``ActiveManager``, so it
        excludes the archived rows this action exists to recover, meaning the
        lookup could never find its target; and a miss raised an uncaught
        ``CashTransfer.DoesNotExist``, surfacing as HTTP 500 instead of 404.
        Resolving through the mixin's ``get_object()`` looks the row up in
        ``all_objects``, raises a clean ``Http404`` when there is none, and
        keeps the object-level permission check a bare manager call skipped.
        """
        instance = self.get_object()
        if not instance.is_archived:
            return Response(
                {"detail": "Transfer is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.restore()
        return Response(CashTransferSerializer(instance).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Total volume stats and per-entity budget flow."""
        from django.db.models import Sum

        qs = CashTransfer.objects.filter(is_archived=False)
        confirmed = qs.filter(status=TransferStatus.CONFIRMED)

        result = {
            "total_confirmed_volume": str(
                confirmed.aggregate(t=Sum("amount"))["t"] or 0
            ),
            "draft_count": qs.filter(status=TransferStatus.DRAFT).count(),
            "confirmed_count": confirmed.count(),
            "total_count": qs.count(),
        }
        return Response(result)

    @action(detail=False, methods=["get"])
    def balances(self, request):
        """Per-entity position: opening + net transfers = current.

        `net_transfers` totals exactly zero because transfers only ever move
        money between entities inside the group; that total is the ledger's
        integrity check and is reported as `is_balanced`. The `current` total
        equals the sum of the opening balances, NOT zero - see
        apps/transfers/selectors.py for why conflating the two would be wrong.
        """
        currency = request.query_params.get("currency") or DEFAULT_CURRENCY
        report = entity_balances(currency=currency)
        return Response(EntityBalanceReportSerializer(report).data)


class EntityOpeningBalanceViewSet(ArchivableObjectMixin, viewsets.ModelViewSet):
    """Starting positions, so a company or person does not have to begin at zero."""

    permission_classes = [IsAuthenticated, CanManageTransfers]
    serializer_class = EntityOpeningBalanceSerializer

    def get_queryset(self):
        include_archived = self.request.query_params.get("include_archived") == "true"
        base = EntityOpeningBalance.objects.select_related("company", "associated_person")
        qs = base if include_archived else base.filter(is_archived=False)

        entity_type = self.request.query_params.get("entity_type")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)

        currency = self.request.query_params.get("currency")
        if currency:
            qs = qs.filter(currency=currency)

        company_id = self.request.query_params.get("company")
        if company_id:
            qs = qs.filter(company_id=company_id)

        person_id = self.request.query_params.get("associated_person")
        if person_id:
            qs = qs.filter(associated_person_id=person_id)

        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return EntityOpeningBalanceWriteSerializer
        return EntityOpeningBalanceSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def _read_representation(self, instance):
        """Echo back the saved resource, not the accepted input - the write
        serializer carries no `id`, which is the defect that made saving a cash
        transfer look broken to the user."""
        return EntityOpeningBalanceSerializer(
            instance, context=self.get_serializer_context()
        ).data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        data = self._read_representation(serializer.instance)
        return Response(data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(data))

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(self._read_representation(serializer.instance))

    def destroy(self, request, *args, **kwargs):
        """Soft-archive: an opening balance is historical context, so removing
        it outright would silently restate every balance derived from it."""
        instance = self.get_object()
        instance.archive(user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        instance = self.get_object()
        if not instance.is_archived:
            return Response(
                {"detail": "Opening balance is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.restore()
        return Response(self._read_representation(instance))
