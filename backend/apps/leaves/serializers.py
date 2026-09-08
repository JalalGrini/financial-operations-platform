from rest_framework import serializers

from apps.common.company_scope import GroupCompanyInputMixin, company_display_name, is_group_company
from apps.common.security import LEAVE_DOCUMENT_EXTENSIONS, validate_private_upload

from .models import Leave


class LeaveSerializer(GroupCompanyInputMixin, serializers.ModelSerializer):
    personnel_name = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    company_name = serializers.SerializerMethodField()
    job_title = serializers.CharField(source="employment.job_title", read_only=True, default="")
    department = serializers.CharField(source="employment.department", read_only=True, default="")
    signed_document = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Leave
        fields = [
            'id', 'personnel', 'personnel_name', 'employment',
            'company', 'company_name', 'job_title', 'department',
            'leave_type', 'leave_type_other',
            'decision_number', 'decision_date',
            'start_date', 'end_date', 'duration_days',
            'reason', 'status', 'signed_document',
            'created_by', 'created_by_name',
            'official_at', 'cancelled_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'duration_days', 'created_by',
            'company_name', 'job_title', 'department',
            'official_at', 'cancelled_at', 'created_at', 'updated_at',
        ]

    def get_personnel_name(self, obj):
        return obj.personnel.get_full_name() if obj.personnel else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_company_name(self, obj):
        return company_display_name(obj.company)

    def validate_signed_document(self, upload):
        if not upload:
            return upload
        return validate_private_upload(
            upload, max_bytes=10 * 1024 * 1024, allowed=LEAVE_DOCUMENT_EXTENSIONS
        )

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError('end_date must be >= start_date.')
        leave_type = data.get('leave_type', getattr(self.instance, 'leave_type', None))
        other = data.get('leave_type_other', getattr(self.instance, 'leave_type_other', ''))
        if leave_type == 'other' and not (other or '').strip():
            raise serializers.ValidationError(
                {'leave_type_other': 'Specify the leave type when Autre is selected.'}
            )
        employment = data.get('employment', getattr(self.instance, 'employment', None))
        if 'company' in data:
            if is_group_company(data.get('company')):
                data['company'] = None
        elif employment:
            data['company'] = employment.company
        return data
