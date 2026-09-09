# apps/authentication/views.py
"""
Authentication API Views.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification"): implements a single, coherent JWT lifecycle where
SimpleJWT is the sole active JWT authority (using its outstanding-token
and blacklist infrastructure), all access/refresh JWTs travel exclusively
as HttpOnly cookies (never in JSON bodies or request bodies), and CSRF
is explicitly enforced for every unsafe cookie-authenticated request via
`apps.authentication.authentication.CookieJWTAuthentication`.

Endpoints:
- `GET  /api/v1/auth/csrf/`            — public CSRF cookie bootstrap
- `POST /api/v1/auth/login/`           — email/password -> auth cookies
- `POST /api/v1/auth/refresh/`         — cookie-only rotate + reissue
- `POST /api/v1/auth/logout/`          — idempotent, blacklist + clear
- `GET  /api/v1/auth/me/`              — authoritative session check
- `POST /api/v1/auth/change-password/` — blacklists all outstanding tokens

The legacy `apps.authentication.models.RefreshToken`/`UserSession`/
`FailedLoginAttempt` custom tables are NOT used as JWT authority by any
view in this module (see Entry M1A-3 for the non-destructive retention
of those tables for later review).
"""
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token

# Required by `_locked_out_response()` for the Retry-After calculation. Verified
# present rather than assumed: apps/authentication/validators.py calls
# timezone.now() without this import and raises NameError as a result.
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.authentication import enforce_csrf
from apps.authentication.cookies import (
    clear_auth_cookies,
    get_refresh_token_from_cookie,
    set_auth_cookies,
)

# NOTE: import only `FailedLoginAttempt`. This module already binds the name
# `RefreshToken` to SimpleJWT's token class (above), while apps.authentication
# .models defines a *different* `RefreshToken` model - importing the model here
# would silently shadow the token class and break login.
from apps.authentication.models import FailedLoginAttempt
from apps.authentication.schema import (
    ChangePasswordRequestSchema,
    CSRFResponseSchema,
    EmptyDataResponseSchema,
    ErrorResponseSchema,
    LoginRequestSchema,
    LoginResponseSchema,
    MeResponseSchema,
    RefreshResponseSchema,
)
from apps.common.http import client_ip
from apps.common.throttling import LoginEmailRateThrottle, LoginIPRateThrottle

User = get_user_model()


def _serialize_user(user, include_last_login=False):
    """Build the safe, credential-free user payload shared by
    Login/Me. Never includes any token, password, or session-secret
    field."""
    roles = sorted(user.groups.values_list("name", flat=True))
    # A superuser has every backend permission even when no Django Group has
    # been assigned. Reflect that same effective access in the UI contract.
    if user.is_superuser and "Administrator" not in roles:
        roles.insert(0, "Administrator")

    data = {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name(),
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "is_active": user.is_active,
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        "roles": roles,
        "permissions": sorted(user.get_all_permissions()),
        "must_change_password": user.must_change_password,
        "avatar_url": user.avatar_api_url(),
    }
    if include_last_login:
        data["last_login"] = user.last_login.isoformat() if user.last_login else None
    return data


def _blacklist_refresh_token_string(raw_token: str) -> bool:
    """Blacklist a raw refresh-token string using SimpleJWT's own
    outstanding/blacklist infrastructure. Returns True if the token was
    successfully parsed and blacklisted (or was already blacklisted),
    False if it could not even be parsed. Never raises — every caller
    treats logout/refresh-replay as something to fail closed on
    (401/continue) rather than propagate an exception for."""
    try:
        token = RefreshToken(raw_token)
    except TokenError:
        return False
    try:
        token.blacklist()
    except TokenError:
        # Already blacklisted or otherwise rejected by check_blacklist();
        # from the caller's perspective this is still "handled".
        pass
    return True


