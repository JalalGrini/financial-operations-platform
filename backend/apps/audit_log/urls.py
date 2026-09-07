from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.audit_log.views import AuditEventViewSet

router = DefaultRouter()
router.register("events", AuditEventViewSet, basename="audit-event")
urlpatterns = [path("", include(router.urls))]
