# apps/authentication/authentication.py
"""
Cookie-aware SimpleJWT authentication class.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification", requirement "One API authentication path"): the project
previously authenticated browser requests two ways in parallel —
`SessionAuthentication` (cookie+CSRF) and
`rest_framework_simplejwt.authentication.JWTAuthentication`
(`Authorization: Bearer <token>` header, no CSRF). M1-A removes the
bearer-header path from browser use entirely and replaces
`SessionAuthentication` with this single cookie-based JWT
authenticator, which:

1. Reads the access JWT only from its HttpOnly cookie (never from the
   `Authorization` header — cookie presence is not itself proof of
   authorization; the token inside it is still fully validated by
   SimpleJWT's normal `JWTAuthentication.get_validated_token()`/
   `get_user()` machinery, which checks signature, expiry, token type,
   and user existence/active state).
2. Manually enforces CSRF for unsafe HTTP methods, since DRF's
   `APIView.as_view()` wraps every view in `django.views.decorators.csrf.csrf_exempt`
   (confirmed via direct source inspection in Entry M1A-1) — Django's
   CSRF middleware never runs for any DRF view unless an authenticator
   explicitly calls `enforce_csrf()` itself, exactly like DRF's own
   `SessionAuthentication.enforce_csrf()` does. This authenticator
   follows that same established DRF pattern rather than inventing a
   new one.

If no access-token cookie is present, `authenticate()` returns `None`
(anonymous), matching the DRF authenticator contract used by every
other authenticator in this project — permission classes
(`IsAuthenticated`/`AllowAny`) are what actually decide whether an
anonymous request is allowed, keeping this authenticator's only
responsibility "identify the user from the cookie, if any, and enforce
CSRF for unsafe requests that did identify a user."
"""
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.authentication.cookies import get_access_token_from_cookie


def enforce_csrf(request):
    """Run Django's real CSRF check against `request` and raise
    `PermissionDenied` if it fails. This is the same mechanism DRF's
    `SessionAuthentication.enforce_csrf()` uses internally (confirmed
    via direct source inspection), reused here because no built-in
    DRF/SimpleJWT authenticator performs this check for cookie-based
    JWT auth automatically.
    """

    def dummy_get_response(
        request,
    ):  # pragma: no cover - required by CsrfViewMiddleware's constructor
        return None

    check = CSRFCheck(dummy_get_response)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied("CSRF Failed: %s" % reason)


class CookieJWTAuthentication(JWTAuthentication):
    """
    SimpleJWT authentication that reads the access token from the
    project's HttpOnly access-token cookie instead of the
    `Authorization` header, and enforces CSRF for any request method
    Django's CSRF middleware would otherwise treat as unsafe (i.e.
    everything except `GET`/`HEAD`/`OPTIONS`/`TRACE`).
    """

    def authenticate(self, request):
        raw_token = get_access_token_from_cookie(request)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        allowed_password_change_paths = {
            "/api/v1/auth/me/",
            "/api/v1/auth/change-password/",
            "/api/v1/auth/logout/",
            "/api/v1/auth/refresh/",
            "/api/v1/auth/csrf/",
        }
        if (
            getattr(user, "must_change_password", False)
            and request.path not in allowed_password_change_paths
        ):
            raise exceptions.PermissionDenied("A password change is required before continuing.")

        # A cookie's mere presence is never authorization on its own —
        # the token has already been fully validated by
        # `get_validated_token()`/`get_user()` above (signature,
        # expiry, token type, user active state). CSRF is enforced in
        # addition to that validation for unsafe methods, protecting
        # against a cross-site request that rides along on the
        # browser's automatically-attached cookies. `request` here is
        # the DRF `Request` object; passing it directly (rather than
        # unwrapping to `._request`) matches DRF's own
        # `SessionAuthentication.enforce_csrf()` call pattern exactly,
        # since DRF's `Request` proxies `.COOKIES`/`.META`/`.POST` to
        # the underlying `HttpRequest` and `CSRFCheck` only needs those.
        enforce_csrf(request)

        return user, validated_token
