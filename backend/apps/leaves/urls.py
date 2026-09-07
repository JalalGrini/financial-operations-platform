from django.urls import path
from .views import LeaveListCreateView, LeaveDetailView, LeaveMarkOfficialView, LeaveCancelView

urlpatterns = [
    path('', LeaveListCreateView.as_view(), name='leave-list'),
    path('<int:pk>/', LeaveDetailView.as_view(), name='leave-detail'),
    path('<int:pk>/mark-official/', LeaveMarkOfficialView.as_view(), name='leave-mark-official'),
    path('<int:pk>/cancel/', LeaveCancelView.as_view(), name='leave-cancel'),
]
