import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    BaseModel,
    CreatorModel,
    ReferenceTrackedModel,
    generate_sequential_reference,
)


class ItemType(models.TextChoices):
    FIXED_ASSET = "fixed_asset", _("Fixed asset")
    CONSUMABLE = "consumable", _("Consumable / stock supply")


class ItemStatus(models.TextChoices):
    AVAILABLE = "available", _("Available")
    ASSIGNED = "assigned", _("Assigned")
    IN_USE = "in_use", _("In use")
    MAINTENANCE = "maintenance", _("Maintenance")
    DAMAGED = "damaged", _("Damaged")
    DISPOSED = "disposed", _("Disposed")


class ItemCondition(models.TextChoices):
    NEW = "new", _("New")
    GOOD = "good", _("Good")
    FAIR = "fair", _("Fair")
    POOR = "poor", _("Poor")
    DAMAGED = "damaged", _("Damaged")


class MovementType(models.TextChoices):
    RECEIPT = "receipt", _("Receipt")
    ISSUE = "issue", _("Issue / consumption")
    RETURN = "return", _("Return")
    ADJUSTMENT = "adjustment", _("Adjustment")
    TRANSFER = "transfer", _("Location transfer")
    DISPOSAL = "disposal", _("Disposal")


class InventoryCategory(ReferenceTrackedModel):
    company = models.ForeignKey(
        "companies.Company", on_delete=models.PROTECT, related_name="inventory_categories"
    )
    name = models.CharField(max_length=150)
    item_type = models.CharField(max_length=20, choices=ItemType.choices, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["company__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                condition=models.Q(is_archived=False),
                name="inv_unique_active_category",
            )
        ]

    def generate_reference(self):
        return generate_sequential_reference(InventoryCategory, f"ICAT-{timezone.now().year}-")

    def __str__(self):
        return f"{self.company} — {self.name}"


class InventoryItem(ReferenceTrackedModel):
    company = models.ForeignKey(
        "companies.Company", on_delete=models.PROTECT, related_name="inventory_items"
    )
    category = models.ForeignKey(
        InventoryCategory, on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    item_type = models.CharField(max_length=20, choices=ItemType.choices)
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=100, blank=True)
    asset_tag = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(Decimal("0"))]
    )
    unit = models.CharField(max_length=30, default="unit")
    purchase_date = models.DateField(null=True, blank=True)
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    currency = models.CharField(max_length=3, default="MAD")
    supplier = models.ForeignKey(
        "parties.Supplier",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_items",
    )
    financial_record = models.ForeignKey(
        "financial_records.FinancialRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_items",
    )
    serial_number = models.CharField(max_length=150, blank=True)
    condition = models.CharField(
        max_length=20, choices=ItemCondition.choices, default=ItemCondition.GOOD
    )
    status = models.CharField(
        max_length=20, choices=ItemStatus.choices, default=ItemStatus.AVAILABLE
    )
    location = models.CharField(max_length=200, blank=True)
    responsible_person = models.ForeignKey(
        "personnel.PersonnelPerson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_inventory_items",
    )
    minimum_stock = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    warranty_expiration = models.DateField(null=True, blank=True)
    useful_life_years = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    image = models.ImageField(upload_to="inventory/%Y/%m/", null=True, blank=True)

    class Meta:
        ordering = ["company__name", "name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0), name="inv_item_quantity_nonnegative"
            ),
            models.UniqueConstraint(
                fields=["company", "asset_tag"],
                condition=models.Q(is_archived=False) & ~models.Q(asset_tag=""),
                name="inv_unique_active_asset_tag",
            ),
        ]
        indexes = [
            models.Index(
                fields=["company", "item_type", "is_archived"], name="inv_company_type_arch_idx"
            ),
            models.Index(fields=["status"], name="inv_item_status_idx"),
        ]

    def generate_reference(self):
        return generate_sequential_reference(InventoryItem, f"INV-{timezone.now().year}-")

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost if self.unit_cost is not None else None

    @property
    def needs_reorder(self):
        return (
            self.item_type == ItemType.CONSUMABLE
            and self.minimum_stock is not None
            and self.quantity <= self.minimum_stock
        )

    def __str__(self):
        return f"{self.reference} — {self.name}"


class InventoryMovement(BaseModel, CreatorModel):
    reference = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="movements")
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_before = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_after = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    occurred_on = models.DateField(default=timezone.localdate)
    from_location = models.CharField(max_length=200, blank=True)
    to_location = models.CharField(max_length=200, blank=True)
    reason = models.CharField(max_length=300)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-occurred_on", "-created_at"]

    def save(self, *args, **kwargs):
        if self.pk and InventoryMovement.objects.filter(pk=self.pk).exists():
            raise ValueError("Inventory movements are immutable.")
        if not self.reference:
            self.reference = f"MOV-{timezone.now().year}-{uuid.uuid4().hex[:10].upper()}"
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Inventory movements are immutable.")

    def __str__(self):
        return f"{self.reference} {self.item.reference} {self.quantity}"
