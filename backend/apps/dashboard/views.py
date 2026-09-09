# apps/dashboard/views.py
"""Executive Dashboard API.

A plain ViewSet, not a ModelViewSet: nothing here is a row that can be
listed/retrieved/updated/deleted by primary key (Domain Model Section 3.14 -
decision ED-1). Because there is no ModelViewSet, this app contributes
nothing to `collected_model_viewsets()`, so it needs no entry in the Cycle
17 soft-delete structural guard's exemption/requirement sets - excluded by
construction, not by an exemption someone has to remember (decision ED-9).
The Cycle 9 endpoint-protection guard still applies: every action below
carries `CanViewDashboard` in `permission_classes`.

Every response is built fresh from the database on every request. There is
no cache to invalidate and no signal handler to keep in sync - unlike
apps.reports, which must react to financial-record changes to know a report
is outdated, this module simply recomputes (decision ED-1).
"""
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.dashboard.permissions import CanViewDashboard
from apps.dashboard.schema import ChartsResponseSchema, OperationalResponseSchema
from apps.dashboard.selectors import (
    category_analysis,
    company_comparison,
    monthly_cash_flow,
    recent_posted_records,
    report_status_summary,
    revenue_expense_totals,
)
from apps.dashboard.serializers import (
    CategoryAnalysisSerializer,
    CompanyComparisonSerializer,
    KpiSerializer,
    MonthlyCashFlowPointSerializer,
    OverviewSerializer,
)


def _company_param(request):
    """The dashboard's own company filter, matching the same query-param
    convention used by every other module's list endpoint (e.g.
    apps.treasury.views.AccountViewSet.get_queryset).
    """
    return request.query_params.get("company") or None


class DashboardViewSet(viewsets.ViewSet):
    """GET /dashboard/, /dashboard/kpis/, /dashboard/charts/."""

    permission_classes = [IsAuthenticated, CanViewDashboard]

    @extend_schema(responses={200: OverviewSerializer}, tags=["dashboard"])
    def list(self, request):
        """The general-purpose snapshot: KPIs, report status, and the most
        recent posted records - everything a landing page needs in one
        round trip.
        """
        company = _company_param(request)
        totals = revenue_expense_totals(company=company)
        payload = {
            **totals,
            "report_status": report_status_summary(company=company),
            "recent_records": recent_posted_records(company=company, limit=10),
        }
        return Response(OverviewSerializer(payload).data)

    @extend_schema(responses={200: KpiSerializer}, tags=["dashboard"])
    @action(detail=False, methods=["get"])
    def kpis(self, request):
        """Numeric indicators alone: Revenue, Expenses, Net, and the report
        status breakdown. No chart series and no record list, so a client
        that only needs the tiles is not paying for the rest.
        """
        company = _company_param(request)
        totals = revenue_expense_totals(company=company)
        payload = {**totals, "report_status": report_status_summary(company=company)}
        return Response(KpiSerializer(payload).data)

    @extend_schema(responses={200: ChartsResponseSchema}, tags=["dashboard"])
    @action(detail=False, methods=["get"])
    def charts(self, request):
        """Chart series alone: Monthly Cash Flow, Company Comparison, and
        Category Analysis.

        Company Comparison is always company-agnostic by design (see
        selectors.company_comparison's docstring: comparing companies is
        the entire point of that widget) - the `company` query param here
        scopes only the other two series.
        """
        company = _company_param(request)
        months_param = request.query_params.get("months")
        # Audit fix: int(months_param) raised ValueError on any non-numeric
        # value, surfacing as an uncaught 500, and accepted absurd windows
        # (e.g. months=100000000). Clamp to a sane chart range and fall back
        # to the default on garbage input.
        try:
            months = int(months_param) if months_param else 12
        except (TypeError, ValueError):
            months = 12
        months = min(max(months, 1), 60)
        payload = {
            "monthly_cash_flow": MonthlyCashFlowPointSerializer(
                monthly_cash_flow(company=company, months=months), many=True
            ).data,
            "company_comparison": CompanyComparisonSerializer(company_comparison(), many=True).data,
            "category_analysis": CategoryAnalysisSerializer(
                category_analysis(company=company), many=True
            ).data,
        }
        return Response(payload)

    @extend_schema(responses={200: OperationalResponseSchema}, tags=["dashboard"])
    @action(detail=False, methods=["get"], url_path="operational")
    def operational(self, request):
        """Operational dashboard: headcount, deadlines, recent activity.
        Does NOT expose any financial amounts.
        """
        from datetime import timedelta

        from django.utils import timezone

        from apps.deadlines.models import Deadline
        from apps.personnel.leave_status import annotate_is_on_leave
        from apps.personnel.models import PersonnelPerson

        # `due_at` is a DateTimeField, so these bounds must be timezone-aware
        # datetimes. They were `date` objects, which Django coerced to naive
        # midnight and warned about ("received a naive datetime while time zone
        # support is active"); with USE_TZ the comparison is then made against
        # an unlocalised instant and can be off by the UTC offset. Anchoring on
        # the start of the current day keeps the previous day-boundary meaning.
        now = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        soon = today + timedelta(days=14)

        # Personnel stats: "on leave" follows today's official leave records,
        # the same annotation used on personnel and employment lists.
        personnel_qs = annotate_is_on_leave(
            PersonnelPerson.objects.filter(is_archived=False),
            leave_fk="personnel",
        )
        headcount_total = personnel_qs.count()
        headcount_on_leave = personnel_qs.filter(is_on_leave=True).count()
        headcount_active = personnel_qs.filter(
            status="active", is_on_leave=False
        ).count()

        # Upcoming deadlines
        # due_at is the DateTimeField on the Deadline model (not due_date)
        # Statuses are: upcoming, completed, cancelled (not open/in_progress)
        upcoming = list(
            Deadline.objects.filter(
                is_archived=False,
                status="upcoming",
                due_at__gte=today,
                due_at__lte=soon,
            ).order_by("due_at")[:8].values(
                "id", "title", "due_at", "priority", "status"
            )
        )
        # Rename due_at -> due_date for the frontend interface
        for item in upcoming:
            item["due_date"] = str(item.pop("due_at").date()) if item.get("due_at") else None

        # Transfers summary
        from apps.transfers.models import CashTransfer
        transfers_qs = CashTransfer.objects.filter(is_archived=False)
        transfers_summary = {
            "total": transfers_qs.count(),
            "draft": transfers_qs.filter(status="draft").count(),
            "confirmed": transfers_qs.filter(status="confirmed").count(),
        }

        return Response({
            "headcount": {
                "total": headcount_total,
                "active": headcount_active,
                "on_leave": headcount_on_leave,
            },
            "upcoming_deadlines": upcoming,
            "deadlines_count": {
                "overdue": Deadline.objects.filter(
                    is_archived=False,
                    status="upcoming",
                    due_at__lt=today,
                ).count(),
                "this_week": Deadline.objects.filter(
                    is_archived=False,
                    status="upcoming",
                    due_at__gte=today,
                    due_at__lte=today + timedelta(days=7),
                ).count(),
            },
            "transfers_summary": transfers_summary,
        })
