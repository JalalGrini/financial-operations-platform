# apps/configuration/admin.py
"""
Django Admin configuration for Configuration domain models.

Registers:
- Category
- FinancialRecordType
- PaymentMethod
- TransactionType
- ReportType
- NotificationType
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import (
    Category,
    ConfigurationStatus,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)


class BaseConfigurationAdmin(admin.ModelAdmin):
    """Base admin for all configuration models."""

    list_display = [
        "reference",
        "name",
        "status_badge",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "status",
        "is_archived",
        "created_at",
    ]
    search_fields = [
        "reference",
        "name",
        "description",
    ]
    readonly_fields = [
        "id",
        "reference",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
    ]
    autocomplete_fields = ["created_by", "updated_by", "archived_by"]
    actions = ["archive_selected", "restore_selected"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def status_badge(self, obj):
        colors = {
            ConfigurationStatus.ACTIVE: "green",
            ConfigurationStatus.INACTIVE: "gray",
            ConfigurationStatus.ARCHIVED: "red",
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
        for obj in queryset.filter(is_archived=False):
            obj.archive(user=request.user)
        self.message_user(request, _(f"{queryset.filter(is_archived=False).count()} archived."))

    archive_selected.short_description = _("Archive selected")

    def restore_selected(self, request, queryset):
        count = 0
        for obj in queryset.filter(is_archived=True):
            obj.restore()
            count += 1
        self.message_user(request, _(f"{count} restored."))

    restore_selected.short_description = _("Restore selected")


@admin.register(Category)
class CategoryAdmin(BaseConfigurationAdmin):
    """Admin for Category model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "parent",
        "level",
        "is_income",
        "is_expense",
        "is_transfer",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + [
        "parent",
        "is_income",
        "is_expense",
        "is_transfer",
        "status",
    ]
    search_fields = BaseConfigurationAdmin.search_fields + ["path"]
    autocomplete_fields = BaseConfigurationAdmin.autocomplete_fields + ["parent"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Hierarchy"),
            {
                "fields": ("parent", "level", "path"),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Scope"),
            {
                "fields": ("is_income", "is_expense", "is_transfer"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(FinancialRecordType)
class FinancialRecordTypeAdmin(BaseConfigurationAdmin):
    """Admin for FinancialRecordType model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "nature",
        "direction",
        "default_category",
        "requires_validation",
        "requires_approval",
        "allows_partial_payment",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + [
        "nature",
        "direction",
        "requires_validation",
        "requires_approval",
        "allows_partial_payment",
        "status",
    ]
    search_fields = BaseConfigurationAdmin.search_fields + ["reference_prefix", "default_template"]
    autocomplete_fields = BaseConfigurationAdmin.autocomplete_fields + [
        "default_category",
        "default_payment_method",
        "allowed_categories",
    ]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Classification"),
            {
                "fields": ("nature", "direction"),
            },
        ),
        (
            _("Category"),
            {
                "fields": ("default_category", "allowed_categories"),
            },
        ),
        (
            _("Template"),
            {
                "fields": ("default_template",),
            },
        ),
        (
            _("Defaults"),
            {
                "fields": ("default_payment_method", "default_payment_terms"),
            },
        ),
        (
            _("Workflow"),
            {
                "fields": ("requires_validation", "requires_approval", "allows_partial_payment"),
            },
        ),
        (
            _("Numbering"),
            {
                "fields": ("reference_prefix",),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(PaymentMethod)
class PaymentMethodAdmin(BaseConfigurationAdmin):
    """Admin for PaymentMethod model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "kind",
        "is_electronic",
        "requires_bank_details",
        "requires_reference",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + [
        "kind",
        "is_electronic",
        "requires_bank_details",
        "requires_reference",
        "status",
    ]
    search_fields = BaseConfigurationAdmin.search_fields + ["kind"]
    readonly_fields = BaseConfigurationAdmin.readonly_fields + [
        "extra_fields",
        "default_field_values",
    ]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Classification"),
            {
                "fields": ("kind", "is_electronic"),
            },
        ),
        (
            _("Requirements"),
            {
                "fields": ("requires_bank_details", "requires_reference"),
            },
        ),
        (
            _("Extra Fields"),
            {
                "fields": ("extra_fields", "default_field_values"),
                "classes": ("collapse",),
            },
        ),
        (
            _("Processing"),
            {
                "fields": ("processing_days", "fee_percentage", "fee_fixed"),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(TransactionType)
class TransactionTypeAdmin(BaseConfigurationAdmin):
    """Admin for TransactionType model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "nature",
        "direction",
        "is_reversal",
        "is_adjustment",
        "is_opening_balance",
        "is_transfer",
        "requires_approval",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + [
        "nature",
        "direction",
        "is_reversal",
        "is_adjustment",
        "is_opening_balance",
        "is_transfer",
        "requires_approval",
        "status",
    ]
    search_fields = BaseConfigurationAdmin.search_fields + ["reference_prefix"]
    autocomplete_fields = BaseConfigurationAdmin.autocomplete_fields + ["allowed_payment_methods"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Nature"),
            {
                "fields": ("nature", "direction"),
            },
        ),
        (
            _("Behavior"),
            {
                "fields": (
                    "is_reversal",
                    "is_adjustment",
                    "is_opening_balance",
                    "is_transfer",
                ),
            },
        ),
        (
            _("Requirements"),
            {
                "fields": (
                    "requires_counterparty",
                    "requires_payment_method",
                    "requires_reason",
                ),
            },
        ),
        (
            _("Payment Methods"),
            {
                "fields": ("allowed_payment_methods",),
            },
        ),
        (
            _("Workflow"),
            {
                "fields": ("requires_approval", "is_system"),
            },
        ),
        (
            _("Numbering"),
            {
                "fields": ("reference_prefix",),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(ReportType)
class ReportTypeAdmin(BaseConfigurationAdmin):
    """Admin for ReportType model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "category",
        "frequency",
        "supports_preview",
        "supports_scheduled",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + [
        "frequency",
        "supports_preview",
        "supports_scheduled",
        "status",
    ]
    search_fields = BaseConfigurationAdmin.search_fields + ["template_name"]
    autocomplete_fields = BaseConfigurationAdmin.autocomplete_fields + ["category"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Classification"),
            {
                "fields": ("category",),
            },
        ),
        (
            _("Generation"),
            {
                "fields": ("frequency", "supports_preview", "supports_scheduled"),
            },
        ),
        (
            _("Template"),
            {
                "fields": ("template_name", "export_formats"),
            },
        ),
        (
            _("Parameters"),
            {
                "fields": ("available_filters", "default_parameters"),
                "classes": ("collapse",),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(NotificationType)
class NotificationTypeAdmin(BaseConfigurationAdmin):
    """Admin for NotificationType model."""

    list_display = BaseConfigurationAdmin.list_display + [
        "default_priority",
        "default_channels_display",
        "display_order",
    ]
    list_filter = BaseConfigurationAdmin.list_filter + ["default_priority", "status"]
    search_fields = BaseConfigurationAdmin.search_fields + ["subject_template"]
    readonly_fields = BaseConfigurationAdmin.readonly_fields + [
        "default_channels",
        "available_channels",
        "default_recipient_roles",
    ]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name"),
            },
        ),
        (
            _("Channels"),
            {
                "fields": ("default_channels", "available_channels"),
            },
        ),
        (
            _("Template"),
            {
                "fields": ("subject_template", "body_template"),
            },
        ),
        (
            _("Defaults"),
            {
                "fields": ("default_priority", "default_recipient_roles"),
            },
        ),
        (
            _("Display"),
            {
                "fields": ("icon", "color", "display_order"),
            },
        ),
        (
            _("Details"),
            {
                "fields": ("description", "status", "is_archived"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": (
                    "archived_at",
                    "archived_by",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def default_channels_display(self, obj):
        return ", ".join(obj.default_channels) if obj.default_channels else "-"

    default_channels_display.short_description = _("Default Channels")
