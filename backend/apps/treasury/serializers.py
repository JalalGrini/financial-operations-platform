# apps/treasury/serializers.py
"""
Treasury API serializers.

These are deliberately thin. They shape data and reject obviously bad input;
they do NOT create, post, cancel, transfer, or reconcile anything. Every write
goes through apps.treasury.services so the balance invariant and the
immutability rules cannot be bypassed by a new caller.
"""

from decimal import Decimal

from rest_framework import serializers

from apps.configuration.models import TransactionType
from apps.treasury.models import Account, DailyBudget, Reconciliation, Transaction


class AccountSerializer(serializers.ModelSerializer):
    """Read serializer. current_balance and opening_balance are exposed but
    never writable through this serializer; only the service layer moves
    them.
    """

    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = Account
        fields = [
            "id",
            "reference",
            "company",
            "company_name",
            "name",
            "kind",
            "currency",
            "bank_name",
            "account_number",
            "iban",
            "swift",
            "opening_balance",
            "current_balance",
            "is_active",
            "notes",
            "custom_fields",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AccountCreateSerializer(serializers.ModelSerializer):
    """Input for opening an account.

    current_balance is absent on purpose: it is always seeded from
    opening_balance by the service, never taken from the client.
    """

    custom_fields = serializers.DictField(required=False, default=dict)

    class Meta:
        model = Account
        fields = [
            "id",
            "company",
            "name",
            "kind",
            "currency",
            "bank_name",
            "account_number",
            "iban",
            "swift",
            "opening_balance",
            "notes",
            "custom_fields",
        ]
        read_only_fields = ["id"]


class AccountUpdateSerializer(serializers.ModelSerializer):
    """Input for editing an account.

    opening_balance and current_balance are both absent: opening_balance is a
    fact about the past and current_balance is maintained by the services.
    Neither can be changed by a PATCH.
    """

    custom_fields = serializers.DictField(required=False)

    class Meta:
        model = Account
        fields = [
            "name",
            "kind",
            "currency",
            "bank_name",
            "account_number",
            "iban",
            "swift",
            "is_active",
            "notes",
            "custom_fields",
        ]


class TransactionSerializer(serializers.ModelSerializer):
    """Read serializer for a treasury movement."""

    account_name = serializers.CharField(source="account.name", read_only=True, default=None)
    # The two relation labels the clients actually display. Both relations are
    # already in `all_transactions()`'s select_related, so exposing their names
    # adds no queries. Without them the treasury list could only show the raw
    # UUIDs, which is why its "Type" column rendered an em-dash for every row.
    transaction_type_name = serializers.CharField(
        source="transaction_type.name", read_only=True, default=None
    )
    payment_method_name = serializers.CharField(
        source="payment_method.name", read_only=True, default=None
    )
    signed_amount = serializers.DecimalField(max_digits=18, decimal_places=4, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "reference",
            "account",
            "account_name",
            "transaction_type",
            "transaction_type_name",
            "payment_method",
            "payment_method_name",
            "financial_record",
            "direction",
            "amount",
            "signed_amount",
            "currency",
            "transaction_date",
            "description",
            "notes",
            "external_reference",
            "status",
            "is_editable",
            "posted_at",
            "cancelled_at",
            "cancellation_reason",
            "transfer_group",
            "reconciliation",
            "is_reconciled",
            "custom_fields",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TransactionDetailSerializer(TransactionSerializer):
    """Detail serializer. Identical for now; kept separate so the detail
    shape can grow (e.g. related reconciliation info) without touching the
    list shape.
    """


class TransactionCreateSerializer(serializers.ModelSerializer):
    """Input for recording a movement.

    `status` is absent on purpose. Every transaction is created as a DRAFT;
    if the client sends a status field it is simply ignored, never trusted.
    """

    custom_fields = serializers.DictField(required=False, default=dict)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "account",
            "transaction_type",
            "payment_method",
            "financial_record",
            "direction",
            "amount",
            "currency",
            "transaction_date",
            "description",
            "notes",
            "external_reference",
            "custom_fields",
        ]
        read_only_fields = ["id"]


class TransactionUpdateSerializer(serializers.ModelSerializer):
    """Input for editing a draft. Mirrors services.EDITABLE_TRANSACTION_FIELDS."""

    custom_fields = serializers.DictField(required=False)

    class Meta:
        model = Transaction
        fields = [
            "transaction_type",
            "payment_method",
            "financial_record",
            "transaction_date",
            "description",
            "notes",
            "external_reference",
            "amount",
            "custom_fields",
        ]


class CancelTransactionSerializer(serializers.Serializer):
    """Cancelling requires a reason; an unexplained reversal is not an audit trail."""

    reason = serializers.CharField(max_length=500, allow_blank=False)


class TransferSerializer(serializers.Serializer):
    """Input for moving money between two of our own accounts."""

    source_account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all())
    destination_account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all())
    amount = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.00"))
    transaction_date = serializers.DateField()
    description = serializers.CharField(max_length=255)
    transaction_type = serializers.PrimaryKeyRelatedField(queryset=TransactionType.objects.all())
    post = serializers.BooleanField(required=False, default=True)


class ReconciliationSerializer(serializers.ModelSerializer):
    """Read serializer for a reconciliation period."""

    account_name = serializers.CharField(source="account.name", read_only=True, default=None)
    difference = serializers.DecimalField(max_digits=18, decimal_places=4, read_only=True)
    is_editable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Reconciliation
        fields = [
            "id",
            "reference",
            "account",
            "account_name",
            "period_start",
            "period_end",
            "statement_balance",
            "computed_balance",
            "difference",
            "status",
            "is_editable",
            "completed_at",
            "completed_by",
            "notes",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReconciliationDetailSerializer(ReconciliationSerializer):
    """Detail serializer including the attached transactions."""

    transactions = TransactionSerializer(many=True, read_only=True)

    class Meta(ReconciliationSerializer.Meta):
        fields = ReconciliationSerializer.Meta.fields + ["transactions"]


class ReconciliationCreateSerializer(serializers.ModelSerializer):
    """Input for opening a reconciliation period."""

    class Meta:
        model = Reconciliation
        fields = ["id", "account", "period_start", "period_end", "statement_balance", "notes"]
        read_only_fields = ["id"]


class AttachTransactionSerializer(serializers.Serializer):
    """Input for attaching a posted transaction to an open reconciliation."""

    transaction = serializers.PrimaryKeyRelatedField(queryset=Transaction.objects.all())


class ReopenReconciliationSerializer(serializers.Serializer):
    """Reopening a completed period requires a reason; see services docstring."""

    reason = serializers.CharField(max_length=500, allow_blank=False)


class DailyBudgetSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    filled_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DailyBudget
        fields = [
            "id",
            "company",
            "company_name",
            "date",
            "amount",
            "note",
            "filled_by",
            "filled_by_name",
            "filled_at",
            "is_carried_over",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "filled_by",
            "filled_at",
            "is_carried_over",
            "created_at",
            "updated_at",
        ]

    def get_filled_by_name(self, obj):
        user = obj.filled_by
        if not user:
            return ""
        full = user.get_full_name() if hasattr(user, "get_full_name") else ""
        return full or getattr(user, "email", "") or str(user)


class DailyBudgetWriteSerializer(serializers.Serializer):
    company = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    date = serializers.DateField(required=False)
