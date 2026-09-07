# apps/companies/serializers.py
"""
Company Serializers.
"""
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.companies.models import Company, CompanyPreference, CompanyPreferenceType, CompanySettings


class EmptyStringToNullMixin:
    """Convert empty-string values to None for a declared set of nullable fields.

    Frontend forms submit empty strings ("") for optional unique/date fields.
    Empty strings collide on unique-constrained columns (Postgres allows many
    NULLs but only one ""), so they must be normalized to None before save.
    """

    empty_to_null_fields = ()

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            for field in self.empty_to_null_fields:
                if field in data and data[field] == "":
                    data[field] = None
        return super().to_internal_value(data)


class CompanySerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for Company list view."""

    empty_to_null_fields = ("registration_number", "tax_id", "vat_number")

    class Meta:
        model = Company
        fields = [
            "id",
            "reference",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "address",
            "phone",
            "email",
            "website",
            "status",
            "default_currency",
            "timezone",
            "default_language",
            "is_archived",
            "archived_at",
            "archived_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "is_archived",
            "archived_at",
            "archived_by",
            "created_at",
            "updated_at",
        ]


class CompanyDetailSerializer(CompanySerializer):
    """Detailed serializer for Company with related data."""

    settings = serializers.SerializerMethodField()
    preferences = serializers.SerializerMethodField()

    class Meta(CompanySerializer.Meta):
        fields = CompanySerializer.Meta.fields + ["settings", "preferences"]

    def get_settings(self, obj):
        if hasattr(obj, "settings"):
            return CompanySettingsSerializer(obj.settings).data
        return None

    def get_preferences(self, obj):
        prefs = obj.preferences.all()
        return CompanyPreferenceSerializer(prefs, many=True).data


class CompanyCreateSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for creating Company."""

    empty_to_null_fields = ("registration_number", "tax_id", "vat_number")

    class Meta:
        model = Company
        fields = [
            "id",
            "reference",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "address",
            "phone",
            "email",
            "website",
            "default_currency",
            "timezone",
            "default_language",
        ]
        read_only_fields = ["id", "reference"]

    def validate_registration_number(self, value):
        if value and Company.objects.filter(registration_number=value).exists():
            raise serializers.ValidationError(
                _("A company with this registration number already exists.")
            )
        return value

    def validate_tax_id(self, value):
        if value and Company.objects.filter(tax_id=value).exists():
            raise serializers.ValidationError(_("A company with this tax ID already exists."))
        return value

    def validate_email(self, value):
        if value and Company.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(_("A company with this email already exists."))
        return value


class CompanySettingsSerializer(serializers.ModelSerializer):
    """Serializer for CompanySettings."""

    # Map model fields to frontend-expected names
    invoice_prefix = serializers.CharField(
        source="record_reference_prefix", required=False, allow_blank=True
    )
    invoice_number_format = serializers.CharField(
        source="transaction_reference_prefix", required=False, allow_blank=True
    )
    default_payment_terms = serializers.SerializerMethodField()
    default_currency = serializers.CharField(required=False, allow_blank=True)
    require_approval = serializers.BooleanField(default=False)
    approval_threshold = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, allow_null=True
    )
    default_tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    auto_send_invoices = serializers.BooleanField(default=False)
    invoice_footer_text = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = CompanySettings
        fields = [
            "id",
            "company",
            "invoice_prefix",
            "invoice_number_format",
            "default_payment_terms",
            "default_currency",
            "require_approval",
            "approval_threshold",
            "default_tax_rate",
            "auto_send_invoices",
            "invoice_footer_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "company", "created_at", "updated_at"]

    def get_default_payment_terms(self, obj):
        # default_record_type is a CharField, but frontend expects integer
        # Parse the string value to int, default to 30 if invalid
        try:
            return int(obj.default_record_type) if obj.default_record_type else 30
        except (ValueError, TypeError):
            return 30


class CompanyPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for CompanyPreference."""

    typed_value = serializers.SerializerMethodField()
    value_type = serializers.CharField(source="preference_type", read_only=True)

    class Meta:
        model = CompanyPreference
        fields = [
            "id",
            "company",
            "key",
            "value_type",
            "value",
            "typed_value",
            "description",
            "is_system",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "company",
            "key",
            "value_type",
            "is_system",
            "created_at",
            "updated_at",
            "typed_value",
        ]

    def get_typed_value(self, obj):
        return obj.get_typed_value()


class CompanyPreferenceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating CompanyPreference.

    The public API contract uses `value_type` (matching
    `CompanyPreferenceSerializer`'s read-only `value_type` field), while the
    underlying model field is `preference_type`. This mapping is explicit
    below via `source="preference_type"` so that:

    - `value_type` validates against the model's own
      `CompanyPreferenceType` choices (no duplicated choice list).
    - drf-spectacular can introspect this field, since it is declared
      explicitly rather than left for `ModelSerializer` to resolve against
      a nonexistent `value_type` model field (see EFOP Engineering Log
      finding M-10 / AR-03).
    - No model or migration change is required; `preference_type` remains
      the persisted field name.
    """

    value_type = serializers.ChoiceField(
        source="preference_type",
        choices=CompanyPreferenceType.choices,
    )

    class Meta:
        model = CompanyPreference
        fields = ["id", "key", "value_type", "value", "description"]
        read_only_fields = ["id"]


class CompanySettingsCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating CompanySettings."""

    # Map frontend field names to model field names
    invoice_prefix = serializers.CharField(
        source="record_reference_prefix", required=False, allow_blank=True
    )
    invoice_number_format = serializers.CharField(
        source="transaction_reference_prefix", required=False, allow_blank=True
    )
    default_payment_terms = serializers.IntegerField(required=False, allow_null=True)
    default_currency = serializers.CharField(required=False, allow_blank=True)
    require_approval = serializers.BooleanField(default=False)
    approval_threshold = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, allow_null=True
    )
    default_tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    auto_send_invoices = serializers.BooleanField(default=False)
    invoice_footer_text = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = CompanySettings
        fields = [
            "invoice_prefix",
            "invoice_number_format",
            "default_payment_terms",
            "default_currency",
            "require_approval",
            "approval_threshold",
            "default_tax_rate",
            "auto_send_invoices",
            "invoice_footer_text",
        ]

    def update(self, instance, validated_data):
        # Handle default_payment_terms - store as default_record_type string if provided
        default_payment_terms = validated_data.pop("default_payment_terms", None)
        if default_payment_terms is not None:
            instance.default_record_type = str(default_payment_terms)
        instance = super().update(instance, validated_data)
        return instance
