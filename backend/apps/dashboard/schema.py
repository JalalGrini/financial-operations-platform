# apps/dashboard/schema.py
"""Schema-only serializer for `DashboardViewSet.charts`.

Same convention as `apps.personnel.schema` (see that module's docstring):
`DashboardViewSet` is a plain `viewsets.ViewSet` (not `GenericAPIView`) with
no `serializer_class`, so drf-spectacular's schema generation hit its
generic "unable to guess serializer" error-level fallback for every action -
including `list` and `kpis`, which already have `OverviewSerializer` and
`KpiSerializer` respectively but were never wired to drf-spectacular via
`@extend_schema`.

`charts` has no serializer at all today because its Response body is
assembled as a plain dict of three already-serialized lists (see
`DashboardViewSet.charts`), so this module adds one describing exactly that
shape. This changes nothing at runtime: no action body is modified, only
decorated in `views.py`.
"""
from rest_framework import serializers

from apps.dashboard.serializers import (
    CategoryAnalysisSerializer,
    CompanyComparisonSerializer,
    MonthlyCashFlowPointSerializer,
)


class ChartsResponseSchema(serializers.Serializer):
    """Response shape for `GET .../dashboard/charts/`."""

    monthly_cash_flow = MonthlyCashFlowPointSerializer(many=True)
    company_comparison = CompanyComparisonSerializer(many=True)
    category_analysis = CategoryAnalysisSerializer(many=True)


class HeadcountSchema(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()
    on_leave = serializers.IntegerField()


class UpcomingDeadlineSchema(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    due_at = serializers.DateTimeField()
    due_date = serializers.DateField(allow_null=True)
    priority = serializers.CharField()
    status = serializers.CharField()


class DeadlinesCountSchema(serializers.Serializer):
    overdue = serializers.IntegerField()
    this_week = serializers.IntegerField()


class TransfersSummarySchema(serializers.Serializer):
    total = serializers.IntegerField()
    draft = serializers.IntegerField()
    confirmed = serializers.IntegerField()


class OperationalResponseSchema(serializers.Serializer):
    """Response shape for `GET .../dashboard/operational/`.

    Same reason this module exists at all (see the module docstring): the
    `operational` action assembles a plain dict, so without a declared
    response drf-spectacular falls back to its error-level "unable to guess
    serializer" path and `test_full_project_error_cache_is_empty_after_
    schema_generation` fails. Declaring the shape here changes nothing at
    runtime - the action body is untouched, only decorated in `views.py`.

    Deliberately exposes no money figures: the operational dashboard reports
    counts only (headcount, deadline counts, transfer counts), never amounts.
    """

    headcount = HeadcountSchema()
    upcoming_deadlines = UpcomingDeadlineSchema(many=True)
    deadlines_count = DeadlinesCountSchema()
    transfers_summary = TransfersSummarySchema()
