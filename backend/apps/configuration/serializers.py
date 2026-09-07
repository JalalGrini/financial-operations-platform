# apps/configuration/serializers.py
"""
Configuration Serializers.

Serializers for Configuration domain API endpoints.
"""
from rest_framework import serializers

from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category.

    `children` and `full_path` can each cost one query per node when a
    category has descendants/ancestors (see get_children/get_full_path
    below). CategoryViewSet.list() bulk-loads two context maps
    ("children_by_parent_id" and "category_names_by_id") in a fixed number of
    queries for the whole page and both methods use them when present,
    falling back to the original per-object behavior when they are not (e.g.
    a bare `CategorySerializer(category).data` call in a test or script) so
    correctness never depends on the caller remembering to pass a map
    (Cycle 23, N-2).
    """

    children = serializers.SerializerMethodField()
    full_path = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "parent",
            "level",
            "path",
            "icon",
            "color",
            "display_order",
            "is_income",
            "is_expense",
            "is_transfer",
            "status",
            "full_path",
            "children",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "level",
            "path",
            "created_at",
            "updated_at",
            "full_path",
        ]

    def get_full_path(self, obj):
        return obj.get_full_path(id_to_name=self.context.get("category_names_by_id"))

    def get_children(self, obj):
        children_map = self.context.get("children_by_parent_id")
        if children_map is not None:
            children = children_map.get(obj.id, [])
        else:
            # obj.children uses Category's default manager (ActiveManager),
            # which already excludes archived categories.
            children = obj.children.all()
        # Pass context through so nested levels also use the bulk maps
        # instead of falling back to a query per node.
        return CategorySerializer(children, many=True, context=self.context).data


class CategoryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating Category."""

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "description",
            "parent",
            "icon",
            "color",
            "display_order",
            "is_income",
            "is_expense",
            "is_transfer",
            "status",
        ]
        read_only_fields = ["id"]


class FinancialRecordTypeSerializer(serializers.ModelSerializer):
    """Serializer for FinancialRecordType."""

    default_category_name = serializers.CharField(
        source="default_category.name", read_only=True, default=None
    )

    class Meta:
        model = FinancialRecordType
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "nature",
            "direction",
            "default_category",
            "default_category_name",
            "allowed_categories",
            "default_template",
            "default_payment_method",
            "default_payment_terms",
            "requires_validation",
            "requires_approval",
            "allows_partial_payment",
            "reference_prefix",
            "status",
            "icon",
            "color",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class FinancialRecordTypeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating FinancialRecordType."""

    class Meta:
        model = FinancialRecordType
        fields = [
            "id",
            "name",
            "description",
            "nature",
            "direction",
            "default_category",
            "allowed_categories",
            "default_template",
            "default_payment_method",
            "default_payment_terms",
            "requires_validation",
            "requires_approval",
            "allows_partial_payment",
            "reference_prefix",
            "status",
            "icon",
            "color",
            "display_order",
        ]
        read_only_fields = ["id"]


class PaymentMethodSerializer(serializers.ModelSerializer):
    """Serializer for PaymentMethod."""

    class Meta:
        model = PaymentMethod
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "kind",
            "is_electronic",
            "requires_bank_details",
            "requires_reference",
            "extra_fields",
            "default_field_values",
            "processing_days",
            "fee_percentage",
            "fee_fixed",
            "status",
            "icon",
            "color",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class PaymentMethodCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating PaymentMethod."""

    class Meta:
        model = PaymentMethod
        fields = [
            "id",
            "name",
            "description",
            "kind",
            "is_electronic",
            "requires_bank_details",
            "requires_reference",
            "extra_fields",
            "default_field_values",
            "processing_days",
            "fee_percentage",
            "fee_fixed",
            "status",
            "icon",
            "color",
            "display_order",
        ]
        read_only_fields = ["id"]


class TransactionTypeSerializer(serializers.ModelSerializer):
    """Serializer for TransactionType."""

    is_credit = serializers.SerializerMethodField()
    is_debit = serializers.SerializerMethodField()

    class Meta:
        model = TransactionType
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "nature",
            "direction",
            "is_credit",
            "is_debit",
            "is_reversal",
            "is_adjustment",
            "is_opening_balance",
            "is_transfer",
            "requires_counterparty",
            "requires_payment_method",
            "requires_reason",
            "allowed_payment_methods",
            "requires_approval",
            "is_system",
            "reference_prefix",
            "status",
            "icon",
            "color",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at", "is_credit", "is_debit"]

    def get_is_credit(self, obj):
        return obj.is_credit_type()

    def get_is_debit(self, obj):
        return obj.is_debit_type()


class TransactionTypeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating TransactionType."""

    class Meta:
        model = TransactionType
        fields = [
            "id",
            "name",
            "description",
            "nature",
            "direction",
            "is_reversal",
            "is_adjustment",
            "is_opening_balance",
            "is_transfer",
            "requires_counterparty",
            "requires_payment_method",
            "requires_reason",
            "allowed_payment_methods",
            "requires_approval",
            "is_system",
            "reference_prefix",
            "status",
            "icon",
            "color",
            "display_order",
        ]
        read_only_fields = ["id"]


class ReportTypeSerializer(serializers.ModelSerializer):
    """Serializer for ReportType."""

    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = ReportType
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "category",
            "category_name",
            "frequency",
            "supports_preview",
            "supports_scheduled",
            "template_name",
            "export_formats",
            "available_filters",
            "default_parameters",
            "status",
            "icon",
            "color",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class ReportTypeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ReportType."""

    class Meta:
        model = ReportType
        fields = [
            "id",
            "name",
            "description",
            "category",
            "frequency",
            "supports_preview",
            "supports_scheduled",
            "template_name",
            "export_formats",
            "available_filters",
            "default_parameters",
            "status",
            "icon",
            "color",
            "display_order",
        ]
        read_only_fields = ["id"]


class NotificationTypeSerializer(serializers.ModelSerializer):
    """Serializer for NotificationType."""

    class Meta:
        model = NotificationType
        fields = [
            "id",
            "reference",
            "name",
            "description",
            "default_channels",
            "available_channels",
            "subject_template",
            "body_template",
            "default_priority",
            "default_recipient_roles",
            "status",
            "icon",
            "color",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "created_at", "updated_at"]


class NotificationTypeCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating NotificationType."""

    class Meta:
        model = NotificationType
        fields = [
            "id",
            "name",
            "description",
            "default_channels",
            "available_channels",
            "subject_template",
            "body_template",
            "default_priority",
            "default_recipient_roles",
            "status",
            "icon",
            "color",
            "display_order",
        ]
        read_only_fields = ["id"]
