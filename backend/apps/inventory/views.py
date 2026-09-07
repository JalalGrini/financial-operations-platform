import csv
import mimetypes

from django.db import models, transaction
from django.http import FileResponse, HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit_log.services import record_event
from apps.collaboration.querying import TaggedForMeFilterMixin
from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.export_i18n import resolve_export_lang, translate_header
from apps.common.querying import apply_archive_visibility, apply_date_range
from apps.common.security import safe_export_row
from apps.inventory.models import InventoryCategory, InventoryItem, InventoryMovement
from apps.inventory.permissions import CanManageInventory
from apps.inventory.serializers import (
    InventoryCategorySerializer,
    InventoryItemSerializer,
    InventoryMovementSerializer,
)
from apps.inventory.services import record_movement


class LifecycleViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    permission_classes = [CanManageInventory]

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        obj = self.get_object()
        obj.archive(user=request.user, reason=request.data.get("reason", ""))
        record_event(
            action="archive",
            summary=f"Archived {obj}",
            actor=request.user,
            entity=obj,
            reason=request.data.get("reason", ""),
            request=request,
        )
        return Response({"message": "Record archived successfully."})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        obj = self.get_object()
        if not obj.is_archived:
            return Response({"detail": "This record is not archived."}, status=400)
        obj.restore()
        record_event(
            action="restore",
            summary=f"Restored {obj}",
            actor=request.user,
            entity=obj,
            request=request,
        )
        return Response({"message": "Record restored successfully."})


class InventoryCategoryViewSet(LifecycleViewSet):
    serializer_class = InventoryCategorySerializer
    search_fields = ["name", "reference", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        q = apply_archive_visibility(
            InventoryCategory.all_objects.select_related("company"), InventoryCategory, self.request
        )
        if self.request.query_params.get("company"):
            q = q.filter(company_id=self.request.query_params["company"])
        if self.request.query_params.get("item_type"):
            q = q.filter(item_type__in=["", self.request.query_params["item_type"]])
        return q

    def perform_create(self, s):
        s.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, s):
        s.save(updated_by=self.request.user)


class InventoryItemViewSet(TaggedForMeFilterMixin, LifecycleViewSet):
    serializer_class = InventoryItemSerializer
    search_fields = [
        "name",
        "reference",
        "sku",
        "asset_tag",
        "serial_number",
        "location",
        "description",
    ]
    ordering_fields = ["name", "quantity", "purchase_date", "unit_cost", "created_at"]

    def get_queryset(self):
        q = apply_archive_visibility(
            InventoryItem.all_objects.select_related(
                "company", "category", "supplier", "responsible_person"
            ),
            InventoryItem,
            self.request,
        )
        p = self.request.query_params
        if p.get("company"):
            q = q.filter(company_id=p["company"])
        if p.get("item_type"):
            q = q.filter(item_type=p["item_type"])
        if p.get("category"):
            q = q.filter(category_id=p["category"])
        if p.get("status"):
            q = q.filter(status=p["status"])
        if p.get("low_stock") == "true":
            q = q.filter(
                item_type="consumable",
                minimum_stock__isnull=False,
                quantity__lte=models.F("minimum_stock"),
            )
        return q

    @transaction.atomic
    def perform_create(self, s):
        item = s.save(created_by=self.request.user, updated_by=self.request.user)
        record_event(
            action="create",
            summary=f"Created inventory item {item.reference}",
            actor=self.request.user,
            entity=item,
            after=s.data,
            request=self.request,
        )

    @transaction.atomic
    def perform_update(self, s):
        item = s.save(updated_by=self.request.user)
        record_event(
            action="update",
            summary=f"Updated inventory item {item.reference}",
            actor=self.request.user,
            entity=item,
            after=s.data,
            request=self.request,
        )

    @action(detail=True, methods=["get"], url_path="image")
    def image(self, request, pk=None):
        item = self.get_object()
        if not item.image:
            return Response({"detail": "No image is attached to this item."}, status=404)
        content_type = mimetypes.guess_type(item.image.name)[0] or "application/octet-stream"
        response = FileResponse(item.image.open("rb"), content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{item.image.name.rsplit("/",1)[-1]}"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=["post"])
    def movement(self, request, pk=None):
        item = self.get_object()
        serializer = InventoryMovementSerializer(
            data={**request.data, "item": str(item.id)}, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement = record_movement(
            item=item,
            user=request.user,
            request=request,
            **{k: v for k, v in data.items() if k != "item"},
        )
        return Response(InventoryMovementSerializer(movement).data, status=201)

    @action(detail=False, methods=["get"])
    def export(self, request):
        q = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="inventory.csv"'
        writer = csv.writer(response)
        # Header row follows the user's language; data cells do not. Same reason
        # as the audit-log export: this writer predates ExportableListMixin and
        # was missed when export_i18n was wired in v17.26.
        lang = resolve_export_lang(request)
        writer.writerow(
            safe_export_row(
                [
                    translate_header(label, lang)
                    for label in (
                        "Reference",
                        "Company",
                        "Type",
                        "Name",
                        "Quantity",
                        "Unit",
                        "Location",
                        "Status",
                        "Purchase date",
                        "Unit cost",
                        "Currency",
                        "Low stock",
                    )
                ]
            )
        )
        for i in q:
            writer.writerow(
                safe_export_row(
                    [
                        i.reference,
                        i.company.name,
                        i.get_item_type_display(),
                        i.name,
                        i.quantity,
                        i.unit,
                        i.location,
                        i.get_status_display(),
                        i.purchase_date or "",
                        i.unit_cost or "",
                        i.currency,
                        "Yes" if i.needs_reorder else "No",
                    ]
                )
            )
        return response


class InventoryMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = InventoryMovementSerializer
    permission_classes = [CanManageInventory]
    search_fields = ["reference", "item__reference", "item__name", "reason"]
    ordering_fields = ["occurred_on", "created_at", "quantity"]

    def get_queryset(self):
        q = InventoryMovement.objects.select_related("item", "item__company", "created_by")
        p = self.request.query_params
        if p.get("item"):
            q = q.filter(item_id=p["item"])
        if p.get("company"):
            q = q.filter(item__company_id=p["company"])
        if p.get("movement_type"):
            q = q.filter(movement_type=p["movement_type"])
        # See the same note in apps/audit_log/views.py: an unvalidated date was a
        # 500 on user input. occurred_on is a DateField, so the helper compares
        # it directly rather than adding __date.
        q = apply_date_range(q, self.request, "occurred_on")
        return q
