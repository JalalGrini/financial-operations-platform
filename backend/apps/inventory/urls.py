from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    InventoryCategoryViewSet,
    InventoryItemViewSet,
    InventoryMovementViewSet,
)

router = DefaultRouter()
router.register("categories", InventoryCategoryViewSet, basename="inventory-category")
router.register("items", InventoryItemViewSet, basename="inventory-item")
router.register("movements", InventoryMovementViewSet, basename="inventory-movement")
urlpatterns = [path("", include(router.urls))]
