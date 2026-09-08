# apps/accounts/models.py
"""
Custom User model for the Financial Operations Platform.

Uses UUID primary key and email as the login identifier.
Compatible with Django Admin and Django's permission system.
"""
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel, UUIDModel

from .managers import UserManager


class User(AbstractUser, TimeStampedModel):
    """
    Custom User model for the Financial Operations Platform.

    Key design decisions:
    - UUID primary key (prevents enumeration, works in distributed systems)
    - Email as USERNAME_FIELD (login identifier)
    - First name and last name preserved for display
    - is_active for account activation state
    - Timestamps from TimeStampedModel (created_at, updated_at)
    - Compatible with Django Admin and permission system
    - Uses Django's Groups and Permissions for roles (future: custom roles)

    Note: We inherit from AbstractUser which already includes:
    - username (we keep it but don't use for auth)
    - password
    - last_login
    - is_superuser, is_staff, is_active
    - date_joined
    - groups, user_permissions
    - first_name, last_name, email
    """

    # Replace default AutoField pk with UUID
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name=_("ID"),
    )

    # Email is the unique identifier for authentication
    email = models.EmailField(
        _("email address"),
        unique=True,
        help_text=_("Used for login and notifications"),
    )

    # Account activation state
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_(
            "Designates whether this user should be treated as active. "
            "Unselect this instead of deleting accounts."
        ),
    )

    # Remove username field requirement (we use email)
    username = models.CharField(
        _("username"),
        max_length=150,
        unique=True,
        blank=True,
        help_text=_(
            "Required for Django compatibility. Auto-generated from email if not provided."
        ),
    )

    avatar = models.ImageField(
        _("profile picture"),
        upload_to="private/avatars/%Y/%m/",
        null=True,
        blank=True,
    )

    def avatar_api_url(self):
        """Same-origin URL the UI uses to fetch this user's stored picture."""
        if not self.avatar:
            return None
        stamp = int(self.updated_at.timestamp()) if self.updated_at else 0
        return f"/api/v1/accounts/users/{self.pk}/avatar/?v={stamp}"
    must_change_password = models.BooleanField(
        _("must change password"),
        default=False,
        help_text=_("Require a password change before normal API access."),
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["-date_joined"]
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        # Auto-generate username from email if not provided
        if not self.username:
            base_username = self.email.split("@")[0]
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exclude(pk=self.pk).exists():
                username = f"{base_username}{counter}"
                counter += 1
            self.username = username
        super().save(*args, **kwargs)

    def get_full_name(self):
        """
        Return the first_name plus the last_name, with a space in between.
        Falls back to email if both names are empty.
        """
        full_name = f"{self.first_name} {self.last_name}".strip()
        return full_name if full_name else self.email

    def get_short_name(self):
        """Return the short name for the user."""
        return self.first_name or self.email.split("@")[0]


class UserPreference(UUIDModel, TimeStampedModel):
    """
    Per-user preference store (one row per user).

    Backs the personnel settings page (and any future settings UI). Values
    live in a JSON column; the allowed keys and their types are defined and
    enforced by apps.accounts.serializers.PREFERENCE_SCHEMA, so a typo'd key
    is rejected rather than silently persisted. Anything that needs database
    constraints or querying belongs in a real column, not here.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="preferences",
        verbose_name=_("user"),
    )
    values = models.JSONField(
        _("values"),
        default=dict,
        blank=True,
        help_text=_("Validated preference key/value pairs"),
    )

    class Meta:
        verbose_name = _("user preference")
        verbose_name_plural = _("user preferences")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Preferences for {self.user.email}"
