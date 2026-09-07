# apps/transfers/serializers.py
from django.utils import timezone
from rest_framework import serializers

from apps.transfers.models import (
    MONEY_DECIMAL_PLACES,
    MONEY_MAX_DIGITS,
    CashTransfer,
    EntityOpeningBalance,
    EntityType,
    TransferStatus,
)


class CashTransferSerializer(serializers.ModelSerializer):
    from_label = serializers.SerializerMethodField()
    to_label = serializers.SerializerMethodField()
    is_editable = serializers.BooleanField(read_only=True)
    from_company_name = serializers.SerializerMethodField()
    to_company_name = serializers.SerializerMethodField()
    from_person_name = serializers.SerializerMethodField()
    to_person_name = serializers.SerializerMethodField()

    class Meta:
        model = CashTransfer
        fields = [
            "id",
            "reference",
            "from_entity_type",
            "from_company",
            "from_company_name",
            "from_associated_person",
            "from_person_name",
            "from_label",
            "to_entity_type",
            "to_company",
            "to_company_name",
            "to_associated_person",
            "to_person_name",
            "to_label",
            "amount",
            "currency",
            "transfer_date",
            "note",
            "status",
            "confirmed_at",
            "confirmed_by",
            "is_editable",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "reference", "confirmed_at", "confirmed_by",
            "created_at", "updated_at", "is_editable",
        ]

    def get_from_label(self, obj):
        return obj.from_label

    def get_to_label(self, obj):
        return obj.to_label

    def get_from_company_name(self, obj):
        return obj.from_company.name if obj.from_company else None

    def get_to_company_name(self, obj):
        return obj.to_company.name if obj.to_company else None

    def get_from_person_name(self, obj):
        return obj.from_associated_person.full_name if obj.from_associated_person else None

    def get_to_person_name(self, obj):
        return obj.to_associated_person.full_name if obj.to_associated_person else None


class CashTransferWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashTransfer
        fields = [
            "from_entity_type",
            "from_company",
            "from_associated_person",
            "to_entity_type",
            "to_company",
            "to_associated_person",
            "amount",
            "currency",
            "transfer_date",
            "note",
        ]

    def validate(self, attrs):
        # Resolved against the existing row on PATCH. The previous version read
        # only `attrs`, so a partial update that changed one side of the
        # transfer skipped every rule below - including the self-transfer check.
        from_type, from_company, from_person = _validate_entity_pairing(
            attrs, "from_entity_type", "from_company", "from_associated_person",
            instance=self.instance,
        )
        to_type, to_company, to_person = _validate_entity_pairing(
            attrs, "to_entity_type", "to_company", "to_associated_person",
            instance=self.instance,
        )

        # Cannot transfer to self
        if from_type == EntityType.COMPANY and to_type == EntityType.COMPANY and from_company == to_company:
            raise serializers.ValidationError("A company cannot transfer to itself.")

        if (
            from_type == EntityType.ASSOCIATED_PERSON
            and to_type == EntityType.ASSOCIATED_PERSON
            and from_person == to_person
        ):
            raise serializers.ValidationError("An associated person cannot transfer to themselves.")

        if attrs.get("amount") is not None and attrs["amount"] <= 0:
            # A zero or negative transfer has no meaning: direction is already
            # carried by the from/to pair, so a negative amount would silently
            # invert it and corrupt both entities' balances.
            raise serializers.ValidationError(
                {"amount": "Transfer amount must be greater than zero."}
            )

        # Keep the unused FK NULL so a change of entity type cannot leave a
        # stale reference that still counts toward the other entity's balance.
        if from_type == EntityType.COMPANY:
            attrs["from_associated_person"] = None
        elif from_type == EntityType.ASSOCIATED_PERSON:
            attrs["from_company"] = None
        if to_type == EntityType.COMPANY:
            attrs["to_associated_person"] = None
        elif to_type == EntityType.ASSOCIATED_PERSON:
            attrs["to_company"] = None

        return attrs


