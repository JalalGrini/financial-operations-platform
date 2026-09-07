# apps/dashboard/serializers.py
"""Response shapes for the Executive Dashboard endpoints.

Every money figure travels as a per-currency mapping via
`CurrencyAmountMapField` (decision ED-10), never a single collapsed number,
and each amount renders as a string through the same `DecimalField`
convention already used across the codebase (e.g. apps.treasury.
serializers.TransactionSerializer.signed_amount), not a raw float that
could lose precision.
"""
from rest_framework import serializers


class CurrencyAmountMapField(serializers.DictField):
    """{"MAD": "1234.5000", "EUR": "10.0000"} - one entry per currency that
    actually appears in the underlying records. Never pre-populated with a
    currency that had no data.
    """

    child = serializers.DecimalField(max_digits=18, decimal_places=4)


class KpiSerializer(serializers.Serializer):
    """Numeric indicators alone - Business Requirements Section 10's
    Revenue and Expense KPIs, plus Net, plus the report-status breakdown
    that backs the "Pending Reports" tile.
    """

    revenue = CurrencyAmountMapField()
    expenses = CurrencyAmountMapField()
    net = CurrencyAmountMapField()
    report_status = serializers.DictField(child=serializers.IntegerField())


class MonthlyCashFlowPointSerializer(serializers.Serializer):
    month = serializers.CharField()
    income = CurrencyAmountMapField()
    expense = CurrencyAmountMapField()


class CompanyComparisonSerializer(serializers.Serializer):
    company = serializers.CharField()
    company_name = serializers.CharField()
    income = CurrencyAmountMapField()
    expense = CurrencyAmountMapField()


class CategoryAnalysisSerializer(serializers.Serializer):
    category = serializers.CharField(allow_null=True)
    category_name = serializers.CharField()
    total = CurrencyAmountMapField()


class RecentRecordSerializer(serializers.Serializer):
    """Backs the "Recent Financial Records" widget.

    Deliberately not named or shaped as an "activity feed": no audit-log
    model exists anywhere in this platform to back a broader claim about
    who did what, when (decision ED-7). This is exactly what it says it is -
    the most recently posted records.
    """

    id = serializers.UUIDField()
    reference = serializers.CharField()
    company = serializers.CharField(source="company_id")
    company_name = serializers.SerializerMethodField()
    record_type_name = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    description = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=4)
    currency = serializers.CharField()
    record_date = serializers.DateField()
    posted_at = serializers.DateTimeField()

    def get_company_name(self, record):
        return record.company.name

    def get_record_type_name(self, record):
        return record.record_type.name

    def get_category_name(self, record):
        # category is nullable (SET_NULL) - a record with no category is a
        # normal, valid state, not an error, so this returns None rather
        # than raising on the missing relation.
        return record.category.name if record.category_id else None


class OverviewSerializer(serializers.Serializer):
    """GET /dashboard/ - the general-purpose landing snapshot: KPIs, report
    status, and the most recent posted records in one round trip.
    """

    revenue = CurrencyAmountMapField()
    expenses = CurrencyAmountMapField()
    net = CurrencyAmountMapField()
    report_status = serializers.DictField(child=serializers.IntegerField())
    recent_records = RecentRecordSerializer(many=True)
