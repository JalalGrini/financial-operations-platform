from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.transfers.views import CashTransferViewSet, EntityOpeningBalanceViewSet

router = DefaultRouter()
router.register(r"cash-transfers", CashTransferViewSet, basename="cash-transfer")
router.register(
    r"opening-balances",
    EntityOpeningBalanceViewSet,
    basename="entity-opening-balance",
)

urlpatterns = [path("", include(router.urls))]
