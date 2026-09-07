from django.contrib import admin

from apps.inventory.models import InventoryCategory, InventoryItem, InventoryMovement

admin.site.register(InventoryCategory)
admin.site.register(InventoryItem)


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "item",
        "movement_type",
        "quantity",
        "quantity_before",
        "quantity_after",
        "occurred_on",
        "created_by",
    )
    readonly_fields = [f.name for f in InventoryMovement._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
