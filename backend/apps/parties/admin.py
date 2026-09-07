# apps/parties/admin.py
"""
Django Admin configuration for Party domain models.

Registers:
- Client
- Supplier
- AssociatedPerson
- ExternalParty
- AssociatedPersonType
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ExternalParty,
    PartyStatus,
    Supplier,
)


@admin.register(AssociatedPersonType)
class AssociatedPersonTypeAdmin(admin.ModelAdmin):
    """Admin for AssociatedPersonType model."""

    list_display = ["reference", "name", "status", "is_default", "is_archived", "created_at"]
    list_filter = ["status", "is_archived", "is_default", "created_at"]
    search_fields = ["reference", "name", "description"]
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
        (_("Identity"), {"fields": ("id", "reference", "name")}),
        (_("Details"), {"fields": ("description", "status", "is_default")}),
        (
            _("Audit"),
            {
                "fields": (
                    "is_archived",
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

    def archive_selected(self, request, queryset):
        for obj in queryset.filter(is_archived=False):
            obj.archive(user=request.user)
        self.message_user(
            request, _(f"{queryset.filter(is_archived=False).count()} type(s) archived.")
        )

    archive_selected.short_description = _("Archive selected types")

    def restore_selected(self, request, queryset):
        count = 0
        for obj in queryset.filter(is_archived=True):
            obj.restore()
            count += 1
        self.message_user(request, _(f"{count} type(s) restored."))

    restore_selected.short_description = _("Restore selected types")


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """Admin for Client model."""

    list_display = [
        "reference",
        "name",
        "trade_name",
        "status_badge",
        "tax_id",
        "email",
        "credit_limit",
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
        "trade_name",
        "registration_number",
        "tax_id",
        "vat_number",
        "email",
        "phone",
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
    autocomplete_fields = [
        "created_by",
        "updated_by",
        "archived_by",
        "company",
        "default_payment_method",
    ]
    actions = ["archive_selected", "restore_selected"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name", "trade_name"),
            },
        ),
        (
            _("Legal Identifiers"),
            {
                "fields": ("registration_number", "tax_id", "vat_number"),
            },
        ),
        (
            _("Contact"),
            {
                "fields": ("email", "phone", "address", "website"),
            },
        ),
        (
            _("Company"),
            {
                "fields": ("company",),
            },
        ),
        (
            _("Defaults"),
            {
                "fields": ("default_payment_method", "credit_limit", "payment_terms"),
            },
        ),
        (
            _("Status"),
            {
                "fields": ("status", "is_archived", "archived_at", "archived_by"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": ("created_at", "updated_at", "created_by", "updated_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def status_badge(self, obj):
        colors = {
            PartyStatus.ACTIVE: "green",
            PartyStatus.INACTIVE: "gray",
            PartyStatus.SUSPENDED: "orange",
            PartyStatus.ARCHIVED: "red",
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


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    """Admin for Supplier model."""

    list_display = [
        "reference",
        "name",
        "trade_name",
        "status_badge",
        "tax_id",
        "email",
        "payment_terms",
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
        "trade_name",
        "registration_number",
        "tax_id",
        "vat_number",
        "email",
        "phone",
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
    autocomplete_fields = [
        "created_by",
        "updated_by",
        "archived_by",
        "company",
        "default_payment_method",
    ]
    actions = ["archive_selected", "restore_selected"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "name", "trade_name"),
            },
        ),
        (
            _("Legal Identifiers"),
            {
                "fields": ("registration_number", "tax_id", "vat_number"),
            },
        ),
        (
            _("Contact"),
            {
                "fields": ("email", "phone", "address", "website"),
            },
        ),
        (
            _("Company"),
            {
                "fields": ("company",),
            },
        ),
        (
            _("Defaults"),
            {
                "fields": ("default_payment_method", "payment_terms"),
            },
        ),
        (
            _("Status"),
            {
                "fields": ("status", "is_archived", "archived_at", "archived_by"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": ("created_at", "updated_at", "created_by", "updated_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def status_badge(self, obj):
        colors = {
            PartyStatus.ACTIVE: "green",
            PartyStatus.INACTIVE: "gray",
            PartyStatus.SUSPENDED: "orange",
            PartyStatus.ARCHIVED: "red",
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


@admin.register(AssociatedPerson)
class AssociatedPersonAdmin(admin.ModelAdmin):
    """Admin for AssociatedPerson model."""

    list_display = [
        "reference",
        "get_full_name",
        "person_type",
        "employee_id",
        "job_title",
        "department",
        "user_link",
        "status_badge",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "status",
        "is_archived",
        "person_type",
        "department",
        "created_at",
    ]
    search_fields = [
        "reference",
        "first_name",
        "last_name",
        "national_id",
        "passport_number",
        "employee_id",
        "job_title",
        "email",
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
    autocomplete_fields = [
        "created_by",
        "updated_by",
        "archived_by",
        "company",
        "person_type",
        "manager",
        "user",
    ]
    actions = ["archive_selected", "restore_selected"]

    fieldsets = (
        (
            _("Identity"),
            {
                "fields": ("id", "reference", "first_name", "middle_name", "last_name"),
            },
        ),
        (
            _("Legal Identifiers"),
            {
                "fields": ("national_id", "passport_number", "tax_id", "vat_number"),
            },
        ),
        (
            _("Professional"),
            {
                "fields": (
                    "person_type",
                    "employee_id",
                    "job_title",
                    "department",
                    "hire_date",
                    "termination_date",
                    "manager",
                ),
            },
        ),
        (
            _("Contact"),
            {
                "fields": ("email", "phone", "mobile", "address"),
            },
        ),
        (
            _("Company"),
            {
                "fields": ("company",),
            },
        ),
        (
            _("User Link"),
            {
                "fields": ("user",),
            },
        ),
        (
            _("Defaults"),
            {
                "fields": ("default_payment_method", "default_currency", "payment_terms"),
            },
        ),
        (
            _("Status"),
            {
                "fields": ("status", "is_archived", "archived_at", "archived_by"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": ("created_at", "updated_at", "created_by", "updated_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def get_full_name(self, obj):
        return obj.get_full_name()

    get_full_name.short_description = _("Full Name")

    def user_link(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/accounts/user/{}/change/">{}</a>', obj.user.id, obj.user.email
            )
        return "-"

    user_link.short_description = _("Linked User")
    user_link.admin_order_field = "user"

    def status_badge(self, obj):
        colors = {
            PartyStatus.ACTIVE: "green",
            PartyStatus.INACTIVE: "gray",
            PartyStatus.SUSPENDED: "orange",
            PartyStatus.ARCHIVED: "red",
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


@admin.register(ExternalParty)
class ExternalPartyAdmin(admin.ModelAdmin):
    """Admin for ExternalParty model."""

    list_display = [
        "reference",
        "name",
        "trade_name",
        "status_badge",
        "party_category",
        "is_recurring",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "status",
        "is_archived",
        "party_category",
        "is_recurring",
        "created_at",
    ]
    search_fields = [
        "reference",
        "name",
        "trade_name",
        "tax_id",
        "vat_number",
        "email",
        "phone",
        "party_category",
        "contact_person",
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
                "fields": ("id", "reference", "name", "trade_name"),
            },
        ),
        (
            _("Categorization"),
            {
                "fields": ("party_category", "is_recurring"),
            },
        ),
        (
            _("Identity Documents"),
            {
                "fields": ("tax_id", "vat_number"),
            },
        ),
        (
            _("Contact"),
            {
                "fields": ("email", "phone", "address"),
            },
        ),
        (
            _("Status"),
            {
                "fields": ("status", "is_archived", "archived_at", "archived_by"),
            },
        ),
        (
            _("Audit"),
            {
                "fields": ("created_at", "updated_at", "created_by", "updated_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def status_badge(self, obj):
        colors = {
            PartyStatus.ACTIVE: "green",
            PartyStatus.INACTIVE: "gray",
            PartyStatus.SUSPENDED: "orange",
            PartyStatus.ARCHIVED: "red",
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
