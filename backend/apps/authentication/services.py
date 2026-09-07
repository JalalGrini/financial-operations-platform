# apps/authentication/services.py
"""
Authentication Services.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification", "Backend cleanup"): this module previously contained a
JWT-authority implementation (`login()`, `_generate_tokens()`,
`refresh_access_token()`, `logout()`) that mixed the legacy custom
`apps.authentication.models.RefreshToken` table with
`rest_framework_simplejwt` tokens, was never imported or called by any
view (confirmed by a full-repository grep during Entry M1A-1), and
contained a broken method (`refresh_access_token()` referenced an
undefined `new_token` name and called `RefreshToken.revoke(replaced_by=...)`,
a keyword argument that method never accepted). That JWT-authority logic
has been removed entirely rather than fixed, because:

1. It duplicated — and would have continued to drift from — the single
   canonical JWT lifecycle now implemented in `apps/authentication/views.py`
   (login/refresh/logout/change-password), which is SimpleJWT-only per
   the approved M1-A design.
2. It was unreachable dead code with no caller, so "fixing" it would
   have meant writing new behavior no requirement calls for, not
   repairing an active code path.

The remaining methods below manage the legacy, non-destructively-retained
`UserSession` and `FailedLoginAttempt` tables (session bookkeeping and
failed-login tracking are unrelated to which system is the JWT
authority) and are kept, deduplicated, for later review — consistent
with the Engineering Log's instruction to retain legacy tables
non-destructively rather than delete this service layer outright.
Nothing in this file is called by any routed view as of M1-A; it exists
for potential future use of the legacy session/lockout tables.
"""
import secrets
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.authentication.models import FailedLoginAttempt, UserSession
from apps.authentication.selectors import (
    FailedLoginAttemptSelector,
    RefreshTokenSelector,
    UserSessionSelector,
)
from apps.authentication.validators import AuthenticationValidator


class AuthenticationService:
    """
    Service layer for the legacy, non-JWT-authority Authentication
    bookkeeping tables (`UserSession`, `FailedLoginAttempt`).

    Does NOT create, rotate, validate, persist, or revoke JWTs — that
    is the exclusive responsibility of `apps/authentication/views.py`
    using `rest_framework_simplejwt` directly. This class is not called
    by any routed view as of M1-A.
    """

    def __init__(self):
        self.refresh_token_selector = RefreshTokenSelector()
        self.session_selector = UserSessionSelector()
        self.failed_login_selector = FailedLoginAttemptSelector()
        self.validator = AuthenticationValidator()

    # ==================== SESSION MANAGEMENT ====================

    def create_session(
        self, user, request=None, device_info=None, remember_me=False
    ) -> "UserSession":
        """Create a new legacy `UserSession` bookkeeping record."""
        session = UserSession.objects.create(
            user=user,
            session_key=secrets.token_urlsafe(32),
            ip_address=self._get_client_ip(request) if request else None,
            user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
            expires_at=timezone.now() + timedelta(days=30 if remember_me else 1),
            created_by=user,
            updated_by=user,
        )
        return session

    def get_user_sessions(self, user):
        """Get all active legacy `UserSession` records for a user."""
        return UserSession.objects.active_for_user(user)

    def revoke_session(self, session_key: str, user=None) -> bool:
        """Revoke a specific legacy `UserSession` record."""
        try:
            session = UserSession.objects.get(session_key=session_key, is_archived=False)
        except UserSession.DoesNotExist:
            return False
        session.revoke(user=user, reason="Session revoked")
        return True

    def revoke_all_sessions(self, user, except_session_key=None) -> int:
        """Revoke all legacy `UserSession` records for a user except one."""
        sessions = UserSession.objects.active_for_user(user)
        if except_session_key:
            sessions = sessions.exclude(session_key=except_session_key)

        count = 0
        for session in sessions:
            session.revoke(user=user, reason="Logout from other device")
            count += 1
        return count

    # ==================== FAILED LOGIN TRACKING ====================

    def record_failed_login(
        self, email: str, ip: str = None, reason: str = "", user_agent: str = ""
    ) -> None:
        """Record a failed login attempt in the legacy
        `FailedLoginAttempt` table."""
        FailedLoginAttempt.objects.create(
            email=email,
            ip_address=ip,
            failure_reason=reason,
            user_agent=user_agent,
        )

    def check_account_lock(self, email: str, ip: str = None) -> bool:
        """Check whether the legacy `FailedLoginAttempt` table has an
        entry marking this email/IP as currently locked."""
        qs = FailedLoginAttemptSelector.get_by_email(email)
        if ip:
            qs = qs.filter(ip_address=ip)
        return any(attempt.is_currently_locked() for attempt in qs)

    def unlock_account(self, email: str, ip: str = None) -> int:
        """Unlock every matching legacy `FailedLoginAttempt` entry by
        clearing its lock fields. Returns the number of rows updated."""
        qs = FailedLoginAttemptSelector.get_by_email(email)
        if ip:
            qs = qs.filter(ip_address=ip)
        count = 0
        for attempt in qs:
            attempt.unlock()
            count += 1
        return count

    # ==================== PASSWORD MANAGEMENT ====================

    def change_password(self, user, old_password: str, new_password: str) -> bool:
        """
        Change a user's password and revoke their legacy `UserSession`
        bookkeeping records (this does NOT blacklist any SimpleJWT
        refresh token — that is handled exclusively by
        `apps.authentication.views.ChangePasswordView`, which is the
        actual routed endpoint for this operation).
        """
        if not user.check_password(old_password):
            raise ValidationError(_("Current password is incorrect."))

        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(new_password, user)
        except ValidationError as e:
            raise ValidationError(e.messages)

        user.set_password(new_password)
        user.save(update_fields=["password"])

        self.revoke_all_sessions(user)
        return True

    # ==================== INTERNAL HELPERS ====================

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
