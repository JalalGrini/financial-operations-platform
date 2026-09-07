# apps/authentication/urls.py
"""
URL configuration for authentication endpoints.
"""
from django.urls import path

from .views import (
    ChangePasswordView,
    CSRFView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
)

app_name = "authentication"

urlpatterns = [
    path("csrf/", CSRFView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
]
