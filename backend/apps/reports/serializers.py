# apps/reports/serializers.py
"""
Reports Engine API serializers.

These are deliberately thin, matching apps.treasury.serializers: they shape
data and reject obviously bad input; they do NOT generate, approve, or
regenerate anything. Every write goes through apps.reports.services so the
version-immutability rule and the one-current-official invariant cannot be
bypassed by a new caller.

UPDATE-SERIALIZER LOCKDOWN (Cycle 20 G-1b/G-3b precedent). Update
serializers for GeneratedReport/ReportVersion deliberately do not exist as
full ModelSerializers with writable core fields - report/version identity,
period, status, and figures are never edited through a generic PATCH. The
only mutations exposed are the explicit service-backed actions on the
ViewSets (submit-for-review, approve, regenerate).
"""
from rest_framework import serializers

from apps.common.security import validate_private_upload
from apps.reports.models import GeneratedReport, ReportValue, ReportValueSource, ReportVersion


class ReportValueSourceSerializer(serializers.ModelSerializer):
    financial_record_reference = serializers.CharField(
        source="financial_record.reference", read_only=True, default=None
    )

    class Meta:
        model = ReportValueSource
        fields = [
            "id",
            "value",
            "financial_record",
            "financial_record_reference",
            "contribution_amount",
            "created_at",
        ]
        read_only_fields = fields


class ReportValueSerializer(serializers.ModelSerializer):
    """Blueprint Section 11 drill-down tree: each value carries its sources
    so a client can render "Annual Fuel Expense -> January Total -> the
    Financial Records behind it" in one response."""

    sources = ReportValueSourceSerializer(many=True, read_only=True)

    class Meta:
        model = ReportValue
        fields = [
            "id",
            "version",
            "parent",
            "key",
            "label",
            "amount",
            "period_label",
            "is_available",
            "sources",
            "created_at",
        ]
        read_only_fields = fields


class ReportVersionSerializer(serializers.ModelSerializer):
    """Read serializer for a report version. Never writable as a whole -
    see module docstring."""

    is_editable = serializers.BooleanField(read_only=True)
    reviewed_by_name = serializers.CharField(
        source="reviewed_by.get_full_name", read_only=True, default=None
    )
    ready_file_download_url = serializers.SerializerMethodField()

    class Meta:
        model = ReportVersion
        fields = [
            "id",
            "report",
            "version_number",
            "status",
            "generation_mode",
            "calculation_mode",
            "is_partial",
            "missing_periods",
            "ready_file_name",
            "ready_file_content_type",
            "ready_file_size_bytes",
            "ready_file_download_url",
            "generated_at",
            "reviewed_by",
            "reviewed_by_name",
            "approved_at",
            "notes",
            "regeneration_reason",
            "outdated_at",
            "outdated_reason",
            "is_editable",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_ready_file_download_url(self, obj):
        if not obj.ready_file:
            return None
        return f"/api/v1/reports/versions/{obj.pk}/download-ready-file/"


class ReportVersionDetailSerializer(ReportVersionSerializer):
    """Detail serializer including the computed values (blueprint Section 11)."""

    values = ReportValueSerializer(many=True, read_only=True)

    class Meta(ReportVersionSerializer.Meta):
        fields = ReportVersionSerializer.Meta.fields + ["values"]


class GeneratedReportSerializer(serializers.ModelSerializer):
    """Read serializer for a report. Fully read-only - see module
    docstring; identity, period and status only change through the
    service-backed generate/approve/regenerate actions."""

    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    report_type_name = serializers.CharField(
        source="report_type.name", read_only=True, default=None
    )

    class Meta:
        model = GeneratedReport
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "report_type",
            "report_type_name",
            "period_start",
            "period_end",
            "period_label",
            "status",
            "current_version",
            "latest_version_number",
            "custom_fields",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class GeneratedReportDetailSerializer(GeneratedReportSerializer):
    """Detail serializer including the version history (blueprint Section
    9/14: search by version implies a client can list all of them)."""

    versions = ReportVersionSerializer(many=True, read_only=True)

    class Meta(GeneratedReportSerializer.Meta):
        fields = GeneratedReportSerializer.Meta.fields + ["versions"]


class GenerateReportSerializer(serializers.Serializer):
    """Input for generating a new report version. This is the one write
    path into the module and it is a plain Serializer, not a ModelSerializer
    bound to GeneratedReport or ReportVersion, precisely so it cannot
    accidentally expose a writable `status`, `version_number`, or
    `current_version` field the way a ModelSerializer's default field
    discovery could.
    """

    company = serializers.PrimaryKeyRelatedField(
        queryset=GeneratedReport._meta.get_field("company").related_model.objects.all()
    )
    report_type = serializers.PrimaryKeyRelatedField(
        queryset=GeneratedReport._meta.get_field("report_type").related_model.objects.all()
    )
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    period_label = serializers.CharField(max_length=50)
    mode = serializers.ChoiceField(choices=["scheduled", "manual", "preview"], default="manual")
    calculation_mode = serializers.ChoiceField(
        choices=["keep_missing", "treat_missing_as_zero"], default="keep_missing"
    )
    is_partial = serializers.BooleanField(required=False, default=False)
    missing_periods = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    regeneration_reason = serializers.CharField(required=False, allow_blank=True, default="")
    values = serializers.ListField(child=serializers.DictField(), allow_empty=True)


class UploadReadyReportSerializer(serializers.Serializer):
    """Create a normal Preview report version from a finished private file."""

    company = serializers.PrimaryKeyRelatedField(
        queryset=GeneratedReport._meta.get_field("company").related_model.objects.all()
    )
    report_type = serializers.PrimaryKeyRelatedField(
        queryset=GeneratedReport._meta.get_field("report_type").related_model.objects.all()
    )
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    period_label = serializers.CharField(max_length=50)
    file = serializers.FileField(write_only=True)

    def validate_file(self, upload):
        allowed = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"}
        validate_private_upload(upload, max_bytes=20 * 1024 * 1024, allowed=allowed)
        return upload


class ApproveReportVersionSerializer(serializers.Serializer):
    """Approval requires an explicit approved flag; rejection requires
    notes (blueprint Section 7) - see validators.validate_approval_notes_for_rejection.
    """

    approved = serializers.BooleanField(default=True)
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class RegenerateReportSerializer(serializers.Serializer):
    """Regeneration is generation with a mandatory reason (blueprint Section 9).

    NOT a subclass of `GenerateReportSerializer` any more. It used to inherit
    from it, which made `company`, `report_type`, `period_start`,
    `period_end` and `period_label` REQUIRED on this endpoint - even though
    `regenerate()` reads every one of them off the existing report and the
    view explicitly popped them from `validated_data` before calling the
    service. The result was that a client sending the documented payload
    (just a reason) got a 400 listing six fields that the server would have
    thrown away, so the Regenerate button could never work. No test covered
    the endpoint, only the service function, which is why it survived.

    `values` stays REQUIRED on purpose. `generate()` persists exactly the
    values it is handed and does not recompute anything, so defaulting this
    to an empty list would let one click replace a populated report with a
    blank version. Making the caller state the figures keeps that explicit.
    """

    regeneration_reason = serializers.CharField(max_length=2000, allow_blank=False)
    values = serializers.ListField(child=serializers.DictField(), allow_empty=True)
    mode = serializers.ChoiceField(choices=["scheduled", "manual", "preview"], default="manual")
    calculation_mode = serializers.ChoiceField(
        choices=["keep_missing", "treat_missing_as_zero"], default="keep_missing"
    )
    is_partial = serializers.BooleanField(required=False, default=False)
    missing_periods = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
