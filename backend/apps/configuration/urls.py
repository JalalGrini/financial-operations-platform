# apps/configuration/urls.py
"""
URL configuration for Configuration app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.configuration.views import (
    CategoryViewSet,
    FinancialRecordTypeViewSet,
    NotificationTypeViewSet,
    PaymentMethodViewSet,
    ReportTypeViewSet,
    TransactionTypeViewSet,
)

router = DefaultRouter()

router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"record-types", FinancialRecordTypeViewSet, basename="financial-record-type")
router.register(r"payment-methods", PaymentMethodViewSet, basename="payment-method")
router.register(r"transaction-types", TransactionTypeViewSet, basename="transaction-type")
router.register(r"report-types", ReportTypeViewSet, basename="report-type")
router.register(r"notification-types", NotificationTypeViewSet, basename="notification-type")

urlpatterns = [
    path("", include(router.urls)),
]
