# apps/authentication/selectors.py
"""
Selectors for Authentication models.

Selectors encapsulate read/query logic and return querysets or model instances.
They should not modify state.
"""
from django.db.models import QuerySet
from django.utils import timezone

from .models import FailedLoginAttempt, RefreshToken, UserSession


class RefreshTokenSelector:
    """Selectors for RefreshToken queries."""

    @staticmethod
    def get_all() -> "QuerySet":
        """Get all non-archived refresh tokens."""
        return RefreshToken.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet":
        """Get all refresh tokens including archived."""
        return RefreshToken.all_objects.all()

    @staticmethod
    def get_by_token(token: str):
        """Get non-archived refresh token by token string."""
        return RefreshToken.objects.filter(token=token, is_archived=False).first()

    @staticmethod
    def get_by_user(user_id) -> "QuerySet":
        """Get non-archived refresh tokens for a user."""
        return RefreshToken.objects.filter(user_id=user_id, is_archived=False)

    @staticmethod
    def get_valid_by_user(user_id) -> "QuerySet":
        """Get valid (non-archived, non-revoked, non-expired) refresh tokens for a user."""
        return RefreshToken.objects.filter(
            user_id=user_id,
            is_archived=False,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )

    @staticmethod
    def get_by_jti(jti: str):
        """Get refresh token by access token JTI."""
        return RefreshToken.objects.filter(
            access_token_jti=jti,
            is_archived=False,
        ).first()

    @staticmethod
    def get_revoked_by_user(user_id) -> "QuerySet":
        """Get revoked refresh tokens for a user."""
        return RefreshToken.objects.filter(
            user_id=user_id,
            revoked_at__isnull=False,
        )

    @staticmethod
    def get_expired() -> "QuerySet":
        """Get expired (non-archived) refresh tokens."""
        return RefreshToken.objects.filter(
            is_archived=False,
            expires_at__lt=timezone.now(),
        )


class UserSessionSelector:
    """Selectors for UserSession queries."""

    @staticmethod
    def get_all() -> "QuerySet":
        """Get all non-archived user sessions."""
        return UserSession.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet":
        """Get all user sessions including archived."""
        return UserSession.all_objects.all()

    @staticmethod
    def get_by_id(session_id):
        """Get non-archived session by ID."""
        return UserSession.objects.filter(id=session_id, is_archived=False).first()

    @staticmethod
    def get_by_key(session_key: str):
        """Get non-archived session by session key."""
        return UserSession.objects.filter(session_key=session_key, is_archived=False).first()

    @staticmethod
    def get_by_user(user_id) -> "QuerySet":
        """Get non-archived sessions for a user."""
        return UserSession.objects.filter(user_id=user_id, is_archived=False)

    @staticmethod
    def get_active_by_user(user_id) -> "QuerySet":
        """Get active (non-archived, non-expired, non-revoked) sessions for a user."""
        return UserSession.objects.filter(
            user_id=user_id,
            is_archived=False,
            is_active=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )

    @staticmethod
    def get_active_sessions() -> "QuerySet":
        """Get all active sessions."""
        return UserSession.objects.filter(
            is_archived=False,
            is_active=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )

    @staticmethod
    def get_revoked() -> "QuerySet":
        """Get revoked sessions."""
        return UserSession.objects.filter(revoked_at__isnull=False)

    @staticmethod
    def get_revoked_by_user(user_id) -> "QuerySet":
        """Get revoked sessions for a specific user."""
        return UserSession.objects.filter(
            user_id=user_id,
            revoked_at__isnull=False,
        )

    @staticmethod
    def get_expired() -> "QuerySet":
        """Get expired sessions."""
        return UserSession.objects.filter(
            expires_at__lt=timezone.now(),
        )


class FailedLoginAttemptSelector:
    """Selectors for FailedLoginAttempt queries."""

    @staticmethod
    def get_all() -> "QuerySet":
        """Get all non-archived failed login attempts."""
        return FailedLoginAttempt.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet":
        """Get all failed login attempts including archived."""
        return FailedLoginAttempt.all_objects.all()

    @staticmethod
    def get_by_email(email: str):
        """Get non-archived failed login attempts by email."""
        return FailedLoginAttempt.objects.filter(email__iexact=email, is_archived=False)

    @staticmethod
    def get_by_ip(ip_address: str):
        """Get non-archived failed login attempts by IP."""
        return FailedLoginAttempt.objects.filter(ip_address=ip_address, is_archived=False)

    @staticmethod
    def get_by_email_and_ip(email: str, ip_address: str):
        """Get non-archived failed login attempts by email and IP."""
        return FailedLoginAttempt.objects.filter(
            email__iexact=email, ip_address=ip_address, is_archived=False
        ).first()

    @staticmethod
    def get_locked() -> "QuerySet":
        """Get locked (currently locked) failed login attempts."""
        return FailedLoginAttempt.objects.filter(
            is_archived=False,
            locked_until__gt=timezone.now(),
        )

    @staticmethod
    def get_for_email_and_ip(email: str, ip_address: str):
        """Get failed login attempt for email and IP."""
        return FailedLoginAttempt.objects.filter(
            email__iexact=email,
            ip_address=ip_address,
            is_archived=False,
        ).first()

    @staticmethod
    def get_locked_by_email(email: str):
        """Get locked attempts for an email."""
        return FailedLoginAttempt.objects.filter(
            email__iexact=email,
            is_archived=False,
            locked_until__gt=timezone.now(),
        )

    @staticmethod
    def get_locked_by_ip(ip_address: str):
        """Get locked attempts by IP."""
        return FailedLoginAttempt.objects.filter(
            ip_address=ip_address,
            is_archived=False,
            locked_until__gt=timezone.now(),
        )
