from rest_framework.routers import DefaultRouter
from .views import DeadlineViewSet
router=DefaultRouter();router.register("deadlines",DeadlineViewSet,basename="deadline")
urlpatterns=router.urls
