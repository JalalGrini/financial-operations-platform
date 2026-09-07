from rest_framework import serializers

from apps.audit_log.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True, default="")

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "created_at",
            "correlation_id",
            "actor",
            "actor_email",
            "actor_name",
            "actor_role",
            "company",
            "company_name",
            "action",
            "entity_type",
            "entity_id",
            "entity_reference",
            "summary",
            "before",
            "after",
            "changes",
            "request_method",
            "request_path",
            "result",
            "ip_address",
            "user_agent",
            "reason",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor else obj.actor_email or "System"
