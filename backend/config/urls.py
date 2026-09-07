"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions import IsAdminUser

from config.views import HealthView

_STAFF_DOCS = {"permission_classes": [IsAdminUser]}

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),
    # Compatibility aliases if the Railway dashboard healthcheck is `/health`
    # instead of `/api/v1/health/`. Same anonymous 200 as the API liveness view.
    path("health/", HealthView.as_view()),
    path("health", HealthView.as_view()),
    # API v1
    path("api/v1/", include("config.api_urls")),
    # OpenAPI — staff only (payroll/CNSS/auth surface must not be public).
    path("api/schema/", SpectacularAPIView.as_view(**_STAFF_DOCS), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", **_STAFF_DOCS),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema", **_STAFF_DOCS),
        name="redoc",
    ),
]
