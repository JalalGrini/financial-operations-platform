from django.contrib import admin

from apps.transfers.models import CashTransfer, EntityOpeningBalance


@admin.register(CashTransfer)
class CashTransferAdmin(admin.ModelAdmin):
    list_display = ["reference", "from_label", "to_label", "amount", "currency", "transfer_date", "status"]
    list_filter = ["status", "from_entity_type", "to_entity_type", "currency"]
    search_fields = ["reference", "note"]
    date_hierarchy = "transfer_date"
    readonly_fields = ["reference", "confirmed_at", "confirmed_by"]


@admin.register(EntityOpeningBalance)
class EntityOpeningBalanceAdmin(admin.ModelAdmin):
    list_display = ["entity_label", "entity_type", "amount", "currency", "as_of_date", "is_archived"]
    list_filter = ["entity_type", "currency", "is_archived"]
    search_fields = ["note", "company__name", "associated_person__first_name", "associated_person__last_name"]
    date_hierarchy = "as_of_date"
