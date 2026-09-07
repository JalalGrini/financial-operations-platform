# apps/personnel/schema.py
"""
Schema-only serializers for `ReportViewSet`'s custom actions.

M0-R2 Task 3 (see EFOP Engineering Log finding M0R-A3): `ReportViewSet`
is a plain `viewsets.ViewSet` (not `GenericAPIView`) with no
`serializer_class` and no `@extend_schema` on any of its 6 custom
actions, so drf-spectacular fell back to its generic "unable to guess
serializer" error-level diagnostic for the entire ViewSet.

These serializers exist ONLY to describe the existing, already-implemented
request/response shapes to drf-spectacular via `@extend_schema`. They are
not used for validation and do not change any action's runtime behavior:

- Actions continue to validate input with the existing
  `ReportPreviewSerializer` / `ReportExportSerializer` exactly as before.
- No action method body is modified by this module or by the task that
  introduces it, only decorated.
- Report calculation, query, and file-generation logic
  (`ReportService`) is explicitly out of scope and untouched.

Field shapes below were characterized directly from the current action
implementations in `apps/personnel/views.py` and reuse the existing
`CNSSReportRowSerializer` / `PayrollReportRowSerializer` /
`ReportPreviewSerializer` / `ReportExportSerializer` from
`apps/personnel/serializers.py` where their fields already match the
actual runtime payloads.
"""
from rest_framework import serializers

from apps.personnel.serializers import (
    CNSSReportRowSerializer,
    PayrollReportRowSerializer,
)


class CNSSMonthlyPreviewResponseSchema(serializers.Serializer):
    """Response shape for `POST .../reports/cnss-monthly/preview/`."""

    rows = CNSSReportRowSerializer(many=True)
    count = serializers.IntegerField()


class PayrollMonthlyPreviewResponseSchema(serializers.Serializer):
    """Response shape for `POST .../reports/payroll-monthly/preview/`."""

    rows = PayrollReportRowSerializer(many=True)
    count = serializers.IntegerField()


class ReportErrorResponseSchema(serializers.Serializer):
    """Shape of the 400 error responses returned by `cnss_monthly_export`
    and `payroll_monthly_export` (invalid `report_type` or unsupported
    `output_format`)."""

    error = serializers.CharField()


class ReportTypeSchema(serializers.Serializer):
    """Shape of a single entry in `report_types`'s `types` list."""

    id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()


class ReportTypesResponseSchema(serializers.Serializer):
    """Response shape for `GET .../reports/types/`."""

    types = ReportTypeSchema(many=True)


class DashboardDataSchema(serializers.Serializer):
    """Shape of the `data` object in `dashboard`'s response."""

    totalPersonnel = serializers.IntegerField()
    activeEmployees = serializers.IntegerField()
    # cnssDeclared/notDeclared/cnssOnly are company-relative figures (CNSS
    # declaration status is meaningful per employer, not as a blended total
    # across companies). Without a `company` filter there is no honest
    # aggregate to report, so these are `null` rather than `0` (Cycle 23,
    # ED-5b) - a `0` would be indistinguishable from "genuinely zero".
    cnssDeclared = serializers.IntegerField(allow_null=True)
    notDeclared = serializers.IntegerField(allow_null=True)
    cnssOnly = serializers.IntegerField(allow_null=True)
    multiCompany = serializers.IntegerField()
    incomplete = serializers.IntegerField()
    monthlyPayroll = serializers.IntegerField()
    pendingPayments = serializers.IntegerField()


class DashboardResponseSchema(serializers.Serializer):
    """Response shape for `GET .../reports/dashboard/`."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = DashboardDataSchema()
