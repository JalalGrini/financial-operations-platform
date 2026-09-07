from rest_framework.routers import DefaultRouter

from apps.collaboration.views import EligibleUserViewSet, MentionViewSet, NotificationViewSet

router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notification")
router.register("mentions", MentionViewSet, basename="mention")
router.register("eligible-users", EligibleUserViewSet, basename="eligible-user")
urlpatterns = router.urls
