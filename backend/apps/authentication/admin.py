# apps/authentication/admin.py
"""
Django Admin configuration for Authentication models.
"""
from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import FailedLoginAttempt, RefreshToken, UserSession


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    """Admin for RefreshToken model."""

    list_display = [
        "id",
        "user",
        "is_valid_display",
        "expires_at",
        "created_at",
        "revoked_at",
        "is_archived",
    ]
    list_filter = ["is_archived", "revoked_at", "expires_at", "created_at"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "token"]
    readonly_fields = [
        "id",
        "token",
        "access_token_jti",
        "created_at",
        "updated_at",
        "expires_at",
        "revoked_at",
        "revoked_by",
        "revoked_reason",
        "is_archived",
        "archived_at",
        "archived_by",
        "replaced_by",
        "token_family",
    ]
    autocomplete_fields = ["user", "revoked_by", "archived_by", "replaced_by"]
    ordering = ["-created_at"]
    actions = ["revoke_selected", "restore_selected"]

    @admin.display(description=_("Valid"))
    def is_valid_display(self, obj):
        if obj.is_valid():
            return format_html('<span style="color: green;">✓ Valid</span>')
        return format_html('<span style="color: red;">✗ Invalid</span>')

    is_valid_display.short_description = _("Valid")

    @admin.action(description=_("Revoke selected tokens"))
    def revoke_selected(self, request, queryset):
        count = 0
        for token in queryset.filter(is_archived=False, revoked_at__isnull=True):
            token.revoke(user=request.user)
            count += 1
        self.message_user(request, f"{count} token(s) revoked.")

    revoke_selected.short_description = _("Revoke selected tokens")

    @admin.action(description=_("Restore selected tokens"))
    def restore_selected(self, request, queryset):
        count = 0
        for token in queryset.filter(is_archived=True):
            token.restore()
            count += 1
        self.message_user(request, f"{count} token(s) restored.")

    restore_selected.short_description = _("Restore selected tokens")


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    """Admin for UserSession model."""

    list_display = [
        "id",
        "user",
        "device_name",
        "device_type",
        "status_badge",
        "ip_address",
        "location_display",
        "created_at",
        "expires_at",
        "is_archived",
    ]
    list_filter = ["device_type", "is_archived", "is_active", "created_at"]
    search_fields = [
        "user__email",
        "user__first_name",
        "user__last_name",
        "session_key",
        "device_name",
    ]
    readonly_fields = [
        "id",
        "session_key",
        "device_fingerprint",
        "device_name",
        "device_type",
        "operating_system",
        "browser",
        "ip_address",
        "country",
        "city",
        "user_agent",
        "created_at",
        "updated_at",
        "last_activity",
        "expires_at",
        "revoked_at",
        "revoked_by",
        "revoked_reason",
        "is_active",
        "is_archived",
        "archived_at",
        "archived_by",
        "is_current",
    ]
    autocomplete_fields = ["user", "revoked_by", "archived_by"]
    ordering = ["-created_at"]
    actions = ["archive_selected", "restore_selected", "revoke_selected"]

    fieldsets = (
        (
            _("Session"),
            {
                "fields": ("user", "session_key", "device_fingerprint"),
            },
        ),
        (
            _("Device Info"),
            {
                "fields": ("device_name", "device_type", "operating_system", "browser"),
            },
        ),
        (
            _("Network"),
            {
                "fields": ("ip_address", "country", "city", "user_agent"),
            },
        ),
        (
            _("Status"),
            {
                "fields": ("is_active", "is_current", "revoked_at", "revoked_by", "revoked_reason"),
            },
        ),
        (
            _("Timestamps"),
            {
                "fields": ("created_at", "updated_at", "last_activity", "expires_at"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": ("is_archived", "archived_at", "archived_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user", "revoked_by", "archived_by")

    @admin.display(description=_("Status"))
    def status_badge(self, obj):
        if obj.revoked_at:
            return format_html('<span style="color: red;">Revoked</span>')
        elif obj.is_archived:
            return format_html('<span style="color: orange;">Archived</span>')
        elif obj.is_valid():
            return format_html('<span style="color: green;">Active</span>')
        elif obj.expires_at <= timezone.now():
            return format_html('<span style="color: orange;">Expired</span>')
        return format_html('<span style="color: gray;">Inactive</span>')

    status_badge.short_description = _("Status")

    @admin.display(description=_("Location"))
    def location_display(self, obj):
        parts = []
        if obj.city:
            parts.append(obj.city)
        if obj.country:
            parts.append(obj.country)
        return ", ".join(parts) if parts else "-"

    location_display.short_description = _("Location")

    @admin.action(description=_("Archive selected sessions"))
    def archive_selected(self, request, queryset):
        from django.utils import timezone

        count = 0
        for session in queryset.filter(is_archived=False):
            session.is_archived = True
            session.archived_at = timezone.now()
            session.archived_by = request.user
            session.save(update_fields=["is_archived", "archived_at", "archived_by", "updated_at"])
            count += 1
        self.message_user(request, _("{} session(s) archived.").format(count))

    archive_selected.short_description = _("Archive selected sessions")

    @admin.action(description=_("Restore selected sessions"))
    def restore_selected(self, request, queryset):
        count = 0
        for session in queryset.filter(is_archived=True):
            session.is_archived = False
            session.archived_at = None
            session.archived_by = None
            session.save(update_fields=["is_archived", "archived_at", "archived_by", "updated_at"])
            count += 1
        self.message_user(request, _("{} session(s) restored.").format(count))

    restore_selected.short_description = _("Restore selected sessions")

    @admin.action(description=_("Revoke selected sessions"))
    def revoke_selected(self, request, queryset):
        from django.utils import timezone

        count = 0
        for session in queryset.filter(revoked_at__isnull=True):
            session.revoked_at = timezone.now()
            session.revoked_by = request.user
            session.revoked_reason = "Revoked by admin"
            session.is_active = False
            session.is_archived = True
            session.archived_at = timezone.now()
            session.archived_by = request.user
            session.save(
                update_fields=[
                    "revoked_at",
                    "revoked_by",
                    "revoked_reason",
                    "is_active",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                    "updated_at",
                ]
            )
            count += 1
        self.message_user(request, _("{} session(s) revoked.").format(count))

    revoke_selected.short_description = _("Revoke selected sessions")


@admin.register(FailedLoginAttempt)
class FailedLoginAttemptAdmin(admin.ModelAdmin):
    """Admin for FailedLoginAttempt model."""

    list_display = [
        "id",
        "email",
        "ip_address",
        "attempt_count",
        "locked_status",
        "locked_until",
        "lockout_count",
        "is_archived",
        "created_at",
    ]
    list_filter = ["locked_until", "is_archived", "created_at"]
    search_fields = ["email", "ip_address", "failure_reason"]
    readonly_fields = [
        "id",
        "email",
        "ip_address",
        "user_agent",
        "attempt_count",
        "locked_until",
        "lockout_count",
        "is_locked",
        "failure_reason",
        "first_attempt_at",
        "last_attempt_at",
        "created_at",
        "updated_at",
        "is_archived",
        "archived_at",
        "archived_by",
    ]
    autocomplete_fields = ["archived_by"]
    ordering = ["-last_attempt_at"]
    actions = ["archive_selected", "restore_selected", "unlock_selected"]

    @admin.display(description=_("Locked"))
    def locked_status(self, obj):
        if obj.is_locked():
            return format_html('<span style="color: red;">🔒 Locked</span>')
        return format_html('<span style="color: green;">Unlocked</span>')

    locked_status.short_description = _("Locked")

    @admin.action(description=_("Unlock selected"))
    def unlock_selected(self, request, queryset):
        count = 0
        for attempt in queryset.filter(is_locked=True):
            attempt.unlock(user=request.user)
            count += 1
        self.message_user(request, f"{count} login attempt(s) unlocked.")

    unlock_selected.short_description = _("Unlock selected")

    @admin.action(description=_("Archive selected"))
    def archive_selected(self, request, queryset):
        from django.utils import timezone

        count = 0
        for attempt in queryset.filter(is_archived=False):
            attempt.is_archived = True
            attempt.archived_at = timezone.now()
            attempt.archived_by = request.user
            attempt.save(update_fields=["is_archived", "archived_at", "archived_by", "updated_at"])
            count += 1
        self.message_user(request, _("{} attempt(s) archived.").format(count))

    archive_selected.short_description = _("Archive selected")

    @admin.action(description=_("Restore selected"))
    def restore_selected(self, request, queryset):
        count = 0
        for attempt in queryset.filter(is_archived=True):
            attempt.is_archived = False
            attempt.archived_at = None
            attempt.archived_by = None
            attempt.save(update_fields=["is_archived", "archived_at", "archived_by", "updated_at"])
            count += 1
        self.message_user(request, _("{} attempt(s) restored.").format(count))

    restore_selected.short_description = _("Restore selected")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("archived_by")
