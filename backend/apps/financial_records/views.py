from apps.collaboration.querying import TaggedForMeFilterMixin

# apps/financial_records/views.py
"""Financial record and versioned document-template API views."""

import uuid
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets

from apps.common.export_mixin import ExportableListMixin
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.permissions import IsAdministratorOrReadOnly
from apps.common.querying import apply_archive_visibility, apply_date_range
from apps.configuration.models import FinancialRecordType
from apps.extensibility.services import definitions_for, set_custom_fields
from apps.financial_records.models import (
    Attachment,
    FinancialDocumentTemplate,
    FinancialRecord,
    FinancialRecordLine,
)
from apps.financial_records.permissions import (
    CanManageFinancialRecord,
    CanRemoveOwnAttachment,
)
from apps.financial_records.selectors import all_records
from apps.financial_records.serializers import (
    ArchiveRecordSerializer,
    AttachmentCreateSerializer,
    AttachmentSerializer,
    CancelRecordSerializer,
    FinancialDocumentTemplateSerializer,
    FinancialRecordCreateSerializer,
    FinancialRecordDetailSerializer,
    FinancialRecordLineCreateSerializer,
    FinancialRecordLineSerializer,
    FinancialRecordLineUpdateSerializer,
    FinancialRecordSerializer,
    FinancialRecordUpdateSerializer,
    PublishTemplateSerializer,
)
from apps.financial_records.services import (
    add_line,
    archive_record,
    archive_template,
    attach_document,
    cancel_record,
    clone_template,
    create_record,
    create_template,
    delete_line,
    field_definition_payload,
    get_published_template,
    post_record,
    publish_template,
    remove_attachment,
    update_line,
    update_record,
)

ENTITY_LABEL = "financial_records.FinancialRecord"


def _as_drf_error(exc):
    """Keep service field errors structured instead of flattening them."""
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict"):
            return DRFValidationError(exc.message_dict)
        return DRFValidationError(getattr(exc, "messages", [str(exc)]))
    return DRFValidationError([str(exc)])


def _detail_record(record_id):
    return all_records().get(pk=record_id)


