# apps/parties/serializers.py
"""
Parties Serializers.

Serializers for Parties domain API endpoints.
"""
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.companies.serializers import CompanySerializer
from apps.configuration.serializers import PaymentMethodSerializer
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ClientKind,
    ExternalParty,
    Supplier,
)


class ClientSerializer(serializers.ModelSerializer):
    """Serializer for Client list view."""

    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = Client
        fields = [
            "is_archived",
            "id",
            "reference",
            "company",
            "company_name",
            "client_kind",
            "first_name",
            "last_name",
            "national_id",
            "passport_number",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "email",
            "phone",
            "address",
            "website",
            "status",
            "credit_limit",
            "payment_terms",
            "default_payment_method",
            "default_currency",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class ClientDetailSerializer(ClientSerializer):
    """Detailed serializer for Client with related data."""

    company_detail = CompanySerializer(source="company", read_only=True)
    default_payment_method_detail = serializers.SerializerMethodField()

    class Meta(ClientSerializer.Meta):
        fields = ClientSerializer.Meta.fields + [
            "company_detail",
            "default_payment_method_detail",
        ]

    def get_default_payment_method_detail(self, obj):
        if obj.default_payment_method:
            return PaymentMethodSerializer(obj.default_payment_method).data
        return None


class ClientCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating Client."""

    class Meta:
        model = Client
        fields = [
            "id",
            "reference",
            "is_archived",
            "company",
            "client_kind",
            "first_name",
            "last_name",
            "national_id",
            "passport_number",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "email",
            "phone",
            "address",
            "website",
            "status",
            "credit_limit",
            "payment_terms",
            "default_payment_method",
            "default_currency",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "is_archived", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"required": False, "allow_blank": True},
            "registration_number": {"validators": []},
            "tax_id": {"validators": []},
            "vat_number": {"validators": []},
            "national_id": {"validators": []},
            "passport_number": {"validators": []},
        }

    def validate(self, attrs):
        instance = self.instance
        kind = attrs.get("client_kind", getattr(instance, "client_kind", ClientKind.ORGANIZATION))
        first_name = (attrs.get("first_name", getattr(instance, "first_name", "")) or "").strip()
        last_name = (attrs.get("last_name", getattr(instance, "last_name", "")) or "").strip()
        name = (attrs.get("name", getattr(instance, "name", "")) or "").strip()
        errors = {}
        if kind == ClientKind.INDIVIDUAL:
            if not first_name:
                errors["first_name"] = _("First name is required for an individual client.")
            if not last_name:
                errors["last_name"] = _("Last name is required for an individual client.")
            if first_name and last_name:
                attrs["name"] = f"{first_name} {last_name}".strip()
        elif kind == ClientKind.ORGANIZATION:
            if not name:
                errors["name"] = _("Legal name is required for an organization client.")
        else:
            errors["client_kind"] = _("Choose individual or organization.")

        for field in (
            "registration_number",
            "tax_id",
            "vat_number",
            "national_id",
            "passport_number",
        ):
            value = attrs.get(field, getattr(instance, field, None))
            if value == "":
                attrs[field] = None
                value = None
            if value:
                queryset = Client.all_objects.filter(**{f"{field}__iexact": value})
                if instance:
                    queryset = queryset.exclude(pk=instance.pk)
                if queryset.exists():
                    errors[field] = _(
                        "This value is already used by another client, including archived clients."
                    )
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Supplier list view."""

    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "email",
            "phone",
            "address",
            "website",
            "status",
            "payment_terms",
            "default_payment_method",
            "default_currency",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class SupplierDetailSerializer(SupplierSerializer):
    """Detailed serializer for Supplier with related data."""

    company_detail = CompanySerializer(source="company", read_only=True)
    default_payment_method_detail = serializers.SerializerMethodField()

    class Meta(SupplierSerializer.Meta):
        fields = SupplierSerializer.Meta.fields + [
            "company_detail",
            "default_payment_method_detail",
        ]

    def get_default_payment_method_detail(self, obj):
        if obj.default_payment_method:
            return PaymentMethodSerializer(obj.default_payment_method).data
        return None


class SupplierCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating Supplier."""

    class Meta:
        model = Supplier
        fields = [
            "id",
            "company",
            "name",
            "trade_name",
            "registration_number",
            "tax_id",
            "vat_number",
            "email",
            "phone",
            "address",
            "website",
            "status",
            "payment_terms",
            "default_payment_method",
            "default_currency",
        ]
        read_only_fields = ["id"]

    def validate_tax_id(self, value):
        if value:
            if Supplier.objects.filter(tax_id__iexact=value).exists():
                raise serializers.ValidationError(_("A supplier with this tax ID already exists."))
        return value


class AssociatedPersonTypeSerializer(serializers.ModelSerializer):
    """Serializer for AssociatedPersonType.

    NOTE: AssociatedPersonType has no `company` relationship in the current
    model/migration (see EFOP Engineering Log C-03 and Open Question 7 —
    "Party company scope"). Adding one is an architecture decision deferred
    beyond M0, not a stabilization fix.
    """

    class Meta:
        model = AssociatedPersonType
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "status",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class AssociatedPersonTypeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating AssociatedPersonType."""

    class Meta:
        model = AssociatedPersonType
        fields = [
            "id",
            "name",
            "description",
            "status",
            "is_default",
        ]
        read_only_fields = ["id"]


class AssociatedPersonSerializer(serializers.ModelSerializer):
    """Serializer for AssociatedPerson list view."""

    person_type_name = serializers.CharField(
        source="person_type.name", read_only=True, default=None
    )
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = AssociatedPerson
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "person_type",
            "person_type_name",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "national_id",
            "passport_number",
            "employee_id",
            "job_title",
            "department",
            "hire_date",
            "termination_date",
            "manager",
            "email",
            "phone",
            "mobile",
            "address",
            "user",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at", "full_name"]


class AssociatedPersonDetailSerializer(AssociatedPersonSerializer):
    """Detailed serializer for AssociatedPerson with related data."""

    company_detail = CompanySerializer(source="company", read_only=True)
    person_type_detail = AssociatedPersonTypeSerializer(source="person_type", read_only=True)
    manager_detail = serializers.SerializerMethodField()

    class Meta(AssociatedPersonSerializer.Meta):
        fields = AssociatedPersonSerializer.Meta.fields + [
            "company_detail",
            "person_type_detail",
            "manager_detail",
        ]

    def get_manager_detail(self, obj):
        if obj.manager:
            return AssociatedPersonSerializer(obj.manager).data
        return None


class AssociatedPersonCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating AssociatedPerson."""

    class Meta:
        model = AssociatedPerson
        fields = [
            "id",
            "company",
            "person_type",
            "first_name",
            "last_name",
            "middle_name",
            "national_id",
            "passport_number",
            "employee_id",
            "job_title",
            "department",
            "hire_date",
            "termination_date",
            "manager",
            "email",
            "phone",
            "mobile",
            "address",
            "user",
            "status",
        ]
        read_only_fields = ["id"]

    def validate_national_id(self, value):
        if value:
            if AssociatedPerson.objects.filter(national_id__iexact=value).exists():
                raise serializers.ValidationError(
                    _("A person with this national ID already exists.")
                )
        return value


class ExternalPartySerializer(serializers.ModelSerializer):
    """Serializer for ExternalParty list view.

    NOTE: ExternalParty has no `company` relationship in the current
    model/migration (see EFOP Engineering Log C-03 and Open Question 7 —
    "Party company scope"). Adding one is an architecture decision deferred
    beyond M0, not a stabilization fix.
    """

    class Meta:
        model = ExternalParty
        fields = [
            "id",
            "reference",
            "name",
            "trade_name",
            "party_category",
            "email",
            "phone",
            "address",
            "tax_id",
            "vat_number",
            "is_recurring",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class ExternalPartyCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ExternalParty."""

    class Meta:
        model = ExternalParty
        fields = [
            "id",
            "name",
            "trade_name",
            "party_category",
            "email",
            "phone",
            "address",
            "tax_id",
            "vat_number",
            "is_recurring",
            "status",
        ]
        read_only_fields = ["id"]
