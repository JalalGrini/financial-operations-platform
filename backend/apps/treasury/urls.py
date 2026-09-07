# apps/treasury/urls.py
"""
URL configuration for the Treasury app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.treasury.views import (
    AccountViewSet,
    ReconciliationViewSet,
    TransactionViewSet,
    TransferViewSet,
)

router = DefaultRouter()

router.register(r"accounts", AccountViewSet, basename="treasury-account")
router.register(r"transactions", TransactionViewSet, basename="treasury-transaction")
router.register(r"transfers", TransferViewSet, basename="treasury-transfer")
router.register(r"reconciliations", ReconciliationViewSet, basename="treasury-reconciliation")

urlpatterns = [
    path("", include(router.urls)),
]
