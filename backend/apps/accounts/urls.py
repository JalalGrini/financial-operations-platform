from django.urls import path

from apps.accounts.views import (
    AccountAvatarView,
    AccountDetailView,
    AccountListCreateView,
    SelfProfileView,
    TemporaryPasswordView,
    UserPreferencesView,
)

app_name = "accounts"
urlpatterns = [
    path("me/preferences/", UserPreferencesView.as_view(), name="user-preferences"),
    path("me/profile/", SelfProfileView.as_view(), name="self-profile"),
    path("me/avatar/", AccountAvatarView.as_view(), name="self-avatar"),
    path("users/", AccountListCreateView.as_view(), name="users"),
    path("users/<uuid:user_id>/", AccountDetailView.as_view(), name="user-detail"),
    path(
        "users/<uuid:user_id>/temporary-password/",
        TemporaryPasswordView.as_view(),
        name="temporary-password",
    ),
    path("users/<uuid:user_id>/avatar/", AccountAvatarView.as_view(), name="user-avatar"),
]
