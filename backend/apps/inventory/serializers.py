from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.security import validate_private_upload
from apps.inventory.models import InventoryCategory, InventoryItem, InventoryMovement, ItemType


class InventoryCategorySerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = InventoryCategory
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "name",
            "item_type",
            "description",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "company_name",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        company = attrs.get("company", getattr(self.instance, "company", None))
        name = attrs.get("name", getattr(self.instance, "name", None))
        q = InventoryCategory.all_objects.filter(
            company=company, name__iexact=name, is_archived=False
        )
        if self.instance:
            q = q.exclude(pk=self.instance.pk)
        if q.exists():
            raise serializers.ValidationError(
                {
                    "name": [
                        "An active inventory category with this name already exists for the selected company."
                    ]
                }
            )
        return attrs


class InventoryItemSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True, required=False, allow_null=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default="")
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")
    responsible_person_name = serializers.CharField(
        source="responsible_person.get_full_name", read_only=True, default=""
    )
    total_cost = serializers.DecimalField(max_digits=22, decimal_places=4, read_only=True)
    needs_reorder = serializers.BooleanField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "category",
            "category_name",
            "item_type",
            "name",
            "sku",
            "asset_tag",
            "description",
            "quantity",
            "unit",
            "purchase_date",
            "unit_cost",
            "total_cost",
            "currency",
            "supplier",
            "supplier_name",
            "financial_record",
            "serial_number",
            "condition",
            "status",
            "location",
            "responsible_person",
            "responsible_person_name",
            "minimum_stock",
            "needs_reorder",
            "warranty_expiration",
            "useful_life_years",
            "notes",
            "image",
            "image_url",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "company_name",
            "category_name",
            "supplier_name",
            "responsible_person_name",
            "total_cost",
            "needs_reorder",
            "image_url",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["quantity"].read_only = True

    def get_image_url(self, obj):
        if not obj.image:
            return None
        # Same-origin API path so the Vercel proxy can send session cookies.
        # An absolute Railway URL would 401 in the browser.
        return f"/api/v1/inventory/items/{obj.pk}/image/"

    def validate_image(self, value):
        if not value:
            return value
        try:
            return validate_private_upload(
                value, max_bytes=5 * 1024 * 1024, allowed={".png", ".jpg", ".jpeg"}
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc

    def validate(self, attrs):
        company = attrs.get("company", getattr(self.instance, "company", None))
        category = attrs.get("category", getattr(self.instance, "category", None))
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        person = attrs.get("responsible_person", getattr(self.instance, "responsible_person", None))
        item_type = attrs.get("item_type", getattr(self.instance, "item_type", None))
        minimum = attrs.get("minimum_stock", getattr(self.instance, "minimum_stock", None))
        errors = {}
        if category and category.company_id != getattr(company, "id", None):
            errors["category"] = ["Category must belong to the selected company."]
        if supplier and supplier.company_id != getattr(company, "id", None):
            errors["supplier"] = ["Supplier must belong to the selected company."]
        if person and not person.employments.filter(company=company, is_archived=False).exists():
            errors["responsible_person"] = [
                "Responsible person must have an active employment in the selected company."
            ]
        if item_type == ItemType.FIXED_ASSET and minimum is not None:
            errors["minimum_stock"] = ["Minimum stock applies only to consumables."]
        tag = attrs.get("asset_tag", getattr(self.instance, "asset_tag", "") or "")
        if tag:
            q = InventoryItem.all_objects.filter(
                company=company, asset_tag__iexact=tag, is_archived=False
            )
            if self.instance:
                q = q.exclude(pk=self.instance.pk)
            if q.exists():
                errors["asset_tag"] = [
                    "This asset tag is already used by an active item in the selected company."
                ]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class InventoryMovementSerializer(serializers.ModelSerializer):
    item_reference = serializers.CharField(source="item.reference", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, default=""
    )

    class Meta:
        model = InventoryMovement
        fields = [
            "id",
            "reference",
            "item",
            "item_reference",
            "item_name",
            "movement_type",
            "quantity",
            "quantity_before",
            "quantity_after",
            "unit_cost",
            "occurred_on",
            "from_location",
            "to_location",
            "reason",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "quantity_before",
            "quantity_after",
            "created_by",
            "created_by_name",
            "created_at",
        ]

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "Reason is required so the stock change remains traceable."
            )
        return value.strip()
