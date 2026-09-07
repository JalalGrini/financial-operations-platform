# apps/reports/urls.py
"""
URL configuration for the Reports app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.reports.views import GeneratedReportViewSet, ReportVersionViewSet

router = DefaultRouter()

router.register(r"reports", GeneratedReportViewSet, basename="report")
router.register(r"versions", ReportVersionViewSet, basename="report-version")

urlpatterns = [
    path("", include(router.urls)),
]
