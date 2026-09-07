# apps/dashboard/urls.py
"""
URL configuration for the Executive Dashboard app.

Registered at the empty prefix: DashboardViewSet.list backs the mount point
itself (GET /dashboard/), and its two extra actions land at /dashboard/kpis/
and /dashboard/charts/ - matching 11_API_Design.md's three Dashboard
endpoints exactly, with no extra path segment for a resource name.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.dashboard.views import DashboardViewSet

router = DefaultRouter()
router.register(r"", DashboardViewSet, basename="dashboard")

urlpatterns = [
    path("", include(router.urls)),
]
