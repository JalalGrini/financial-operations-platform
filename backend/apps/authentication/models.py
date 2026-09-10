# apps/authentication/models.py
"""
Authentication Models.

This module contains the authentication-related models:
- RefreshToken: JWT refresh tokens with rotation and blacklisting
- UserSession: User session tracking
- FailedLoginAttempt: Rate limiting and account lockout protection
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import ArchiveModel, ReferenceTrackedModel

from .managers import FailedLoginAttemptManager, RefreshTokenManager, UserSessionManager


class RefreshToken(ReferenceTrackedModel):
    """
    RefreshToken - JWT refresh tokens with rotation and blacklisting.

    Provides secure refresh token handling with:
    - Token rotation (old token invalidated on refresh)
    - Blacklisting of revoked tokens
    - Token family tracking for session management
    - Expiration and revocation support
    """

    # Token
    token = models.CharField(
        _("token"),
        max_length=512,
        unique=True,
        db_index=True,
        help_text=_("Opaque refresh token string"),
    )

    # User association
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
        verbose_name=_("user"),
        help_text=_("User who owns this refresh token"),
    )

    # Token family tracking (for session management)
    token_family = models.UUIDField(
        _("token family"),
        default=uuid.uuid4,
        editable=False,
        db_index=True,
        help_text=_("Groups related access/refresh tokens for a session"),
    )

    # JTI of the access token this refresh token created (for blacklisting)
    access_token_jti = models.CharField(
        _("access token JTI"),
        max_length=256,
        blank=True,
        help_text=_("JTI of the access token this refresh token created"),
    )

    # Expiration
    expires_at = models.DateTimeField(
        _("expires at"),
        db_index=True,
        help_text=_("When this refresh token expires"),
    )

    # Revocation tracking
    revoked_at = models.DateTimeField(
        _("revoked at"),
        null=True,
        blank=True,
        help_text=_("When this token was revoked"),
    )
    revoked_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_refresh_tokens",
        verbose_name=_("revoked by"),
        help_text=_("User who revoked this token"),
    )
    revoked_reason = models.CharField(
        _("revocation reason"),
        max_length=255,
        blank=True,
        help_text=_("Reason for token revocation"),
    )

    # Token rotation tracking
    replaced_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replaced_tokens",
        verbose_name=_("replaced by"),
        help_text=_("Token that replaced this one during rotation"),
    )

    # Metadata
    user_agent = models.TextField(
        _("user agent"),
        blank=True,
        help_text=_("User agent at token creation"),
    )
    ip_address = models.GenericIPAddressField(
        _("IP address"),
        null=True,
        blank=True,
        help_text=_("IP address at token creation"),
    )

    objects = RefreshTokenManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("refresh token")
        verbose_name_plural = _("refresh tokens")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_archived"], name="rt_user_archived_idx"),
            models.Index(fields=["token"], name="rt_token_idx"),
            models.Index(fields=["expires_at", "is_archived"], name="rt_exp_arch_idx"),
            models.Index(fields=["token_family"], name="rt_family_idx"),
            models.Index(fields=["revoked_at", "is_archived"], name="rt_revoked_arch_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["token"],
                name="unique_refresh_token",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.user.email}"

    def generate_reference(self) -> str:
        """Generate a unique reference code for the refresh token."""
        import uuid

        return f"RT-{uuid.uuid4().hex[:12].upper()}"

    def is_valid(self) -> bool:
        """Check if the refresh token is valid (not archived, revoked, or expired)."""
        if self.is_archived:
            return False
        if self.revoked_at is not None:
            return False
        if self.expires_at <= timezone.now():
            return False
        return True

    def revoke(self, user=None, reason: str = "") -> None:
        """Revoke this refresh token."""
        self.revoked_at = timezone.now()
        self.revoked_by = user
        self.revoked_reason = reason
        self.is_archived = True
        self.archived_at = timezone.now()
        self.archived_by = user
        self.save(
            update_fields=[
                "revoked_at",
                "revoked_by",
                "revoked_reason",
                "is_archived",
                "archived_at",
                "archived_by",
                "updated_at",
            ]
        )

    def replace_with(self, new_token: "RefreshToken", user=None) -> "RefreshToken":
        """
        Replace this token with a new one (token rotation).

        Args:
            new_token: The new refresh token that replaces this one
            user: User performing the rotation

        Returns:
            The original token (self) for chaining
        """
        self.replaced_by = new_token
        self.revoked_at = timezone.now()
        self.revoked_by = user
        self.revoked_reason = "Token rotated"
        self.is_archived = True
        self.archived_at = timezone.now()
        self.archived_by = user
        self.save(
            update_fields=[
                "replaced_by",
                "revoked_at",
                "revoked_by",
                "revoked_reason",
                "is_archived",
                "archived_at",
                "archived_by",
                "updated_at",
            ]
        )
        return self

    # NOTE (cycle 3 deduplication): a second, identical `is_valid()` was defined
    # here, shadowing the one above. See the module note in
    # apps/common/tests/test_module_hygiene.py.


class UserSession(ArchiveModel):
    """
    UserSession - Tracks active user sessions.

    Provides session management with:
    - Session tracking and management
    - Device/browser fingerprinting
    - Concurrent session limits
    - Remote session revocation
    """

    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="user_sessions",
        verbose_name=_("user"),
    )

    # Session identification
    session_key = models.CharField(
        _("session key"),
        max_length=255,
        unique=True,
        db_index=True,
        help_text=_("Opaque session identifier"),
    )

    # Device/Browser information
    user_agent = models.TextField(
        _("user agent"),
        blank=True,
        help_text=_("User agent string"),
    )
    ip_address = models.GenericIPAddressField(
        _("IP address"),
        null=True,
        blank=True,
        help_text=_("Client IP address"),
    )
    device_fingerprint = models.CharField(
        _("device fingerprint"),
        max_length=256,
        blank=True,
        help_text=_("Device/browser fingerprint hash"),
    )
    device_name = models.CharField(
        _("device name"),
        max_length=255,
        blank=True,
        help_text=_("Human-readable device name"),
    )
    device_type = models.CharField(
        _("device type"),
        max_length=50,
        blank=True,
        help_text=_("Device type: desktop, mobile, tablet, etc."),
    )
    browser = models.CharField(
        _("browser"),
        max_length=100,
        blank=True,
        help_text=_("Browser name and version"),
    )
    operating_system = models.CharField(
        _("operating system"),
        max_length=100,
        blank=True,
        help_text=_("Operating system"),
    )

    # Location
    country = models.CharField(
        _("country"),
        max_length=100,
        blank=True,
    )
    city = models.CharField(
        _("city"),
        max_length=100,
        blank=True,
    )

    # Session status
    is_current = models.BooleanField(
        _("current session"),
        default=False,
        help_text=_("Whether this is the current active session"),
    )
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_("Whether the session is currently active"),
    )
    last_activity = models.DateTimeField(
        _("last activity"),
        auto_now=True,
        help_text=_("Last activity timestamp"),
    )
    expires_at = models.DateTimeField(
        _("expires at"),
        db_index=True,
        help_text=_("When this session expires"),
    )

    # Revocation
    revoked_at = models.DateTimeField(
        _("revoked at"),
        null=True,
        blank=True,
    )
    revoked_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_sessions",
        verbose_name=_("revoked by"),
    )
    revoked_reason = models.CharField(
        _("revocation reason"),
        max_length=255,
        blank=True,
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created at"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Updated at"))
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions_created",
        verbose_name=_("Created by"),
    )
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions_updated",
        verbose_name=_("Updated by"),
    )

    objects = UserSessionManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("user session")
        verbose_name_plural = _("user sessions")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_archived"], name="us_user_archived_idx"),
            models.Index(fields=["session_key"], name="us_session_key_idx"),
            models.Index(
                fields=["user", "is_active", "is_archived"], name="us_user_active_arch_idx"
            ),
            models.Index(fields=["expires_at", "is_archived"], name="us_exp_arch_idx"),
            models.Index(fields=["device_fingerprint"], name="us_fingerprint_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["session_key"],
                name="unique_user_session_key",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.device_name or self.device_type or 'Unknown Device'}"

    def is_valid(self) -> bool:
        """Check if the session is valid (active, not expired, not archived)."""
        if self.is_archived:
            return False
        if not self.is_active:
            return False
        if self.revoked_at is not None:
            return False
        if self.expires_at <= timezone.now():
            return False
        return True

    @property
    def is_revoked(self) -> bool:
        """Check if the session has been revoked."""
        return self.revoked_at is not None

    def revoke(self, user=None, reason: str = "") -> None:
        """Revoke this session."""
        self.revoked_at = timezone.now()
        self.revoked_by = user
        self.revoked_reason = reason
        self.is_active = False
        self.is_archived = True
        self.archived_at = timezone.now()
        self.archived_by = user
        self.save(
            update_fields=[
                "revoked_at",
                "revoked_by",
                "revoked_reason",
                "is_active",
                "is_archived",
                "archived_at",
                "archived_by",
                "updated_at",
            ]
        )

    def revoke_all_other_sessions(self, user=None) -> int:
        """Revoke all other sessions for this user."""
        count = (
            UserSession.objects.filter(
                user=self.user,
                is_archived=False,
                is_active=True,
            )
            .exclude(pk=self.pk)
            .update(
                revoked_at=timezone.now(),
                revoked_by=user,
                revoked_reason="Revoked by user",
                is_active=False,
                is_archived=True,
                archived_at=timezone.now(),
                archived_by=user,
            )
        )
        return count

    # NOTE (cycle 3 deduplication): a second, identical `is_valid()` was defined
    # here, shadowing the one above.

    def extend(self, duration: timedelta = None) -> None:
        """Extend session expiration."""
        if duration is None:
            from django.conf import settings

            duration = timedelta(hours=getattr(settings, "SESSION_COOKIE_AGE", 3600))
        self.expires_at = timezone.now() + duration
        self.save(update_fields=["expires_at", "updated_at"])

    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = timezone.now()
        self.save(update_fields=["last_activity", "updated_at"])


class FailedLoginAttempt(ArchiveModel):
    """
    FailedLoginAttempt - Tracks failed login attempts for rate limiting and account lockout.

    Provides:
    - Rate limiting by email and IP
    - Progressive lockout (increasing lockout duration)
    - Account lockout protection
    - Audit trail for security audits
    """

    # Identification
    email = models.EmailField(
        _("email"),
        max_length=254,
        db_index=True,
        help_text=_("Email address used in login attempt"),
    )
    ip_address = models.GenericIPAddressField(
        _("IP address"),
        db_index=True,
        help_text=_("IP address of the login attempt"),
    )
    user_agent = models.TextField(
        _("user agent"),
        blank=True,
        help_text=_("User agent of the login attempt"),
    )

    # Lockout tracking
    attempt_count = models.PositiveIntegerField(
        _("attempt count"),
        default=1,
        help_text=_("Number of consecutive failed attempts"),
    )
    locked_until = models.DateTimeField(
        _("locked until"),
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Timestamp until which the account/IP is locked"),
    )
    lockout_count = models.PositiveIntegerField(
        _("lockout count"),
        default=0,
        help_text=_("Number of times this email/IP has been locked"),
    )

    # Details
    failure_reason = models.CharField(
        _("failure reason"),
        max_length=255,
        blank=True,
        help_text=_("Reason for login failure"),
    )

    # Status
    is_locked = models.BooleanField(
        _("is locked"),
        default=False,
        help_text=_("Whether this email/IP is currently locked"),
    )

    # Timestamps
    last_attempt_at = models.DateTimeField(
        _("last attempt at"),
        auto_now=True,
        help_text=_("Timestamp of last failed attempt"),
    )
    first_attempt_at = models.DateTimeField(
        _("first attempt at"),
        auto_now_add=True,
        help_text=_("Timestamp of first failed attempt in current series"),
    )

    objects = FailedLoginAttemptManager()
    all_objects = models.Manager()

    # NOTE (cycle 3): a FIRST `class Meta` was defined here, shadowed by the one
    # at the bottom of this class. Python keeps only the last definition, which
    # had two consequences:
    #
    # 1. This shadowed Meta listed `fla_locked_arch_idx` TWICE. Django rejects
    #    duplicate index names (system check models.E012), so this Meta was
    #    itself invalid - being shadowed is the only reason the project booted.
    #    That made it a trap for the obvious cleanup: deleting the *other* Meta
    #    would have turned a silent problem into a hard startup failure.
    # 2. It declared an index on (email, ip_address) - `fla_email_ip_idx` - which
    #    was therefore never created. That is precisely the lookup the login
    #    lockout performs on every failed login, so the index has been carried
    #    over to the surviving Meta below (once, not twice).

    def __str__(self):
        return f"Failed login for {self.email} from {self.ip_address}"

    def is_currently_locked(self) -> bool:
        """Check if the account/IP is currently locked."""
        if not self.is_locked:
            return False
        if self.locked_until is None:
            return True
        return self.locked_until > timezone.now()

    def lock(self, duration: int = None, user=None) -> None:
        """Lock the account/IP for a specified duration."""

        if duration is None:
            # Progressive lockout: 5min, 15min, 30min, 1hr, 4hr, 24hr
            base_minutes = 5
            duration = base_minutes * (2 ** min(self.lockout_count, 6))

        self.is_locked = True
        self.locked_until = timezone.now() + timedelta(minutes=duration)
        self.lockout_count += 1
        self.save(update_fields=["is_locked", "locked_until", "lockout_count", "updated_at"])

    def unlock(self, user=None) -> None:
        """Unlock the account/IP."""
        self.is_locked = False
        self.locked_until = None
        self.save(update_fields=["is_locked", "locked_until", "updated_at"])

    def record_attempt(self, failure_reason: str = "", user_agent: str = "") -> None:
        """Record a new failed attempt."""
        self.attempt_count += 1
        self.failure_reason = failure_reason
        if user_agent:
            self.user_agent = user_agent
        self.last_attempt_at = timezone.now()
        self.save(
            update_fields=[
                "attempt_count",
                "failure_reason",
                "user_agent",
                "last_attempt_at",
                "updated_at",
            ]
        )

    def increment_attempt(self) -> None:
        """Increment attempt count and check for lockout."""

        self.attempt_count += 1
        self.last_attempt_at = timezone.now()

        # Check for lockout (default: 5 failed attempts)
        max_attempts = getattr(settings, "LOGIN_MAX_ATTEMPTS", 5)
        if self.attempt_count >= max_attempts and not self.is_currently_locked():
            self.lock()

        self.last_attempt_at = timezone.now()
        self.save(
            update_fields=[
                "attempt_count",
                "last_attempt_at",
                "is_locked",
                "locked_until",
                "lockout_count",
                "updated_at",
            ]
        )

    def reset_attempts(self) -> None:
        """Reset failed attempt counter on successful login."""
        self.attempt_count = 0
        self.failure_reason = ""
        self.is_locked = False
        self.locked_until = None
        self.save(
            update_fields=[
                "attempt_count",
                "failure_reason",
                "is_locked",
                "locked_until",
                "updated_at",
            ]
        )

    # NOTE (cycle 3 deduplication): a second, identical `is_currently_locked()`
    # and a second, identical `__str__()` were defined here, shadowing the ones
    # above. `is_currently_locked()` is the predicate that decides whether an
    # account lockout applies, so two copies free to diverge was the most
    # dangerous of the four duplicates found in this module.

    class Meta:
        verbose_name = _("failed login attempt")
        verbose_name_plural = _("failed login attempts")
        ordering = ["-last_attempt_at"]
        indexes = [
            models.Index(fields=["email", "is_archived"], name="fla_email_arch_idx"),
            models.Index(fields=["ip_address", "is_archived"], name="fla_ip_arch_idx"),
            models.Index(fields=["locked_until", "is_archived"], name="fla_locked_arch_idx"),
            # Recovered from the shadowed Meta (see the note above). This index
            # backs the per-(email, IP) lockout lookup run on every failed login.
            models.Index(fields=["email", "ip_address"], name="fla_email_ip_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["email", "ip_address"],
                condition=models.Q(is_archived=False),
                name="unique_active_failed_login_per_email_ip",
            ),
        ]


class PasswordResetCode(models.Model):
    """Short-lived 6-digit reset code. The code itself is stored hashed."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_codes",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_codes"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "used_at"], name="password_re_user_id_used_idx"),
        ]
