from apps.common.security import validate_private_upload

# apps/financial_records/serializers.py
"""DRF contracts for financial records, lines, attachments and templates."""

from decimal import Decimal

from rest_framework import serializers

from apps.configuration.models import Category
from apps.financial_records.models import (
    Attachment,
    FinancialDocumentTemplate,
    FinancialDocumentTemplateField,
    FinancialRecord,
    FinancialRecordLine,
)

ZERO = Decimal("0.0000")
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
ALLOWED_ATTACHMENT_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png", ".csv", ".xlsx"}


class FinancialDocumentTemplateFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialDocumentTemplateField
        fields = [
            "id",
            "key",
            "label",
            "data_type",
            "is_required",
            "display_order",
            "section",
            "help_text",
            "default_value",
            "choices",
            "max_length",
            "validation",
            "output_mapping",
            "is_active",
        ]
        read_only_fields = ["id"]

    def validate_key(self, value):
        value = value.strip().lower()
        if not value.isidentifier() or value.startswith("_"):
            raise serializers.ValidationError(
                "Use letters, digits, and underscores; do not start with a digit or underscore."
            )
        return value

    def validate(self, attrs):
        data_type = attrs.get("data_type", "string")
        choices = attrs.get("choices", [])
        if data_type in {"choice", "multi_choice"} and (
            not choices or not all(isinstance(choice, str) and choice for choice in choices)
        ):
            raise serializers.ValidationError({"choices": "Choice fields require string choices."})
        return attrs


class FinancialDocumentTemplateSerializer(serializers.ModelSerializer):
    fields = FinancialDocumentTemplateFieldSerializer(many=True, required=False)
    record_type_name = serializers.CharField(source="record_type.name", read_only=True)

    class Meta:
        model = FinancialDocumentTemplate
        fields = [
            "id",
            "record_type",
            "record_type_name",
            "name",
            "version",
            "status",
            "description",
            "effective_from",
            "effective_to",
            "is_default",
            "output_mapping",
            "published_at",
            "fields",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "version",
            "status",
            "is_default",
            "published_at",
            "is_archived",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        from apps.financial_records.services import create_template

        fields = validated_data.pop("fields", [])
        request = self.context["request"]
        return create_template(fields=fields, user=request.user, **validated_data)

    def update(self, instance, validated_data):
        from apps.financial_records.services import update_template

        fields = validated_data.pop("fields", None)
        request = self.context["request"]
        try:
            return update_template(
                template=instance, fields=fields, user=request.user, **validated_data
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc


class AttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id",
            "file_key",
            "file_name",
            "content_type",
            "size_bytes",
            "download_url",
            "created_at",
        ]
        read_only_fields = fields

    def get_download_url(self, obj):
        return (
            f"/api/v1/financial-records/records/{obj.record_id}/" f"attachments/{obj.id}/download/"
        )


class AttachmentCreateSerializer(serializers.Serializer):
    """Upload through Django storage or register a pre-existing object key."""

    file = serializers.FileField(required=False, write_only=True)
    file_key = serializers.CharField(max_length=512, required=False)
    file_name = serializers.CharField(max_length=255, required=False)
    content_type = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )
    size_bytes = serializers.IntegerField(required=False, min_value=0, default=0)

    def validate(self, attrs):
        uploaded = attrs.get("file")
        key = attrs.get("file_key")
        if bool(uploaded) == bool(key):
            raise serializers.ValidationError("Provide exactly one of file or file_key.")
        if uploaded:
            validate_private_upload(
                uploaded, max_bytes=MAX_ATTACHMENT_BYTES, allowed=ALLOWED_ATTACHMENT_SUFFIXES
            )
            if uploaded.size > MAX_ATTACHMENT_BYTES:
                raise serializers.ValidationError({"file": "Files are limited to 10 MB."})
            content_type = getattr(uploaded, "content_type", "") or ""
            suffix = "." + uploaded.name.rsplit(".", 1)[-1].lower() if "." in uploaded.name else ""
            if (
                content_type not in ALLOWED_ATTACHMENT_TYPES
                or suffix not in ALLOWED_ATTACHMENT_SUFFIXES
            ):
                raise serializers.ValidationError(
                    {"file": "Allowed formats: PDF, JPEG, PNG, GIF, WEBP, BMP, CSV, XLSX, XLS, DOCX, DOC, TXT, and ZIP."}
                )
            attrs["file_name"] = attrs.get("file_name") or uploaded.name
            attrs["content_type"] = content_type
            attrs["size_bytes"] = uploaded.size
        elif not attrs.get("file_name"):
            raise serializers.ValidationError(
                {"file_name": "File name is required for a stored object key."}
            )
        return attrs


class FinancialRecordLineSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    signed_amount = serializers.DecimalField(max_digits=18, decimal_places=4, read_only=True)

    class Meta:
        model = FinancialRecordLine
        fields = [
            "id",
            "line_number",
            "description",
            "category",
            "category_name",
            "debit",
            "credit",
            "signed_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class FinancialRecordLineWriteSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), required=False, allow_null=True
    )
    debit = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, min_value=Decimal("0.00")
    )
    credit = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, min_value=Decimal("0.00")
    )

    def validate(self, attrs):
        debit = attrs.get("debit")
        credit = attrs.get("credit")
        if debit is not None and debit < 0 or credit is not None and credit < 0:
            raise serializers.ValidationError("Amounts cannot be negative.")
        if debit is not None and credit is not None:
            if bool(debit) == bool(credit):
                raise serializers.ValidationError(
                    "A line must carry exactly one positive debit or credit."
                )
        return attrs


