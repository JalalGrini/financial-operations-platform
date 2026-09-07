# apps/companies/urls.py
"""
URL configuration for Companies app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.companies.views import (
    CompanyPreferenceViewSet,
    CompanySettingsViewSet,
    CompanyViewSet,
)

router = DefaultRouter()

router.register(r"", CompanyViewSet, basename="company")

urlpatterns = [
    path("", include(router.urls)),
    # Settings - nested under company
    path(
        "<uuid:company_pk>/settings/",
        CompanySettingsViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update"}
        ),
        name="company-settings",
    ),
    # Preferences - nested under company
    path(
        "<uuid:company_pk>/preferences/",
        CompanyPreferenceViewSet.as_view({"get": "list", "post": "create"}),
        name="company-preferences",
    ),
    path(
        "<uuid:company_pk>/preferences/<uuid:pk>/",
        CompanyPreferenceViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="company-preference",
    ),
    # Fixes B-3 (state/IMPLEMENTATION_PLAN.md Section 11): archive/restore/
    # permanent-delete actions existed on the ViewSet but were never routed.
    path(
        "<uuid:company_pk>/preferences/<uuid:pk>/archive/",
        CompanyPreferenceViewSet.as_view({"post": "archive"}),
        name="company-preference-archive",
    ),
    path(
        "<uuid:company_pk>/preferences/<uuid:pk>/restore/",
        CompanyPreferenceViewSet.as_view({"post": "restore"}),
        name="company-preference-restore",
    ),
    path(
        "<uuid:company_pk>/preferences/<uuid:pk>/permanent/",
        CompanyPreferenceViewSet.as_view({"delete": "permanent_delete"}),
        name="company-preference-permanent-delete",
    ),
]
