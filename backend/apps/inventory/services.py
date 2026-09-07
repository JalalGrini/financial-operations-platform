from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.audit_log.services import record_event
from apps.inventory.models import InventoryItem, InventoryMovement, MovementType

INCOMING = {MovementType.RECEIPT, MovementType.RETURN}
OUTGOING = {MovementType.ISSUE, MovementType.DISPOSAL}


@transaction.atomic
def record_movement(
    *,
    item,
    movement_type,
    quantity,
    reason,
    user,
    occurred_on=None,
    unit_cost=None,
    from_location="",
    to_location="",
    notes="",
    request=None,
):
    locked = InventoryItem.all_objects.select_for_update().get(pk=item.pk)
    if locked.is_archived:
        raise ValidationError(
            {"item": ["Restore this inventory item before recording a movement."]}
        )
    qty = Decimal(str(quantity))
    if movement_type in INCOMING:
        if qty <= 0:
            raise ValidationError(
                {"quantity": ["Receipt and return quantities must be greater than zero."]}
            )
        delta = qty
    elif movement_type in OUTGOING:
        if qty <= 0:
            raise ValidationError(
                {"quantity": ["Issue and disposal quantities must be greater than zero."]}
            )
        delta = -qty
    elif movement_type == MovementType.ADJUSTMENT:
        if qty == 0:
            raise ValidationError(
                {
                    "quantity": [
                        "An adjustment cannot be zero. Use a positive or negative correction."
                    ]
                }
            )
        delta = qty
    elif movement_type == MovementType.TRANSFER:
        if not to_location.strip():
            raise ValidationError(
                {"to_location": ["Destination location is required for a transfer."]}
            )
        delta = Decimal("0")
    else:
        raise ValidationError({"movement_type": ["Unsupported inventory movement type."]})
    after = locked.quantity + delta
    if after < 0:
        raise ValidationError(
            {
                "quantity": [
                    f"Insufficient stock. Available quantity is {locked.quantity} {locked.unit}."
                ]
            }
        )
    before = locked.quantity
    if movement_type == MovementType.TRANSFER:
        locked.location = to_location.strip()
    locked.quantity = after
    locked.updated_by = user
    locked.save(update_fields=["quantity", "location", "updated_by", "updated_at"])
    movement = InventoryMovement.objects.create(
        item=locked,
        movement_type=movement_type,
        quantity=qty,
        quantity_before=before,
        quantity_after=after,
        unit_cost=unit_cost,
        occurred_on=occurred_on or timezone.localdate(),
        from_location=from_location
        or (item.location if movement_type == MovementType.TRANSFER else ""),
        to_location=to_location,
        reason=reason,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    record_event(
        action="inventory_movement",
        summary=f"{movement.get_movement_type_display()} {qty} {locked.unit} for {locked.reference}",
        actor=user,
        entity=locked,
        before={"quantity": before, "location": item.location},
        after={"quantity": after, "location": locked.location},
        reason=reason,
        request=request,
    )
    return movement
