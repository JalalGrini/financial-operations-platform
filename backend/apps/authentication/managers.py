# apps/authentication/managers.py
"""
Custom managers for authentication models.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification", Entry M1A-3, backend cleanup): this module previously
defined `UserSessionQuerySet`/`UserSessionManager` TWICE (the second
definition silently shadowed the first - dead code duplication with no
behavioral difference) and imported `ActiveManager` from
`apps.common.models` only to immediately shadow that import with an
unused, never-referenced local subclass of `models.Manager` also named
`ActiveManager` (a second, unrelated duplication bug). Both duplications
have been
removed. No behavior changes: every class below is otherwise byte-for-byte
identical to whichever definition was previously in effect (the second
one, since Python class statements overwrite earlier ones of the same
name at module-execution time).

These managers back the legacy, non-destructively-retained
`RefreshToken`/`UserSession`/`FailedLoginAttempt` models
(`apps/authentication/models.py`). None of them are part of the active
SimpleJWT/cookie JWT authority implemented in
`apps/authentication/views.py`.
"""
from django.db import models
from django.utils import timezone


class RefreshTokenQuerySet(models.QuerySet):
    """Custom QuerySet for RefreshToken with helper methods."""

    def active(self):
        """Return only valid (non-archived, non-revoked, non-expired) tokens."""
        return self.filter(
            is_archived=False,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )

    def revoked(self):
        """Return revoked tokens."""
        return self.filter(revoked_at__isnull=False)

    def expired(self):
        """Return expired tokens."""
        return self.filter(expires_at__lt=timezone.now())

    def for_user(self, user):
        """Filter tokens for a specific user."""
        return self.filter(user=user)

    def valid_for_user(self, user):
        """Get valid tokens for a specific user."""
        return self.active().for_user(user)


class RefreshTokenManager(models.Manager):
    """Manager for RefreshToken with custom queryset."""

    def get_queryset(self):
        return RefreshTokenQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def revoked(self):
        return self.get_queryset().revoked()

    def expired(self):
        return self.get_queryset().expired()

    def for_user(self, user):
        return self.get_queryset().for_user(user)

    def valid_for_user(self, user):
        return self.get_queryset().valid_for_user(user)


class UserSessionQuerySet(models.QuerySet):
    """Custom QuerySet for UserSession with helper methods."""

    def active(self):
        """Return only active (non-archived, non-expired) sessions."""
        return self.filter(
            is_archived=False,
            expires_at__gt=timezone.now(),
        )

    def expired(self):
        """Return expired sessions."""
        return self.filter(expires_at__lt=timezone.now())

    def for_user(self, user):
        """Filter sessions for a specific user."""
        return self.filter(user=user)

    def active_for_user(self, user):
        """Get active sessions for a specific user."""
        return self.active().for_user(user)


class UserSessionManager(models.Manager):
    """Manager for UserSession with custom queryset."""

    def get_queryset(self):
        from .models import UserSession

        return UserSessionQuerySet(UserSession, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def expired(self):
        return self.get_queryset().expired()

    def for_user(self, user):
        return self.get_queryset().for_user(user)

    def active_for_user(self, user):
        return self.get_queryset().active_for_user(user)


class FailedLoginAttemptQuerySet(models.QuerySet):
    """Custom QuerySet for FailedLoginAttempt with helper methods."""

    def active(self):
        """Return only non-archived failed login attempts."""
        return self.filter(is_archived=False)

    def locked(self):
        """Return locked attempts (locked_until > now)."""
        return self.filter(
            is_archived=False,
            locked_until__gt=timezone.now(),
        )

    def for_email(self, email: str):
        """Filter by email."""
        return self.filter(email__iexact=email)

    def for_ip(self, ip_address: str):
        """Filter by IP address."""
        return self.filter(ip_address=ip_address)

    def for_email_and_ip(self, email: str, ip_address: str):
        """Filter by email and IP combination."""
        return self.filter(email__iexact=email, ip_address=ip_address)


class FailedLoginAttemptManager(models.Manager):
    """Manager for FailedLoginAttempt with custom queryset."""

    def get_queryset(self):
        from .models import FailedLoginAttempt

        return FailedLoginAttemptQuerySet(FailedLoginAttempt, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def locked(self):
        return self.get_queryset().locked()

    def for_email(self, email: str):
        return self.get_queryset().for_email(email)

    def for_ip(self, ip_address: str):
        return self.get_queryset().for_ip(ip_address)

    def for_email_and_ip(self, email: str, ip_address: str):
        return self.get_queryset().for_email_and_ip(email, ip_address)
