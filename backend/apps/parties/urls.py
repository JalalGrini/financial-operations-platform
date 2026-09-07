# apps/parties/urls.py
"""
URL configuration for Parties app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.parties.views import (
    AssociatedPersonTypeViewSet,
    AssociatedPersonViewSet,
    ClientViewSet,
    ExternalPartyViewSet,
    SupplierViewSet,
)

router = DefaultRouter()

router.register(r"clients", ClientViewSet, basename="client")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"associated-persons", AssociatedPersonViewSet, basename="associated-person")
router.register(r"person-types", AssociatedPersonTypeViewSet, basename="associated-person-type")
router.register(r"external-parties", ExternalPartyViewSet, basename="external-party")

urlpatterns = [
    path("", include(router.urls)),
]