class FinancialRecordLineCreateSerializer(FinancialRecordLineWriteSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        debit = attrs.get("debit") or ZERO
        credit = attrs.get("credit") or ZERO
        if bool(debit) == bool(credit):
            raise serializers.ValidationError(
                "A line must carry exactly one positive debit or credit."
            )
        attrs.setdefault("description", "")
        attrs.setdefault("category", None)
        attrs.setdefault("debit", ZERO)
        attrs.setdefault("credit", ZERO)
        return attrs


class FinancialRecordLineUpdateSerializer(FinancialRecordLineWriteSerializer):
    pass


def _record_totals(obj):
    cached = getattr(obj, "_serializer_line_totals", None)
    if cached is not None:
        return cached
    lines = list(obj.lines.all())
    debit = sum((line.debit for line in lines), ZERO)
    credit = sum((line.credit for line in lines), ZERO)
    invalid = any(
        line.debit < ZERO or line.credit < ZERO or bool(line.debit) == bool(line.credit)
        for line in lines
    )
    cached = {
        "line_count": len(lines),
        "debit": debit,
        "credit": credit,
        "balance": debit - credit,
        "invalid": invalid,
    }
    obj._serializer_line_totals = cached
    return cached


class FinancialRecordSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(
        read_only=True, pk_field=serializers.UUIDField(format="hex_verbose")
    )
    supplier = serializers.PrimaryKeyRelatedField(
        read_only=True, pk_field=serializers.UUIDField(format="hex_verbose")
    )
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    record_type_name = serializers.CharField(
        source="record_type.name", read_only=True, default=None
    )
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    client_name = serializers.CharField(source="client.name", read_only=True, default=None)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)
    template_version = serializers.IntegerField(
        source="template.version", read_only=True, default=None
    )
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = FinancialRecord
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "record_type",
            "record_type_name",
            "template",
            "template_name",
            "template_version",
            "category",
            "category_name",
            "client",
            "client_name",
            "supplier",
            "supplier_name",
            "record_date",
            "description",
            "currency",
            "total_amount",
            "status",
            "is_editable",
            "is_archived",
            "custom_fields",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "total_amount",
            "status",
            "is_editable",
            "is_archived",
            "created_at",
            "updated_at",
        ]


class FinancialRecordDetailSerializer(FinancialRecordSerializer):
    lines = FinancialRecordLineSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    line_count = serializers.SerializerMethodField()
    debit_total = serializers.SerializerMethodField()
    credit_total = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    can_post = serializers.SerializerMethodField()
    post_blockers = serializers.SerializerMethodField()

    class Meta(FinancialRecordSerializer.Meta):
        fields = FinancialRecordSerializer.Meta.fields + [
            "notes",
            "template_snapshot",
            "lines",
            "attachments",
            "line_count",
            "debit_total",
            "credit_total",
            "balance",
            "can_post",
            "post_blockers",
            "posted_at",
            "cancelled_at",
            "cancellation_reason",
        ]

    def get_line_count(self, obj):
        return _record_totals(obj)["line_count"]

    def get_debit_total(self, obj):
        return str(_record_totals(obj)["debit"])

    def get_credit_total(self, obj):
        return str(_record_totals(obj)["credit"])

    def get_balance(self, obj):
        return str(_record_totals(obj)["balance"])

    def get_can_post(self, obj):
        totals = _record_totals(obj)
        return (
            obj.status == FinancialRecord.Status.DRAFT
            and totals["line_count"] >= 2
            and totals["balance"] == ZERO
            and not totals["invalid"]
        )

    def get_post_blockers(self, obj):
        totals = _record_totals(obj)
        blockers = []
        if obj.status != FinancialRecord.Status.DRAFT:
            blockers.append("Only draft records can be posted.")
        if totals["line_count"] < 2:
            blockers.append("Add at least one debit line and one credit line.")
        if totals["invalid"]:
            blockers.append("Each line must contain exactly one positive debit or credit.")
        if totals["balance"] != ZERO:
            blockers.append("Total debits must equal total credits.")
        return blockers


class FinancialRecordCreateSerializer(serializers.ModelSerializer):
    custom_fields = serializers.DictField(required=False, default=dict)
    template = serializers.PrimaryKeyRelatedField(
        queryset=FinancialDocumentTemplate.objects.filter(
            status=FinancialDocumentTemplate.Status.PUBLISHED
        ),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = FinancialRecord
        fields = [
            "id",
            "company",
            "record_type",
            "template",
            "category",
            "client",
            "supplier",
            "record_date",
            "description",
            "notes",
            "currency",
            "custom_fields",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        company = attrs.get("company")
        errors = {}
        template = attrs.get("template")
        if template and template.record_type_id != attrs.get("record_type").id:
            errors["template"] = "The template does not belong to the selected record type."
        for key in ("client", "supplier"):
            party = attrs.get(key)
            if party and party.company_id and party.company_id != company.id:
                errors[key] = "The counterparty must belong to the selected company."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class FinancialRecordUpdateSerializer(serializers.ModelSerializer):
    custom_fields = serializers.DictField(required=False)

    class Meta:
        model = FinancialRecord
        fields = [
            "record_type",
            "category",
            "client",
            "supplier",
            "record_date",
            "description",
            "notes",
            "currency",
            "custom_fields",
        ]


class CancelRecordSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, allow_blank=False, trim_whitespace=True)


class PublishTemplateSerializer(serializers.Serializer):
    is_default = serializers.BooleanField(required=False, default=True)


class ArchiveRecordSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
