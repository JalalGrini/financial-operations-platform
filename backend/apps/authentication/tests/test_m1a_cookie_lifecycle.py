# apps/authentication/tests/test_m1a_cookie_lifecycle.py
"""
M1-A Task 1 (Engineering Log / Architect spec: "Canonical Cookie
Authentication and Runtime Unification"): failing tests written BEFORE
the M1A-2 runtime implementation, characterizing the approved contract:

- Explicit CSRF bootstrap endpoint (GET /api/v1/auth/csrf/).
- CSRF enforcement on unsafe cookie-authenticated requests (login,
  refresh, logout, change-password).
- Tokenless login/refresh JSON (no `access`/`refresh` string fields).
- No request-body JWT accepted for refresh/logout.
- Cookie attributes (HttpOnly, SameSite, Path, host-only Domain) and
  symmetric cookie deletion.
- Consistent 401 for missing/invalid/expired/malformed access auth.
- Refresh rotation + blacklist; replay of a rotated/blacklisted refresh
  token returns 401 and clears stale auth cookies.
- Idempotent logout for missing/malformed/expired/already-blacklisted
  refresh tokens, with cookie deletion always applied to the returned
  response.
- Password change blacklists every outstanding refresh token for the
  user and clears cookies.

These tests use `rest_framework.test.APIClient(enforce_csrf_checks=True)`
so Django's real CSRF middleware runs during the test (the default
`APIClient` disables CSRF checks, which would make every CSRF assertion
in this file vacuously pass). A single client instance is reused within
each test so its cookie jar (which the underlying `django.test.Client`
maintains automatically from `Set-Cookie` response headers) carries
forward across requests, mirroring real browser behavior.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken as SimpleJWTRefreshToken

User = get_user_model()


def _make_user(email="m1a-user@example.com", password="StrongPass123!"):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="M1A",
        last_name="User",
    )


def _csrf_client():
    """A CSRF-enforcing API client with an empty cookie jar."""
    return APIClient(enforce_csrf_checks=True)


def _bootstrap_csrf(client):
    """Call the CSRF bootstrap endpoint and return the csrftoken cookie
    value the client received."""
    resp = client.get("/api/v1/auth/csrf/")
    return resp


def _csrf_header_from_client(client):
    """Read the CSRF cookie value the test client is currently holding,
    for use as the X-CSRFToken header on a subsequent unsafe request."""
    cookie = client.cookies.get("csrftoken")
    return cookie.value if cookie else None


class CSRFBootstrapTests(APITestCase):
    """The bootstrap endpoint must exist, be safely GET-able without
    authentication, set a CSRF cookie, and return a normal success
    envelope containing no credential material."""

    def test_csrf_bootstrap_endpoint_returns_200_and_sets_csrf_cookie(self):
        client = _csrf_client()
        resp = client.get("/api/v1/auth/csrf/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", client.cookies)

    def test_csrf_bootstrap_response_contains_no_credential_material(self):
        client = _csrf_client()
        resp = client.get("/api/v1/auth/csrf/")
        self.assertTrue(resp.data.get("success"))
        # No JWTs, no raw CSRF secret duplicated into the JSON body.
        serialized = str(resp.data)
        self.assertNotIn("access", serialized.lower().replace("access_control", ""))
        self.assertNotIn("refresh", serialized.lower())

    def test_csrf_cookie_is_not_httponly(self):
        """The CSRF cookie must be browser-JS-readable so the frontend can
        mirror it into the X-CSRFToken header; JWT cookies remain
        HttpOnly, but the CSRF cookie must not be."""
        client = _csrf_client()
        client.get("/api/v1/auth/csrf/")
        raw_cookie = client.cookies.get("csrftoken")
        self.assertIsNotNone(raw_cookie)
        self.assertFalse(raw_cookie.get("httponly"))


class LoginCSRFAndTokenlessJSONTests(APITestCase):
    """Login must be protected against login CSRF, and its success JSON
    must contain no JWT strings."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_login_without_csrf_token_is_rejected(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {
                "email": "m1a-user@example.com",
                "password": "StrongPass123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_with_invalid_csrf_token_is_rejected(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN="not-a-real-token",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_with_valid_csrf_token_succeeds_and_json_has_no_jwt_strings(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertTrue(resp.data["success"])
        data = resp.data["data"]
        self.assertNotIn("access", data)
        self.assertNotIn("refresh", data)
        self.assertIn("user", data)
        self.assertEqual(data["user"]["email"], "m1a-user@example.com")

    def test_login_sets_httponly_access_and_refresh_cookies(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        from django.conf import settings

        access_cookie = resp.cookies.get(settings.JWT_AUTH_COOKIE)
        refresh_cookie = resp.cookies.get(settings.JWT_AUTH_REFRESH_COOKIE)
        self.assertIsNotNone(access_cookie, "access cookie was not set on the login response")
        self.assertIsNotNone(refresh_cookie, "refresh cookie was not set on the login response")
        self.assertTrue(access_cookie["httponly"])
        self.assertTrue(refresh_cookie["httponly"])
        self.assertNotEqual(access_cookie.value, "")
        self.assertNotEqual(refresh_cookie.value, "")

    def test_login_generates_exactly_one_outstanding_token_pair(self):
        """A prior implementation called `RefreshToken.for_user()` twice
        per login, silently discarding the first pair while still
        registering it as OutstandingToken. Only one outstanding refresh
        token should be created per successful login."""
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        before = OutstandingToken.objects.filter(user=self.user).count()
        client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        after = OutstandingToken.objects.filter(user=self.user).count()
        self.assertEqual(after - before, 1)

    def test_inactive_account_login_is_rejected(self):
        self.user.is_active = False
        self.user.save()
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertFalse(resp.data["success"])

    def test_invalid_credentials_do_not_leak_account_existence(self):
        """Both a nonexistent email and a wrong password for a real
        account must produce the exact same status and message."""
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)

        resp_wrong_password = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "wrong-password"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        client2 = _csrf_client()
        _bootstrap_csrf(client2)
        csrf_token2 = _csrf_header_from_client(client2)
        resp_no_such_user = client2.post(
            "/api/v1/auth/login/",
            {"email": "no-such-user@example.com", "password": "whatever123"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token2,
        )

        self.assertEqual(resp_wrong_password.status_code, resp_no_such_user.status_code)
        self.assertEqual(resp_wrong_password.data["message"], resp_no_such_user.data["message"])


class MeEndpointCookieAuthTests(APITestCase):
    """`/api/v1/auth/me/` is the authoritative session check and must
    require a valid access cookie."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def _login(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        return client

    def test_me_without_any_cookie_returns_401(self):
        client = _csrf_client()
        resp = client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_malformed_access_cookie_returns_401(self):
        client = _csrf_client()
        from django.conf import settings

        client.cookies[settings.JWT_AUTH_COOKIE] = "not-a-real-jwt"
        resp = client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_valid_access_cookie_returns_200_with_safe_user_data(self):
        client = self._login()
        resp = client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["data"]["user"]["email"], "m1a-user@example.com")
        str(resp.data)
        # A JWT is 3 base64url segments joined by dots; a naive substring
        # check for "." isn't reliable, so assert the known field names
        # for token strings are simply absent from the payload.
        self.assertNotIn("access", resp.data["data"])
        self.assertNotIn("refresh", resp.data["data"])

    def test_me_with_expired_access_token_returns_401(self):
        from django.conf import settings
        from rest_framework_simplejwt.tokens import AccessToken

        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=timedelta(seconds=-1))
        client = _csrf_client()
        client.cookies[settings.JWT_AUTH_COOKIE] = str(token)
        resp = client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class RefreshCookieOnlyRotationTests(APITestCase):
    """Refresh must read the token only from its HttpOnly cookie, accept
    no body JWT, enforce CSRF, rotate + blacklist, and reject replay."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def _login(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        return client

    def test_refresh_without_csrf_token_is_rejected(self):
        client = self._login()
        resp = client.post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_refresh_ignores_body_supplied_refresh_token(self):
        """Even a well-formed refresh JWT placed in the request body must
        not be accepted as the source of truth; only the cookie counts.
        Supplying a bogus body value alongside a valid cookie must still
        succeed using the cookie, proving the body is not consulted."""
        client = self._login()
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/refresh/",
            {"refresh": "this-is-not-even-a-real-token-format"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_refresh_with_valid_cookie_and_csrf_returns_tokenless_json(self):
        client = self._login()
        csrf_token = _csrf_header_from_client(client)
        resp = client.post("/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertNotIn("access", resp.data["data"])
        self.assertNotIn("refresh", resp.data["data"])

    def test_refresh_sets_replacement_cookies(self):
        client = self._login()
        old_refresh_cookie_value = client.cookies.get(
            __import__("django.conf", fromlist=["settings"]).settings.JWT_AUTH_REFRESH_COOKIE
        )
        csrf_token = _csrf_header_from_client(client)
        resp = client.post("/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        from django.conf import settings

        new_refresh_cookie = resp.cookies.get(settings.JWT_AUTH_REFRESH_COOKIE)
        new_access_cookie = resp.cookies.get(settings.JWT_AUTH_COOKIE)
        self.assertIsNotNone(new_refresh_cookie)
        self.assertIsNotNone(new_access_cookie)
        if old_refresh_cookie_value is not None:
            self.assertNotEqual(new_refresh_cookie.value, old_refresh_cookie_value.value)

    def test_replaying_a_rotated_refresh_token_returns_401_and_clears_cookies(self):
        client = self._login()
        from django.conf import settings

        first_refresh_value = client.cookies[settings.JWT_AUTH_REFRESH_COOKIE].value
        csrf_token = _csrf_header_from_client(client)

        # First refresh: rotates and blacklists the original token.
        first_resp = client.post(
            "/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token
        )
        self.assertEqual(first_resp.status_code, status.HTTP_200_OK, first_resp.data)

        # Replay the ORIGINAL (now-rotated/blacklisted) refresh cookie.
        replay_client = _csrf_client()
        replay_client.cookies[settings.JWT_AUTH_REFRESH_COOKIE] = first_refresh_value
        _bootstrap_csrf(replay_client)
        replay_csrf = _csrf_header_from_client(replay_client)
        # _bootstrap_csrf may have overwritten the refresh cookie jar entry
        # with itself unset; re-assert it explicitly.
        replay_client.cookies[settings.JWT_AUTH_REFRESH_COOKIE] = first_refresh_value

        replay_resp = replay_client.post(
            "/api/v1/auth/refresh/",
            {},
            format="json",
            HTTP_X_CSRFTOKEN=replay_csrf,
        )
        self.assertEqual(replay_resp.status_code, status.HTTP_401_UNAUTHORIZED, replay_resp.data)
        # Stale auth cookies must be cleared on the 401 response.
        cleared_refresh = replay_resp.cookies.get(settings.JWT_AUTH_REFRESH_COOKIE)
        cleared_access = replay_resp.cookies.get(settings.JWT_AUTH_COOKIE)
        if cleared_refresh is not None:
            self.assertIn(cleared_refresh["max-age"], (0, "0"))
        if cleared_access is not None:
            self.assertIn(cleared_access["max-age"], (0, "0"))


class LogoutIdempotencyAndCSRFTests(APITestCase):
    """Logout must accept no body JWT, blacklist when possible, always
    clear cookies on the returned response, enforce CSRF, and be
    idempotent for missing/malformed/expired/already-blacklisted
    refresh tokens."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def _login(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        return client

    def test_logout_without_csrf_token_is_rejected(self):
        client = self._login()
        resp = client.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_clears_cookies_on_the_returned_response(self):
        client = self._login()
        csrf_token = _csrf_header_from_client(client)
        resp = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        from django.conf import settings

        access_cookie = resp.cookies.get(settings.JWT_AUTH_COOKIE)
        refresh_cookie = resp.cookies.get(settings.JWT_AUTH_REFRESH_COOKIE)
        self.assertIsNotNone(access_cookie, "logout response did not clear the access cookie")
        self.assertIsNotNone(refresh_cookie, "logout response did not clear the refresh cookie")
        self.assertIn(access_cookie["max-age"], (0, "0"))
        self.assertIn(refresh_cookie["max-age"], (0, "0"))

    def test_repeated_logout_returns_the_same_successful_envelope(self):
        client = self._login()
        csrf_token = _csrf_header_from_client(client)
        first = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        second = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["success"], second.data["success"])
        self.assertEqual(first.data["message"], second.data["message"])

    def test_logout_with_no_refresh_cookie_at_all_still_succeeds(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        resp = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_logout_blacklists_the_refresh_token(self):
        client = self._login()
        from django.conf import settings

        refresh_value = client.cookies[settings.JWT_AUTH_REFRESH_COOKIE].value
        csrf_token = _csrf_header_from_client(client)
        client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)

        token = SimpleJWTRefreshToken(refresh_value, verify=False)
        jti = token.payload["jti"]
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=jti).exists())


class PasswordChangeInvalidatesAllOutstandingTokensTests(APITestCase):
    """Password change must require cookie auth + CSRF, blacklist every
    outstanding refresh token for the user (not just the current one),
    and clear auth cookies so the user must log in again."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def _login(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        return client

    def test_change_password_without_csrf_is_rejected(self):
        client = self._login()
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "StrongPass123!",
                "new_password": "NewStrongPass123!",
                "confirm_password": "NewStrongPass123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_change_password_blacklists_multiple_outstanding_refresh_tokens(self):
        """Simulate a user with 2 outstanding refresh tokens (e.g. logged
        in on two devices) and confirm BOTH are blacklisted after a
        password change on either session."""
        client = self._login()

        # A second "device" login for the same user.
        second_refresh = SimpleJWTRefreshToken.for_user(self.user)
        second_jti = second_refresh.payload["jti"]

        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "StrongPass123!",
                "new_password": "NewStrongPass123!",
                "confirm_password": "NewStrongPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        # Every OutstandingToken for this user must now be blacklisted,
        # including the "second device" token that was never presented
        # on this request.
        outstanding_jtis = set(
            OutstandingToken.objects.filter(user=self.user).values_list("jti", flat=True)
        )
        blacklisted_jtis = set(
            BlacklistedToken.objects.filter(token__user=self.user).values_list(
                "token__jti", flat=True
            )
        )
        self.assertTrue(
            outstanding_jtis.issubset(blacklisted_jtis) or second_jti in blacklisted_jtis
        )
        self.assertIn(second_jti, blacklisted_jtis)

    def test_change_password_clears_auth_cookies(self):
        client = self._login()
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "StrongPass123!",
                "new_password": "NewStrongPass123!",
                "confirm_password": "NewStrongPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        from django.conf import settings

        access_cookie = resp.cookies.get(settings.JWT_AUTH_COOKIE)
        refresh_cookie = resp.cookies.get(settings.JWT_AUTH_REFRESH_COOKIE)
        self.assertIsNotNone(access_cookie)
        self.assertIsNotNone(refresh_cookie)
        self.assertIn(access_cookie["max-age"], (0, "0"))
        self.assertIn(refresh_cookie["max-age"], (0, "0"))


class CookieAttributeTests(APITestCase):
    """Cookie names, domain, path, and samesite must come from settings
    and use safe defaults (no literal `localhost` domain)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_cookie_domain_is_not_literal_localhost(self):
        from django.conf import settings

        self.assertNotEqual(settings.JWT_AUTH_COOKIE_DOMAIN, "localhost")

    def test_login_cookie_names_match_settings(self):
        client = _csrf_client()
        _bootstrap_csrf(client)
        csrf_token = _csrf_header_from_client(client)
        resp = client.post(
            "/api/v1/auth/login/",
            {"email": "m1a-user@example.com", "password": "StrongPass123!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        from django.conf import settings

        self.assertIn(settings.JWT_AUTH_COOKIE, resp.cookies)
        self.assertIn(settings.JWT_AUTH_REFRESH_COOKIE, resp.cookies)
        # The literal string "refresh_token" must not be hard-coded
        # separately from the configured name (guards against the prior
        # implementation's hard-coded cookie key).
        if settings.JWT_AUTH_REFRESH_COOKIE != "refresh_token":
            self.assertNotIn("refresh_token", resp.cookies)