def _blacklist_all_outstanding_tokens_for_user(user) -> None:
    """Blacklist every OutstandingToken SimpleJWT has ever issued for
    `user`, not only the token presented on the current request. Used
    by password change so that every other device/session's refresh
    token stops working immediately (Engineering Log requirement:
    "blacklist every outstanding SimpleJWT refresh token for that
    user")."""
    outstanding = OutstandingToken.objects.filter(user=user)
    for token in outstanding:
        BlacklistedToken.objects.get_or_create(token=token)


class CSRFView(APIView):
    """
    Public CSRF bootstrap endpoint.

    GET /api/v1/auth/csrf/

    Calling `django.middleware.csrf.get_token(request)` guarantees
    Django's CSRF middleware will set the (non-HttpOnly, browser-
    readable) CSRF cookie on the response, even though no session
    exists yet. The frontend calls this once before any unsafe
    (login/refresh/logout/change-password) request so it has a CSRF
    token to echo back in the `X-CSRFToken` header. The response body
    itself carries no credential material.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        responses={200: CSRFResponseSchema},
        tags=["auth"],
        description="Public CSRF cookie bootstrap. Ensures the CSRF "
        "cookie is set on the client so subsequent unsafe requests "
        "(login, refresh, logout, change-password) can present it.",
    )
    def get(self, request):
        get_token(request._request if hasattr(request, "_request") else request)
        return Response(
            {"success": True, "message": "CSRF cookie set.", "data": {}},
            status=status.HTTP_200_OK,
        )


def _client_ip(request) -> str:
    """
    Resolve the client IP used as part of the login lockout key.

    `X-Forwarded-For` is deliberately NOT trusted by default. That header is
    attacker-controlled: if it were trusted unconditionally, an attacker could
    send a different value on every request and give themselves a fresh lockout
    counter each time, which would reduce the brute-force protection below to
    decoration. It is honoured only when the deployment explicitly declares that
    it sits behind a proxy that overwrites the header
    (`TRUST_X_FORWARDED_FOR = True`), which is the only configuration in which
    the value can be believed.

    Consequence to keep in mind when deploying behind a load balancer without
    setting that flag: every request appears to originate from the proxy, so the
    per-IP half of the key collapses. The lockout still works (it is keyed on
    email *and* IP), but it becomes effectively per-email.
    """
    # Delegates to the shared helper so the lockout and the rate limiters can
    # never disagree about who the caller is. A second copy of this logic would
    # be free to drift, and a caller that resolved to one address for the
    # lockout and another for the throttle could satisfy one while evading the
    # other. Kept as a module-level name because existing call sites and tests
    # reference it.
    return client_ip(request)


def _get_lockout_record(email: str, ip_address: str):
    """Return the active failed-attempt record for this (email, IP), if any."""
    return FailedLoginAttempt.all_objects.filter(
        email=email, ip_address=ip_address, is_archived=False
    ).first()


def _locked_out_response(record):
    """
    The response returned while an identity is locked out.

    The body is intentionally identical whether or not the email belongs to a
    real account. Distinguishable responses here would hand an attacker an
    account-enumeration oracle - the very thing the shared 401 below is
    carefully written to avoid - and it would be easy to undo that property by
    adding a "helpful" message naming the account.
    """
    response = Response(
        {
            "success": False,
            "message": "Too many failed login attempts. Please try again later.",
            "errors": {
                "non_field_errors": ["Too many failed login attempts. Please try again later."]
            },
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    if record is not None and record.locked_until is not None:
        retry_after = int(max((record.locked_until - timezone.now()).total_seconds(), 1))
        response["Retry-After"] = str(retry_after)
    return response


def _record_failed_login(email: str, ip_address: str, user_agent: str) -> None:
    """
    Record one failed login against the (email, IP) pair, locking the identity
    once `settings.LOGIN_MAX_ATTEMPTS` consecutive failures are reached.

    `attempt_count` is seeded to 0 on creation rather than relying on the field
    default of 1, because `increment_attempt()` immediately adds 1 - keeping the
    default would make the very first failure count as two and lock users out
    one attempt early.

    The lock duration is the model's own progressive schedule (5min, 10, 20, 40,
    ... capped), so a repeat offender is slowed down increasingly while a user
    who simply mistyped is delayed only briefly.
    """
    record, _created = FailedLoginAttempt.all_objects.get_or_create(
        email=email,
        ip_address=ip_address,
        is_archived=False,
        defaults={
            "attempt_count": 0,
            "user_agent": (user_agent or "")[:1000],
            "failure_reason": "invalid_credentials",
        },
    )
    record.increment_attempt()


class LoginView(APIView):
    """
    Login endpoint.

    POST /api/v1/auth/login/

    Request: {"email": "...", "password": "..."}

    Success response contains only safe user data — no `access`/
    `refresh` fields. Both JWTs are set exclusively as HttpOnly
    cookies. Exactly one SimpleJWT token pair is generated per
    successful login (Entry M1A-1 found a prior implementation
    generating two pairs and discarding one, leaking an extra
    `OutstandingToken` row per login).
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    # Layered deliberately on top of the per-(email, IP) lockout below, which
    # cannot see an attacker who rotates IPs against one account (every row is a
    # first offence) or sprays one password across many accounts (same reason).
    # LoginEmailRateThrottle covers the first, LoginIPRateThrottle the second.
    throttle_classes = [LoginIPRateThrottle, LoginEmailRateThrottle]

    @extend_schema(
        request=LoginRequestSchema,
        responses={
            200: LoginResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
        },
        tags=["auth"],
    )
    def post(self, request):
        # Login CSRF protection: even though no user is authenticated
        # yet, a cross-site login-CSRF attack can still forge a
        # request that logs the victim's browser into an
        # attacker-controlled account, tricking the victim into
        # entering sensitive data (e.g. a payment form) believing
        # they are still using their own session. CSRF is enforced
        # explicitly here because `LoginView` has no authenticator
        # (it is `AllowAny`/`authentication_classes = []`), so
        # `CookieJWTAuthentication.enforce_csrf()` never runs for it.
        enforce_csrf(request)

        raw_identifier = (request.data.get("email") or "").strip()
        if "@" in raw_identifier:
            email = raw_identifier.lower()
        else:
            resolved_user = User.objects.filter(username__iexact=raw_identifier).first()
            email = resolved_user.email if resolved_user else raw_identifier.lower()
        password = request.data.get("password") or ""

        if not email or not password:
            return Response(
                {
                    "success": False,
                    "message": "Email and password are required.",
                    "errors": {"non_field_errors": ["Email and password are required."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # H-8 (cycle 3): brute-force protection. Before spending a password
        # check, refuse identities that are currently locked out. This is checked
        # BEFORE `authenticate()` so that a locked identity is refused even when
        # the supplied password is correct - otherwise an attacker who eventually
        # guesses right would still be let in, and the lockout would only be
        # delaying them rather than stopping them.
        ip_address = _client_ip(request)
        lockout_record = _get_lockout_record(email, ip_address)
        if lockout_record is not None and lockout_record.is_currently_locked():
            return _locked_out_response(lockout_record)

        # `authenticate()` returns None for both "no such user" and
        # "wrong password" (and, under this project's ModelBackend
        # configuration, also for an inactive user — see the
        # characterization tests in test_schema_and_behavior.py), which
        # is exactly the account-enumeration-safe behavior required:
        # both cases produce the identical 401 below.
        user = authenticate(request, username=email, password=password)

        if user is None:
            # Recorded for unknown emails as well as real ones. If only real
            # accounts accumulated failures, the presence or absence of a lockout
            # would itself reveal which emails exist.
            _record_failed_login(email, ip_address, request.META.get("HTTP_USER_AGENT", ""))
            return Response(
                {
                    "success": False,
                    "message": "Invalid email or password.",
                    "errors": {"non_field_errors": ["Invalid credentials."]},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            # Dead branch under the current ModelBackend configuration
            # (inactive users never reach here — `authenticate()`
            # already returns None for them via
            # `user_can_authenticate()`), retained and documented
            # rather than removed, matching the pre-existing,
            # architect-reviewed characterization of this exact
            # behavior from M0-R/M0-R2 (Login's schema already
            # documents this as a possible-but-currently-unreachable
            # 403 branch).
            return Response(
                {
                    "success": False,
                    "message": "Account is inactive.",
                    "errors": {"non_field_errors": ["Account is inactive."]},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Successful login clears the counter, so that occasional mistyped
        # passwords over time can never accumulate into a lockout for a user who
        # does keep logging in successfully.
        if lockout_record is not None:
            lockout_record.reset_attempts()

        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        response = Response(
            {
                "success": True,
                "message": "Login successful.",
                "data": {"user": _serialize_user(user)},
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access_token, refresh_token)
        return response


class RefreshView(APIView):
    """
    Token refresh endpoint.

    POST /api/v1/auth/refresh/

    Reads the refresh JWT ONLY from its HttpOnly cookie — any
    `refresh` field in the request body is ignored entirely, per the
    Engineering Log requirement that refresh/logout request bodies
    must not accept JWT strings. Requires CSRF (enforced by
    `CookieJWTAuthentication`... except this endpoint is intentionally
    `AllowAny`/no-authenticator, since the caller is not yet
    necessarily holding a *valid* access token when refreshing — so
    CSRF is enforced directly here instead).

    On success: rotates the refresh token (blacklisting the presented
    one, consistent with `SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"]`),
    issues a new access token, and sets both as replacement cookies.
    Returns no JWT strings in the JSON body. Replaying an
    already-rotated/blacklisted refresh token returns 401 and clears
    any stale auth cookies on the client.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=None,
        responses={
            200: RefreshResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
        },
        tags=["auth"],
        description="Rotates the refresh token read from its HttpOnly "
        "cookie. Accepts no request body JWT. Requires a valid CSRF "
        "token.",
    )
    def post(self, request):
        enforce_csrf(request)

        raw_refresh_token = get_refresh_token_from_cookie(request)

        if not raw_refresh_token:
            return Response(
                {
                    "success": False,
                    "message": "Refresh token is required.",
                    "errors": {"refresh": ["Refresh token is required."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            old_refresh = RefreshToken(raw_refresh_token)
        except TokenError as exc:
            response = Response(
                {
                    "success": False,
                    "message": "Invalid or expired refresh token.",
                    "errors": {"refresh": [str(exc)]},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        user_id = old_refresh.payload.get(settings.SIMPLE_JWT["USER_ID_CLAIM"])
        try:
            user = User.objects.get(**{settings.SIMPLE_JWT["USER_ID_FIELD"]: user_id})
        except User.DoesNotExist:
            response = Response(
                {
                    "success": False,
                    "message": "Invalid or expired refresh token.",
                    "errors": {"refresh": ["User not found."]},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        if not user.is_active:
            response = Response(
                {
                    "success": False,
                    "message": "Invalid or expired refresh token.",
                    "errors": {"refresh": ["User account is inactive."]},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        new_refresh = RefreshToken.for_user(user)
        new_access_token = str(new_refresh.access_token)
        new_refresh_token = str(new_refresh)

        if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS", True):
            # Blacklist the presented token AFTER successfully minting
            # its replacement, so a mid-request failure cannot leave the
            # user with neither a valid old nor new token.
            _blacklist_refresh_token_string(raw_refresh_token)

        response = Response(
            {"success": True, "message": "Token refreshed successfully.", "data": {}},
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, new_access_token, new_refresh_token)
        return response


class LogoutView(APIView):
    """
    Logout endpoint.

    POST /api/v1/auth/logout/

    Accepts no body JWT (only the HttpOnly refresh cookie, if any, is
    consulted). Blacklists that refresh token when possible. Always
    clears the access/refresh cookies on the SAME response object that
    is returned (Entry M1A-1 found a prior implementation that built a
    `response` with cookie-deletion calls, then discarded it and
    returned a different, freshly-constructed `Response` at the end —
    silently losing the cookie deletion). Idempotent: a missing,
    malformed, expired, or already-blacklisted refresh token all
    produce the identical successful envelope, never leaking which
    case occurred. Publicly reachable (no `IsAuthenticated` requirement)
    so that logging out with an already-expired/missing session is not
    itself rejected with 401/403 — logout's job is to *end* a session,
    which must succeed whether or not one currently exists.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=None,
        responses={200: EmptyDataResponseSchema, 403: ErrorResponseSchema},
        tags=["auth"],
        description="Idempotent logout. Accepts no request body JWT; "
        "reads the refresh token only from its HttpOnly cookie. "
        "Requires a valid CSRF token.",
    )
    def post(self, request):
        enforce_csrf(request)

        raw_refresh_token = get_refresh_token_from_cookie(request)
        if raw_refresh_token:
            _blacklist_refresh_token_string(raw_refresh_token)

        response = Response(
            {"success": True, "message": "Logout successful.", "data": {}},
            status=status.HTTP_200_OK,
        )
        clear_auth_cookies(response)
        return response


class MeView(APIView):
    """
    Current user profile endpoint — the authoritative session check.

    GET /api/v1/auth/me/

    Requires a valid access-token cookie (enforced by
    `CookieJWTAuthentication` + `IsAuthenticated`). Missing or invalid
    authentication returns 401 via the project's standard error
    envelope (`config.exceptions.custom_exception_handler`).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={
            200: MeResponseSchema,
            401: ErrorResponseSchema,
        },
        tags=["auth"],
    )
    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "User profile retrieved.",
                "data": {"user": _serialize_user(request.user, include_last_login=True)},
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """
    Change password endpoint.

    POST /api/v1/auth/change-password/

    Requires valid cookie authentication + CSRF. On success, blacklists
    EVERY outstanding SimpleJWT refresh token for the user (not only
    the one presented on this request — Entry M1A-1's red-phase test
    `test_change_password_blacklists_multiple_outstanding_refresh_tokens`
    exercises a second, never-presented token to prove this), clears
    the caller's own auth cookies, and requires the user to log in
    again.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordRequestSchema,
        responses={
            200: EmptyDataResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
        },
        tags=["auth"],
    )
    def post(self, request):
        current_password = request.data.get("current_password") or ""
        new_password = request.data.get("new_password") or ""
        confirm_password = request.data.get("confirm_password") or ""

        if not current_password or not new_password or not confirm_password:
            return Response(
                {
                    "success": False,
                    "message": "All fields are required.",
                    "errors": {"non_field_errors": ["All fields are required."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not request.user.check_password(current_password):
            return Response(
                {
                    "success": False,
                    "message": "Current password is incorrect.",
                    "errors": {"current_password": ["Current password is incorrect."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_password != confirm_password:
            return Response(
                {
                    "success": False,
                    "message": "Passwords do not match.",
                    "errors": {"confirm_password": ["Passwords do not match."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError

        try:
            validate_password(new_password, request.user)
        except ValidationError as exc:
            return Response(
                {
                    "success": False,
                    "message": "Password does not meet requirements.",
                    "errors": {"new_password": list(exc.messages)},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "must_change_password", "updated_at"])

        _blacklist_all_outstanding_tokens_for_user(request.user)

        response = Response(
            {"success": True, "message": "Password changed successfully.", "data": {}},
            status=status.HTTP_200_OK,
        )
        clear_auth_cookies(response)
        return response