class FinancialDocumentTemplateViewSet(ArchivableObjectMixin, viewsets.ModelViewSet):
    """Administrator-managed, immutable published template versions."""

    serializer_class = FinancialDocumentTemplateSerializer
    permission_classes = [IsAuthenticated, IsAdministratorOrReadOnly]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = apply_archive_visibility(
            FinancialDocumentTemplate.all_objects.select_related(
                "record_type", "published_by", "created_by", "updated_by"
            ).prefetch_related("fields"),
            FinancialDocumentTemplate,
            self.request,
        )
        record_type = self.request.query_params.get("record_type")
        if record_type:
            queryset = queryset.filter(record_type_id=record_type)
        template_status = self.request.query_params.get("status")
        if template_status:
            queryset = queryset.filter(status=template_status)
        return queryset.order_by("record_type__name", "-version")

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        try:
            archive_template(template=template, user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        serializer = PublishTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            template = publish_template(
                template=self.get_object(), user=request.user, **serializer.validated_data
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        template = self.get_queryset().filter(pk=template.pk).first() or template
        return Response(self.get_serializer(template).data)

    @action(detail=True, methods=["post"], url_path="new-version")
    def new_version(self, request, pk=None):
        try:
            template = clone_template(template=self.get_object(), user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(self.get_serializer(template).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        try:
            archive_template(template=self.get_object(), user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response({"message": _("Template archived successfully.")})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def restore(self, request, pk=None):
        template = self.get_object()
        if not template.is_archived:
            raise DRFValidationError({"detail": _("This template version is not archived.")})
        template.restore()
        template.status = "draft"
        template.is_default = False
        template.save(update_fields=["status", "is_default", "updated_at"])
        return Response({"message": _("Template restored as a draft for review.")})

    @action(detail=False, methods=["post"], url_path="import-xlsx")
    def import_xlsx(self, request):
        from apps.financial_records.template_import import parse_template_xlsx

        upload = request.FILES.get("file")
        if upload is None:
            raise DRFValidationError({"file": "An .xlsx workbook is required."})
        record_type = get_object_or_404(
            FinancialRecordType.objects.filter(is_archived=False),
            pk=request.data.get("record_type"),
        )
        name = str(request.data.get("name") or Path(upload.name).stem).strip()
        if not name:
            raise DRFValidationError({"name": "Template name is required."})
        try:
            fields = parse_template_xlsx(upload)
            template = create_template(
                record_type=record_type,
                name=name,
                fields=fields,
                user=request.user,
                description="Imported from a deterministic XLSX field definition. Review before publishing.",
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        template = self.get_queryset().filter(pk=template.pk).first() or template
        return Response(self.get_serializer(template).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def active(self, request):
        record_type_id = request.query_params.get("record_type")
        if not record_type_id:
            raise DRFValidationError({"record_type": "This query parameter is required."})
        record_type = get_object_or_404(FinancialRecordType.objects.all(), pk=record_type_id)
        template = get_published_template(record_type)
        return Response(
            {
                "record_type": str(record_type.id),
                "template": self.get_serializer(template).data if template else None,
            }
        )


class FinancialRecordViewSet(
    ExportableListMixin,
    TaggedForMeFilterMixin, SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """Draft header, lines, documents, posting and cancellation."""

    # Export wiring (v17.19). The mixin adds `export` and
    # `export-options` actions; it exports filter_queryset(get_queryset()),
    # so a download matches what the list is showing.
    export_columns = [
        ("reference", "Reference"),
        ("record_date", "Date"),
        ("company__name", "Company"),
        ("record_type__name", "Record type"),
        ("category__name", "Category"),
        ("client__name", "Client"),
        ("supplier__name", "Supplier"),
        ("description", "Description"),
        ("currency", "Currency"),
        ("total_amount", "Total amount"),
        ("status", "Status"),
    ]
    export_sheet_name = "Financial records"
    export_filename_stem = "financial_records_export"

    queryset = FinancialRecord.objects.all()
    permission_classes = [IsAuthenticated, CanManageFinancialRecord]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return FinancialRecordDetailSerializer
        if self.action == "create":
            return FinancialRecordCreateSerializer
        if self.action in ("update", "partial_update"):
            return FinancialRecordUpdateSerializer
        return FinancialRecordSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(all_records(), FinancialRecord, self.request)
        filters = {
            "company_id": self.request.query_params.get("company"),
            "status": self.request.query_params.get("status"),
            "record_type_id": self.request.query_params.get("record_type"),
            "client_id": self.request.query_params.get("client"),
            "supplier_id": self.request.query_params.get("supplier"),
        }
        queryset = queryset.filter(**{key: value for key, value in filters.items() if value})
        # record_date__gte / record_date__lte used to sit in the dict above, which
        # fed the raw query string straight into the ORM. Django's DateField then
        # raised django.core.exceptions.ValidationError on a bad value - not the
        # DRF exception, so the handler never converted it and the response was a
        # 500. The shared helper validates and answers 400.
        queryset = apply_date_range(queryset, self.request, "record_date")
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(description__icontains=search)
                | Q(notes__icontains=search)
                | Q(client__name__icontains=search)
                | Q(supplier__name__icontains=search)
            )
        if self.action == "list":
            queryset = queryset.prefetch_related(None)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        custom_fields = data.pop("custom_fields", {}) or {}
        try:
            with transaction.atomic():
                record = create_record(user=request.user, **data)
                set_custom_fields(instance=record, values=custom_fields)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        record = _detail_record(record.pk)
        return Response(
            FinancialRecordDetailSerializer(record, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        record = self.get_object()
        serializer = self.get_serializer(
            record, data=request.data, partial=kwargs.pop("partial", False)
        )
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        custom_fields = data.pop("custom_fields", None)
        try:
            with transaction.atomic():
                if data:
                    record = update_record(record=record, user=request.user, **data)
                if custom_fields is not None:
                    set_custom_fields(instance=record, values=custom_fields)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        record = _detail_record(record.pk)
        return Response(FinancialRecordDetailSerializer(record, context={"request": request}).data)

    def get_archive_block_reason(self, instance):
        if instance.status in (
            FinancialRecord.Status.POSTED,
            FinancialRecord.Status.CANCELLED,
        ):
            return _("A %(status)s financial record cannot be permanently deleted.") % {
                "status": instance.get_status_display()
            }
        return None

    def destroy(self, request, *args, **kwargs):
        try:
            archive_record(record=self.get_object(), user=request.user, reason="Deleted via API")
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="lines")
    def add_line(self, request, pk=None):
        serializer = FinancialRecordLineCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            line = add_line(
                record=self.get_object(), user=request.user, **serializer.validated_data
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(FinancialRecordLineSerializer(line).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"lines/(?P<line_id>[^/.]+)",
    )
    def line_detail(self, request, pk=None, line_id=None):
        record = self.get_object()
        line = get_object_or_404(FinancialRecordLine.objects.all(), pk=line_id, record=record)
        try:
            if request.method == "DELETE":
                delete_line(record=record, line=line, user=request.user)
                return Response(status=status.HTTP_204_NO_CONTENT)
            serializer = FinancialRecordLineUpdateSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            line = update_line(
                record=record, line=line, user=request.user, **serializer.validated_data
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(FinancialRecordLineSerializer(line).data)

    @action(detail=True, methods=["post"])
    def post_to_ledger(self, request, pk=None):
        try:
            record = post_record(record=self.get_object(), user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        record = _detail_record(record.pk)
        return Response(FinancialRecordDetailSerializer(record, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = CancelRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = cancel_record(
                record=self.get_object(),
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        record = _detail_record(record.pk)
        return Response(FinancialRecordDetailSerializer(record, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        serializer = ArchiveRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            archive_record(
                record=self.get_object(),
                user=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response({"message": _("Financial record archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        record = self.get_object()
        if not record.is_archived:
            raise DRFValidationError({"detail": _("This record is not archived.")})
        record.restore()
        return Response({"message": _("Financial record restored successfully.")})

    @action(detail=True, methods=["post"], url_path="attachments")
    def add_attachment(self, request, pk=None):
        record = self.get_object()
        serializer = AttachmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        uploaded = data.pop("file", None)
        stored_key = None
        if uploaded:
            original = Path(uploaded.name).name
            safe_name = "".join(
                char if char.isalnum() or char in ".-_" else "_" for char in original
            )
            stored_key = default_storage.save(
                f"financial-records/{record.pk}/{uuid.uuid4().hex}-{safe_name}", uploaded
            )
            data["file_key"] = stored_key
        try:
            attachment = attach_document(record=record, user=request.user, **data)
        except Exception as exc:
            if stored_key:
                default_storage.delete(stored_key)
            if isinstance(exc, (DjangoValidationError, ValueError)):
                raise _as_drf_error(exc) from exc
            raise
        return Response(
            AttachmentSerializer(attachment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)",
        # The one documented exception to "only an Administrator deletes".
        # See CanRemoveOwnAttachment for why, and note that remove_attachment
        # archives rather than purges, so this stays reversible and auditable.
        permission_classes=[IsAuthenticated, CanRemoveOwnAttachment],
    )
    def attachment_detail(self, request, pk=None, attachment_id=None):
        record = self.get_object()
        attachment = get_object_or_404(Attachment.objects.all(), pk=attachment_id, record=record)

        # Ownership is enforced here rather than in the permission class because
        # this action is detail=True on the *record* viewset: get_object()
        # returns the FinancialRecord, so has_object_permission never sees the
        # attachment. The permission class establishes "Administrator, or an
        # Assistant who may write"; this narrows the Assistant case to their own
        # upload.
        #
        # Superuser and Administrator bypass, matching every other check in this
        # codebase.
        user = request.user
        is_privileged = (
            user.is_superuser
            or user.groups.filter(
                name__in=CanRemoveOwnAttachment.DELETE_ROLES
            ).exists()
        )
        if not is_privileged and attachment.created_by_id != user.id:
            raise PermissionDenied(
                _("You may only remove attachments that you uploaded yourself.")
            )

        remove_attachment(record=record, attachment=attachment, user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)/download",
    )
    def download_attachment(self, request, pk=None, attachment_id=None):
        record = self.get_object()
        attachment = get_object_or_404(Attachment.objects.all(), pk=attachment_id, record=record)
        managed_prefix = f"financial-records/{record.pk}/"
        if not attachment.file_key.startswith(managed_prefix):
            return Response(
                {
                    "detail": _(
                        "This legacy object key is metadata-only and cannot be downloaded here."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        if not default_storage.exists(attachment.file_key):
            return Response(
                {"detail": _("The stored file is unavailable.")},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            default_storage.open(attachment.file_key, "rb"),
            as_attachment=True,
            filename=attachment.file_name,
            content_type=attachment.content_type or "application/octet-stream",
        )

    @action(detail=False, methods=["get"], url_path="custom-field-definitions")
    def custom_field_definitions(self, request):
        record_type_id = request.query_params.get("record_type")
        if not record_type_id:
            raise DRFValidationError({"record_type": "This query parameter is required."})
        record_type = get_object_or_404(FinancialRecordType.objects.all(), pk=record_type_id)
        template = get_published_template(record_type)
        fields = [
            field_definition_payload(field, source="global")
            for field in definitions_for(ENTITY_LABEL)
        ]
        if template:
            fields.extend(
                field_definition_payload(field)
                for field in template.fields.filter(is_active=True).order_by("display_order", "key")
            )
        # A published template may predate a global definition with the same
        # key. Preserve one deterministic field rather than rendering duplicates.
        deduplicated = {field["key"]: field for field in fields}
        definitions = sorted(
            deduplicated.values(), key=lambda field: (field["display_order"], field["key"])
        )
        return Response(
            {
                "entity": ENTITY_LABEL,
                "record_type": str(record_type.id),
                "template": (
                    FinancialDocumentTemplateSerializer(template, context={"request": request}).data
                    if template
                    else None
                ),
                "definitions": definitions,
            }
        )
