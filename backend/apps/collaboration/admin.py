from django.contrib import admin

from apps.collaboration.models import Mention, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "recipient", "category", "title", "read_at")
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Mention)
class MentionAdmin(admin.ModelAdmin):
    list_display = ("created_at", "tagged_user", "target_label", "resolved_at")
    readonly_fields = [f.name for f in Mention._meta.fields]