def _validate_entity_pairing(attrs, type_field, company_field, person_field, instance=None):
    """Shared rule: `type_field` decides which of the two FKs must be set.

    Falls back to `instance` values so a PATCH that touches only one of the
    three fields is still judged against the resulting row rather than against
    a half-empty payload.
    """

    def resolved(name):
        if name in attrs:
            return attrs[name]
        return getattr(instance, name, None) if instance is not None else None

    entity_type = resolved(type_field)
    company = resolved(company_field)
    person = resolved(person_field)

    if entity_type == EntityType.COMPANY:
        if not company:
            raise serializers.ValidationError(
                {company_field: "Company is required when the entity type is 'company'."}
            )
    elif entity_type == EntityType.ASSOCIATED_PERSON:
        if not person:
            raise serializers.ValidationError(
                {
                    person_field: (
                        "Associated person is required when the entity type is "
                        "'associated_person'."
                    )
                }
            )
    return entity_type, company, person


class EntityOpeningBalanceSerializer(serializers.ModelSerializer):
    """Read representation, including a resolved label for list rendering."""

    entity_label = serializers.CharField(read_only=True)
    company_name = serializers.SerializerMethodField()
    person_name = serializers.SerializerMethodField()

    class Meta:
        model = EntityOpeningBalance
        fields = [
            "id",
            "entity_type",
            "company",
            "company_name",
            "associated_person",
            "person_name",
            "entity_label",
            "amount",
            "currency",
            "as_of_date",
            "note",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_archived", "created_at", "updated_at"]

    def get_company_name(self, obj):
        return obj.company.name if obj.company else None

    def get_person_name(self, obj):
        return obj.associated_person.get_full_name() if obj.associated_person else None


class EntityOpeningBalanceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = EntityOpeningBalance
        fields = [
            "entity_type",
            "company",
            "associated_person",
            "amount",
            "currency",
            "as_of_date",
            "note",
        ]
        extra_kwargs = {
            # A starting position of "today" is the overwhelmingly common case
            # and making the user pick a date to express it is friction.
            "as_of_date": {"required": False},
        }

    def validate_as_of_date(self, value):
        return value or timezone.localdate()

    def validate(self, attrs):
        entity_type, company, person = _validate_entity_pairing(
            attrs,
            "entity_type",
            "company",
            "associated_person",
            instance=self.instance,
        )

        # Keep the unused side NULL so the partial unique constraints stay
        # meaningful; otherwise a stale FK from a previous entity_type would
        # keep occupying a slot.
        if entity_type == EntityType.COMPANY:
            attrs["associated_person"] = None
        elif entity_type == EntityType.ASSOCIATED_PERSON:
            attrs["company"] = None

        attrs.setdefault("as_of_date", timezone.localdate())

        currency = attrs.get("currency") or getattr(self.instance, "currency", None) or "MAD"
        duplicate = EntityOpeningBalance.objects.filter(currency=currency)
        if entity_type == EntityType.COMPANY and company:
            duplicate = duplicate.filter(company=company)
        elif entity_type == EntityType.ASSOCIATED_PERSON and person:
            duplicate = duplicate.filter(associated_person=person)
        else:
            duplicate = duplicate.none()
        if self.instance is not None:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            # Surfaced as a 400 with a usable message instead of the IntegrityError
            # (HTTP 500) the database constraint alone would raise.
            raise serializers.ValidationError(
                {
                    "entity_type": (
                        "This entity already has an opening balance in "
                        f"{currency}. Edit the existing one instead."
                    )
                }
            )
        return attrs


class EntityBalanceRowSerializer(serializers.Serializer):
    """One row of the per-entity balance table.

    Declared explicitly (rather than returning raw dicts) so every money field
    renders as a fixed-precision string. DRF's JSON encoder turns Decimal into
    float, which silently introduces binary rounding error into money.
    """

    entity_type = serializers.CharField()
    entity_id = serializers.CharField()
    entity_label = serializers.CharField()
    opening_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    transfers_in = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    transfers_out = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    net_transfers = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    current_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    pending_in = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    pending_out = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    pending_net = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    projected_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)


class EntityBalanceTotalsSerializer(serializers.Serializer):
    opening_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    transfers_in = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    transfers_out = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    net_transfers = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    current_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    pending_net = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)
    projected_balance = serializers.DecimalField(MONEY_MAX_DIGITS, MONEY_DECIMAL_PLACES)


class EntityBalanceReportSerializer(serializers.Serializer):
    currency = serializers.CharField()
    entities = EntityBalanceRowSerializer(many=True)
    totals = EntityBalanceTotalsSerializer()
    other_currencies = serializers.ListField(child=serializers.CharField())
    is_balanced = serializers.BooleanField()
