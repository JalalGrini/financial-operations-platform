# apps/companies/admin.py
"""
Django Admin configuration for Company domain models.

Registers:
- Company
- CompanySettings
- CompanyPreference
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import (
    Company,
    CompanyPreference,
    CompanyPreferenceType,
    CompanySettings,
    CompanyStatus,
)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    """
    Admin for Company model.
    """

    list_display = [
        "reference",
        "name",
        "trade_name",
        "status_badge",
        "default_currency",
        "default_language",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "status",
        "is_archived",
        "default_currency",
        "default_language",
        "created_at",
    ]
    search_fields = [
        "reference",
        "name",
        "trade_name",
        "registration_number",
        "tax_id",
        "vat_number",
        "email",
    ]
    readonly_fields = [
        "id",
        "reference",
        "created_at",
        "updated_at",
        "archived_at",
        "archived_by",
    ]
    ordering = ["-created_at"]
    autocomplete_fields = ["archived_by"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": (
                    "id",
                    "reference",
                    "name",
                    "trade_name",
                ),
            },
        ),
        (
            _("Legal Identifiers"),
            {
                "fields": (
                    "registration_number",
                    "tax_id",
                    "vat_number",
                    "cnss_number",
                    "patent_number",
                    "rib",
                    "activities",
                ),
            },
        ),
        (
            _("Contact"),
            {
                "fields": (
                    "email",
                    "phone",
                    "address",
                    "website",
                ),
            },
        ),
        (
            _("Defaults & Localization"),
            {
                "fields": (
                    "default_currency",
                    "default_language",
                    "timezone",
                ),
            },
        ),
        (
            _("Status & Audit"),
            {
                "fields": (
                    "status",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                ),
            },
        ),
    )

    actions = ["archive_selected", "restore_selected"]

    def status_badge(self, obj):
        """Display status as colored badge."""
        colors = {
            CompanyStatus.ACTIVE: "green",
            CompanyStatus.INACTIVE: "gray",
            CompanyStatus.SUSPENDED: "orange",
            CompanyStatus.ARCHIVED: "red",
        }
        color = colors.get(obj.status, "black")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = _("Status")
    status_badge.admin_order_field = "status"

    def archive_selected(self, request, queryset):
        """Archive selected companies."""
        for company in queryset.filter(is_archived=False):
            company.archive(user=request.user)
        self.message_user(
            request,
            _(f"{queryset.filter(is_archived=False).count()} company(s) archived."),
        )

    archive_selected.short_description = _("Archive selected companies")

    def restore_selected(self, request, queryset):
        """Restore selected archived companies."""
        count = 0
        for company in queryset.filter(is_archived=True):
            company.restore()
            count += 1
        self.message_user(
            request,
            _(f"{count} company(s) restored."),
        )

    restore_selected.short_description = _("Restore selected companies")


@admin.register(CompanySettings)
class CompanySettingsAdmin(admin.ModelAdmin):
    """
    Admin for CompanySettings model.
    """

    list_display = [
        "company",
        "auto_validate_records",
        "auto_approve_records",
        "require_payment_confirmation",
        "allow_internal_transfers",
        "updated_at",
    ]
    list_filter = [
        "auto_validate_records",
        "auto_approve_records",
        "require_payment_confirmation",
        "allow_internal_transfers",
        "require_transfer_approval",
        "notify_on_payment",
        "notify_on_transfer",
        "notify_on_report_generated",
        "assistants_can_manage_records",
        "assistants_can_manage_parties",
        "assistants_can_create_transfers",
    ]
    search_fields = ["company__name", "company__reference"]
    readonly_fields = [
        "created_at",
        "updated_at",
    ]
    autocomplete_fields = [
        "company",
        "default_payment_method",
    ]

    fieldsets = (
        (
            _("Company"),
            {"fields": ("company",)},
        ),
        (
            _("Financial Records"),
            {
                "fields": (
                    "default_record_type",
                    "auto_validate_records",
                    "auto_approve_records",
                    "require_payment_confirmation",
                ),
            },
        ),
        (
            _("Payments & Transfers"),
            {
                "fields": (
                    "default_payment_method",
                    "allow_internal_transfers",
                    "require_transfer_approval",
                ),
            },
        ),
        (
            _("Reference Prefixes"),
            {
                "fields": (
                    "record_reference_prefix",
                    "transaction_reference_prefix",
                ),
            },
        ),
        (
            _("Notifications"),
            {
                "fields": (
                    "notify_on_payment",
                    "notify_on_transfer",
                    "notify_on_report_generated",
                ),
            },
        ),
        (
            _("Permissions Defaults"),
            {
                "fields": (
                    "assistants_can_manage_records",
                    "assistants_can_manage_parties",
                    "assistants_can_create_transfers",
                ),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
            },
        ),
    )


@admin.register(CompanyPreference)
class CompanyPreferenceAdmin(admin.ModelAdmin):
    """
    Admin for CompanyPreference model.
    """

    list_display = [
        "company",
        "key",
        "display_value",
        "preference_type",
        "is_system",
        "is_archived",
        "updated_at",
    ]
    list_filter = [
        "preference_type",
        "is_system",
        "is_archived",
        "company",
    ]
    search_fields = [
        "key",
        "value",
        "company__name",
        "company__reference",
    ]
    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
        "archived_at",
        "archived_by",
    ]
    autocomplete_fields = ["company", "archived_by"]

    fieldsets = (
        (
            _("Company"),
            {"fields": ("company",)},
        ),
        (
            _("Preference"),
            {"fields": ("key", "value", "preference_type", "description", "is_system")},
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "is_archived",
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                ),
            },
        ),
    )

    actions = ["archive_selected", "restore_selected"]

    def display_value(self, obj):
        """Display truncated value."""
        if obj.preference_type == CompanyPreferenceType.JSON:
            import json

            try:
                parsed = json.loads(obj.value)
                return format_html(
                    '<pre style="max-width: 300px; overflow: auto;">{}</pre>',
                    json.dumps(parsed, indent=2),
                )
            except (ValueError, TypeError):
                # Not valid JSON (or not a string): fall through to the plain
                # truncated display below. A bare except would also swallow
                # KeyboardInterrupt/SystemExit.
                pass
        value = obj.value
        if len(value) > 50:
            return value[:47] + "..."
        return value

    display_value.short_description = _("Value")

    def archive_selected(self, request, queryset):
        for pref in queryset.filter(is_archived=False):
            pref.archive(user=request.user)
        self.message_user(
            request,
            _(f"{queryset.filter(is_archived=False).count()} preference(s) archived."),
        )

    archive_selected.short_description = _("Archive selected preferences")

    def restore_selected(self, request, queryset):
        count = 0
        for pref in queryset.filter(is_archived=True):
            pref.restore()
            count += 1
        self.message_user(
            request,
            _(f"{count} preference(s) restored."),
        )

    restore_selected.short_description = _("Restore selected preferences")
