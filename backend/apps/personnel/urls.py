# apps/personnel/urls.py
"""
URL configuration for Personnel app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.personnel.views import (
    CNSSDeclarationViewSet,
    CNSSMonthlyDeclarationViewSet,
    EmploymentSalaryViewSet,
    EmploymentViewSet,
    MonthlyPayrollRecordViewSet,
    PayrollAdjustmentViewSet,
    PayrollPaymentViewSet,
    PersonnelDocumentReferenceViewSet,
    PersonnelPersonViewSet,
    ReportViewSet,
)

router = DefaultRouter()

# Personnel Persons
router.register(r"persons", PersonnelPersonViewSet, basename="personnel-person")

# Employments
router.register(r"employments", EmploymentViewSet, basename="employment")

# Employment Salaries
router.register(r"salaries", EmploymentSalaryViewSet, basename="employment-salary")

# Monthly Payroll Records
router.register(r"payrolls", MonthlyPayrollRecordViewSet, basename="monthly-payroll")

# Payroll Adjustments
router.register(r"adjustments", PayrollAdjustmentViewSet, basename="payroll-adjustment")

# Payroll Payments
router.register(r"payments", PayrollPaymentViewSet, basename="payroll-payment")

# CNSS Declarations
router.register(r"cnss", CNSSDeclarationViewSet, basename="cnss-declaration")

# CNSS Monthly Declarations
router.register(r"cnss-monthly", CNSSMonthlyDeclarationViewSet, basename="cnss-monthly")

# Document References
router.register(r"documents", PersonnelDocumentReferenceViewSet, basename="personnel-document")

urlpatterns = [
    path("", include(router.urls)),
    # Report endpoints
    path(
        "reports/cnss-monthly/preview/",
        ReportViewSet.as_view({"post": "cnss_monthly_preview"}),
        name="cnss-report-preview",
    ),
    path(
        "reports/cnss-monthly/export/",
        ReportViewSet.as_view({"post": "cnss_monthly_export"}),
        name="cnss-report-export",
    ),
    path(
        "reports/payroll-monthly/preview/",
        ReportViewSet.as_view({"post": "payroll_monthly_preview"}),
        name="payroll-report-preview",
    ),
    path(
        "reports/payroll-monthly/export/",
        ReportViewSet.as_view({"post": "payroll_monthly_export"}),
        name="payroll-report-export",
    ),
    path("reports/types/", ReportViewSet.as_view({"get": "report_types"}), name="report-types"),
    path(
        "reports/dashboard/", ReportViewSet.as_view({"get": "dashboard"}), name="report-dashboard"
    ),
]
