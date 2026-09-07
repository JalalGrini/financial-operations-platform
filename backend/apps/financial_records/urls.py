"""URL configuration for Financial Records and document templates."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.financial_records.views import (
    FinancialDocumentTemplateViewSet,
    FinancialRecordViewSet,
)

router = DefaultRouter()
router.register(r"records", FinancialRecordViewSet, basename="financial-record")
router.register(r"templates", FinancialDocumentTemplateViewSet, basename="financial-template")

urlpatterns = [path("", include(router.urls))]
