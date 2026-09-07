from django.contrib import admin

from apps.audit_log.models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "actor_email",
        "action",
        "entity_type",
        "entity_reference",
        "result",
    )
    list_filter = ("action", "result", "entity_type")
    search_fields = ("actor_email", "summary", "entity_reference", "correlation_id")
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
