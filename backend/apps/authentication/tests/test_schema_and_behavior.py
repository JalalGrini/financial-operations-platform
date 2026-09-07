# apps/authentication/tests/test_schema_and_behavior.py
"""
M0-R Task 3 / M1-A: Authentication OpenAPI metadata and runtime
behavior characterization.

This module has two responsibilities:

1. Characterize the CURRENT runtime behavior of the five original
   Authentication endpoints plus the M1-A CSRF bootstrap endpoint
   exactly as they exist today, so future milestones can prove they
   have or have not changed that behavior.

2. Prove that drf-spectacular can discover an operation for each
   endpoint (closing part of Engineering Log finding AR-03 / M-10).

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification") replaced the prior token-in-JSON-body/bearer-header/
session-cookie behavior these tests originally characterized with a
single HttpOnly-cookie + CSRF lifecycle. The tests below were updated
in M1-A to characterize the NEW approved behavior (tokenless JSON,
cookie-only refresh, CSRF-enforced unsafe requests, 401 for missing/
invalid cookie auth) rather than the pre-M1-A behavior they previously
asserted. See `test_m1a_cookie_lifecycle.py` for the full red-phase
characterization written before this rewrite.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from drf_spectacular.generators import EndpointEnumerator, SchemaGenerator
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


def _make_user(email="m0r-auth-user@example.com", password="StrongPass123!"):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Auth",
        last_name="User",
    )


def _csrf_client():
    """A CSRF-enforcing API client with an empty cookie jar, matching
    real browser behavior (the default `APIClient()` disables CSRF
    checks entirely, which would make every M1-A CSRF assertion in this
    module vacuously pass)."""
    return APIClient(enforce_csrf_checks=True)


def _bootstrap_and_get_csrf_token(client):
    client.get("/api/v1/auth/csrf/")
    cookie = client.cookies.get("csrftoken")
    return cookie.value if cookie else None


def _login(client, email="m0r-auth-user@example.com", password="StrongPass123!"):
    csrf_token = _bootstrap_and_get_csrf_token(client)
    return client.post(
        "/api/v1/auth/login/",
        {"email": email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )


class LoginBehaviorCharacterizationTests(APITestCase):
    """Characterizes LoginView.post() exactly as implemented (M1-A: cookie
    + CSRF, tokenless JSON)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_successful_login_returns_envelope_with_no_tokens_and_safe_user_data(self):
        client = _csrf_client()
        resp = _login(client)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.assertNotIn("access", resp.data["data"])
        self.assertNotIn("refresh", resp.data["data"])
        self.assertEqual(resp.data["data"]["user"]["email"], "m0r-auth-user@example.com")

    def test_missing_credentials_returns_400(self):
        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post("/api/v1/auth/login/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(resp.data["success"])

    def test_invalid_credentials_returns_401(self):
        client = _csrf_client()
        resp = _login(client, password="wrong-password")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(resp.data["success"])

    def test_inactive_account_returns_401(self):
        """
        Characterization note: `LoginView` contains an explicit
        `if not user.is_active: return 403` branch, but Django's
        `ModelBackend.authenticate()` already filters out inactive users
        via `user_can_authenticate()` and returns None before that branch
        can ever run. `authenticate()` returning None is indistinguishable
        from a wrong password, so the actual observed status for an
        inactive account is 401 ("Invalid credentials"), not 403. The
        403 branch is unreachable dead code under the current
        authentication backend configuration, retained and documented
        (unchanged by M1-A) rather than removed.
        """
        self.user.is_active = False
        self.user.save()
        client = _csrf_client()
        resp = _login(client)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_without_csrf_token_returns_403(self):
        """M1-A: login is now protected against login-CSRF; a request
        with no CSRF token at all is rejected before credentials are
        even checked."""
        client = _csrf_client()
        _bootstrap_and_get_csrf_token(client)  # sets the cookie but we don't send the header
        resp = client.post(
            "/api/v1/auth/login/",
            {
                "email": "m0r-auth-user@example.com",
                "password": "StrongPass123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class RefreshBehaviorCharacterizationTests(APITestCase):
    """Characterizes RefreshView.post() exactly as implemented (M1-A:
    cookie-only source, CSRF-enforced, tokenless JSON)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_missing_refresh_cookie_returns_400(self):
        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post("/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(resp.data["success"])

    def test_invalid_refresh_cookie_returns_401(self):
        from django.conf import settings

        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        client.cookies[settings.JWT_AUTH_REFRESH_COOKIE] = "not-a-real-token"
        resp = client.post("/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(resp.data["success"])

    def test_valid_refresh_cookie_returns_tokenless_200(self):
        client = _csrf_client()
        _login(client)
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post("/api/v1/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.assertNotIn("access", resp.data["data"])
        self.assertNotIn("refresh", resp.data["data"])

    def test_refresh_without_csrf_token_returns_403(self):
        client = _csrf_client()
        _login(client)
        resp = client.post("/api/v1/auth/refresh/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class LogoutBehaviorCharacterizationTests(APITestCase):
    """Characterizes LogoutView.post() exactly as implemented (M1-A:
    publicly reachable/idempotent, CSRF-enforced, cookie-only)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_logout_without_refresh_cookie_still_succeeds(self):
        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.assertEqual(resp.data["data"], {})

    def test_logout_does_not_require_prior_authentication(self):
        """M1-A characterization: logout no longer requires
        `IsAuthenticated`. An anonymous request (no cookies at all,
        just a valid CSRF token) still succeeds with the idempotent
        200 envelope, rather than being rejected with 401/403 for lack
        of authentication."""
        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_logout_without_csrf_token_returns_403(self):
        client = _csrf_client()
        resp = client.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class MeBehaviorCharacterizationTests(APITestCase):
    """Characterizes MeView.get() exactly as implemented (M1-A: cookie
    auth, 401 for missing/invalid auth rather than 403)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def test_me_returns_current_user_profile(self):
        client = _csrf_client()
        _login(client)
        resp = client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.assertEqual(resp.data["data"]["user"]["email"], "m0r-auth-user@example.com")
        self.assertIn("last_login", resp.data["data"]["user"])

    def test_me_requires_authentication(self):
        """M1-A characterization: `CookieJWTAuthentication` returns
        `None` for an anonymous request (no access cookie), and DRF's
        `IsAuthenticated` permission then raises `NotAuthenticated`
        (401), not `PermissionDenied` (403) — unlike the pre-M1-A
        `SessionAuthentication`-first configuration, which returned 403
        for a fully anonymous request with zero authenticators
        attempted."""
        anon_client = _csrf_client()
        resp = anon_client.get("/api/v1/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordBehaviorCharacterizationTests(APITestCase):
    """Characterizes ChangePasswordView.post() exactly as implemented
    (M1-A: cookie auth + CSRF, blacklists all outstanding tokens)."""

    def setUp(self):
        cache.clear()
        self.user = _make_user()

    def _login_and_get_csrf(self):
        client = _csrf_client()
        _login(client)
        csrf_token = _bootstrap_and_get_csrf_token(client)
        return client, csrf_token

    def test_missing_fields_returns_400(self):
        client, csrf_token = self._login_and_get_csrf()
        resp = client.post(
            "/api/v1/auth/change-password/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_token
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(resp.data["success"])

    def test_incorrect_current_password_returns_400(self):
        client, csrf_token = self._login_and_get_csrf()
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "wrong",
                "new_password": "NewStrongPass123!",
                "confirm_password": "NewStrongPass123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", resp.data["errors"])

    def test_mismatched_new_passwords_returns_400(self):
        client, csrf_token = self._login_and_get_csrf()
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "StrongPass123!",
                "new_password": "NewStrongPass123!",
                "confirm_password": "Mismatch123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", resp.data["errors"])

    def test_successful_password_change(self):
        client, csrf_token = self._login_and_get_csrf()
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
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["success"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPass123!"))

    def test_change_password_without_authentication_returns_401(self):
        client = _csrf_client()
        csrf_token = _bootstrap_and_get_csrf_token(client)
        resp = client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "x",
                "new_password": "y",
                "confirm_password": "y",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AuthenticationSchemaDiscoveryTests(APITestCase):
    """
    Proves each of the five Authentication endpoints now produces a
    discoverable OpenAPI operation (closing AR-03/M-10 for Authentication).
    """

    def test_all_five_authentication_operations_are_schema_traversable(self):
        generator = SchemaGenerator()
        enumerator = EndpointEnumerator()
        all_endpoints = enumerator.get_api_endpoints()

        auth_endpoints = [
            (path, path_regex, method, callback)
            for path, path_regex, method, callback in all_endpoints
            if path.startswith("/api/v1/auth/")
        ]

        expected_paths = {
            "/api/v1/auth/csrf/",
            "/api/v1/auth/login/",
            "/api/v1/auth/refresh/",
            "/api/v1/auth/logout/",
            "/api/v1/auth/me/",
            "/api/v1/auth/change-password/",
        }
        discovered_paths = {path for path, _, _, _ in auth_endpoints}
        self.assertTrue(expected_paths.issubset(discovered_paths), discovered_paths)

        # M1-A: refresh and logout intentionally declare `request=None`
        # (Engineering Log requirement: "Refresh and logout request
        # bodies must not accept JWT strings" — the cleanest way to
        # document that is to declare no request body schema at all,
        # since both endpoints now read their only input, the refresh
        # JWT, exclusively from an HttpOnly cookie DRF/OpenAPI has no
        # standard way to describe as a "request body").
        paths_with_no_request_body_by_design = {
            "/api/v1/auth/refresh/",
            "/api/v1/auth/logout/",
        }

        registry = generator.registry
        for path, path_regex, method, callback in auth_endpoints:
            view = generator.create_view(callback, method, None)
            operation = view.schema.get_operation(path, path_regex, "/api/v1/", method, registry)
            self.assertIsNotNone(operation, f"No operation generated for {method} {path}")
            self.assertIn("responses", operation, f"No response schema for {method} {path}")
            self.assertIn(
                "200", operation["responses"], f"No 200 response schema for {method} {path}"
            )
            if method == "POST" and path not in paths_with_no_request_body_by_design:
                self.assertIn(
                    "requestBody", operation, f"No requestBody schema for {method} {path}"
                )


def _get_operation_for_path(path_suffix, method):
    """Helper: generate the OpenAPI operation for a single Authentication path."""
    generator = SchemaGenerator()
    enumerator = EndpointEnumerator()
    all_endpoints = enumerator.get_api_endpoints()
    target_path = f"/api/v1/auth/{path_suffix}"
    for path, path_regex, op_method, callback in all_endpoints:
        if path == target_path and op_method == method:
            view = generator.create_view(callback, op_method, None)
            return view.schema.get_operation(
                path, path_regex, "/api/v1/", op_method, generator.registry
            )
    raise AssertionError(f"No endpoint found for {method} {target_path}")


class AuthenticationOperationStatusFidelityTests(APITestCase):
    """
    M0-R2 Task 2 (Engineering Log finding M0R-A2): every Authentication
    operation's generated OpenAPI schema must document its actual
    characterized success and error statuses, not only 200.
    """

    def test_csrf_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("csrf/", "GET")
        self.assertEqual(set(operation["responses"].keys()), {"200"})

    def test_login_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("login/", "POST")
        self.assertEqual(set(operation["responses"].keys()), {"200", "400", "401", "403"})

    def test_refresh_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("refresh/", "POST")
        self.assertEqual(set(operation["responses"].keys()), {"200", "400", "401", "403"})

    def test_logout_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("logout/", "POST")
        self.assertEqual(set(operation["responses"].keys()), {"200", "403"})

    def test_me_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("me/", "GET")
        self.assertEqual(set(operation["responses"].keys()), {"200", "401"})

    def test_change_password_operation_documents_all_characterized_statuses(self):
        operation = _get_operation_for_path("change-password/", "POST")
        self.assertEqual(set(operation["responses"].keys()), {"200", "400", "401", "403"})


class ErrorResponseSchemaFlexibleJSONTests(APITestCase):
    """
    M0-R3 Task 2 (Engineering Log finding M0R2-B1): `ErrorResponseSchema
    .errors` must be a top-level schema-only `JSONField`, not a
    `DictField` (even a `DictField(child=JSONField())`, which still
    requires the top-level value to be a JSON *object*). The real global
    exception envelope can also produce a bare list (e.g. non-field
    validation errors as a plain array) or a bare string/`detail` value
    depending on the underlying DRF exception, so the schema-only field
    must accept those top-level shapes too.
    """

    def test_object_errors_value_is_accepted(self):
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": {"non_field_errors": ["Invalid credentials."]},
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_list_errors_value_is_accepted(self):
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": ["Invalid credentials.", "Account locked."],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_string_errors_value_is_accepted(self):
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": "Invalid credentials.",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_detail_shaped_object_errors_value_is_accepted(self):
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": {"detail": "Authentication credentials were not provided."},
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_number_errors_value_is_accepted(self):
        """M0-R4 Task 1 (Engineering Log finding M0R3-C4/C5): the JSON
        scalar category matrix must cover number, not only object/list/
        string, since a JSONField that silently rejects numbers would
        still incorrectly claim to be "unconstrained"."""
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": 42,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_boolean_errors_value_is_accepted(self):
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": False,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_null_errors_value_is_accepted(self):
        """M0-R4 Task 1 (Engineering Log finding M0R3-C5): the schema-only
        `ErrorResponseSchema.errors` docstring already claimed null was an
        accepted value, but the field was declared as a plain `JSONField()`
        without `allow_null=True` and no test exercised this claim. This
        test proves the claim is now actually true."""
        from apps.authentication.schema import ErrorResponseSchema

        serializer = ErrorResponseSchema(
            data={
                "success": False,
                "message": "x",
                "errors": None,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


def _resolve_ref(schema_dict, components):
    """Resolve a `{"$ref": "#/components/schemas/X"}` reference against
    the full generated schema's `components.schemas` map, returning the
    referenced component schema dict."""
    if "$ref" not in schema_dict:
        return schema_dict
    ref = schema_dict["$ref"]
    assert ref.startswith("#/components/schemas/"), ref
    name = ref.rsplit("/", 1)[-1]
    return components["schemas"][name]


def _get_operation_and_components(path_suffix, method):
    """Like `_get_operation_for_path`, but also returns the full
    generated schema's `components` map so response `$ref`s can be
    resolved to their actual component schema."""
    generator = SchemaGenerator()
    enumerator = EndpointEnumerator()
    all_endpoints = enumerator.get_api_endpoints()
    target_path = f"/api/v1/auth/{path_suffix}"
    full_schema = generator.get_schema(request=None, public=True)
    for path, path_regex, op_method, callback in all_endpoints:
        if path == target_path and op_method == method:
            view = generator.create_view(callback, op_method, None)
            operation = view.schema.get_operation(
                path, path_regex, "/api/v1/", op_method, generator.registry
            )
            return operation, full_schema["components"]
    raise AssertionError(f"No endpoint found for {method} {target_path}")


def _get_raw_ref_target(schema_dict):
    """
    Return the exact `$ref` string target from a raw (unresolved)
    response schema dict, unwrapping at most one `allOf` layer
    (drf-spectacular's `safe_ref` pattern). Returns `None` if no `$ref`
    is present at either level.

    This is deliberately distinct from `_resolve_ref`: it inspects the
    raw reference string itself (e.g.
    `"#/components/schemas/ErrorResponseSchema"`) rather than resolving
    it to a component and checking that component's *properties*. A
    test that only checks properties (as M0-R3's did) would pass even
    if a *different* component happened to also declare `success`,
    `message`, and `errors` fields; asserting the raw `$ref` string
    proves the specific named component is the one actually referenced
    (Engineering Log finding M0R3-C3).
    """
    if "$ref" in schema_dict:
        return schema_dict["$ref"]
    if "allOf" in schema_dict:
        all_of = schema_dict["allOf"]
        assert len(all_of) == 1, f"Expected a single-entry allOf wrapper, got: {all_of}"
        if "$ref" in all_of[0]:
            return all_of[0]["$ref"]
    return None


class AuthenticationErrorResponseComponentTests(APITestCase):
    """
    M0-R3 Task 2 (Engineering Log finding M0R2-B2), strengthened in
    M0-R4 (Engineering Log finding M0R3-C3): prove every non-200
    Authentication response's *raw* schema reference targets exactly
    `#/components/schemas/ErrorResponseSchema` — not merely that
    resolving whatever component the reference happens to point to
    yields an object with the right property names.
    """

    ENDPOINTS_AND_ERROR_STATUSES = [
        ("login/", "POST", ["400", "401", "403"]),
        ("refresh/", "POST", ["400", "401", "403"]),
        ("logout/", "POST", ["403"]),
        ("me/", "GET", ["401"]),
        ("change-password/", "POST", ["400", "401", "403"]),
    ]

    EXPECTED_REF = "#/components/schemas/ErrorResponseSchema"

    def test_every_non_200_response_raw_ref_targets_error_response_schema(self):
        for path_suffix, method, error_statuses in self.ENDPOINTS_AND_ERROR_STATUSES:
            operation, components = _get_operation_and_components(path_suffix, method)
            for error_status in error_statuses:
                with self.subTest(path=path_suffix, method=method, status=error_status):
                    response_entry = operation["responses"][error_status]
                    content = response_entry.get("content", {})
                    self.assertIn(
                        "application/json",
                        content,
                        f"{method} {path_suffix} {error_status} has no application/json content",
                    )
                    schema_ref = content["application/json"]["schema"]
                    raw_target = _get_raw_ref_target(schema_ref)
                    self.assertEqual(
                        raw_target,
                        self.EXPECTED_REF,
                        f"{method} {path_suffix} {error_status}: raw reference target "
                        f"was {raw_target!r}, expected {self.EXPECTED_REF!r}. Full schema: {schema_ref}",
                    )

    def test_every_non_200_response_resolves_to_error_response_schema(self):
        """Retained secondary shape check from M0-R3 (Engineering Log
        instruction: 'Retain existing shape assertions as secondary
        checks'), now redundant with but not replaced by the exact
        component-identity test above."""
        for path_suffix, method, error_statuses in self.ENDPOINTS_AND_ERROR_STATUSES:
            operation, components = _get_operation_and_components(path_suffix, method)
            for error_status in error_statuses:
                with self.subTest(path=path_suffix, method=method, status=error_status):
                    response_entry = operation["responses"][error_status]
                    content = response_entry.get("content", {})
                    schema_ref = content["application/json"]["schema"]
                    resolved = _resolve_ref(schema_ref, components)
                    if "allOf" in resolved and "$ref" in resolved.get("allOf", [{}])[0]:
                        resolved = _resolve_ref(resolved["allOf"][0], components)
                    properties = resolved.get("properties", {})
                    self.assertIn("success", properties, resolved)
                    self.assertIn("message", properties, resolved)
                    self.assertIn("errors", properties, resolved)

    def test_error_response_schema_errors_field_has_no_type_properties_or_additional_properties(
        self,
    ):
        """M0-R4 strengthening of the M0-R3 test (Engineering Log finding
        M0R3-C4): `type != "object"` also passes for an incorrect
        `type: "string"` or `type: "array"` schema, which would be just
        as wrong as the original `DictField`-typed schema. This test
        instead asserts the field has none of the three
        restriction-indicating keys at all, which is what
        drf-spectacular actually emits for a bare `JSONField()`."""
        _, components = _get_operation_and_components("login/", "POST")
        error_schema = components["schemas"].get("ErrorResponseSchema")
        self.assertIsNotNone(
            error_schema,
            f"Expected an 'ErrorResponseSchema' component; found: {sorted(components['schemas'].keys())}",
        )
        errors_field_schema = error_schema["properties"]["errors"]
        for restrictive_key in ("type", "properties", "additionalProperties"):
            self.assertNotIn(
                restrictive_key,
                errors_field_schema,
                f"'errors' field schema still has a restrictive '{restrictive_key}' key: {errors_field_schema}",
            )

    def test_error_response_schema_errors_field_documents_nullability(self):
        """M0-R4 Task 1 (Engineering Log finding M0R3-C5): with
        `JSONField(allow_null=True)`, drf-spectacular's OpenAPI 3.0
        representation for a nullable field with no other type
        restriction is `nullable: true` (OpenAPI 3.0 has no native
        `type: ["X", "null"]` union syntax; `nullable` is the
        3.0-specific mechanism). Assert this is actually present,
        proving the docstring's null claim is backed by the generated
        contract, not just written for humans."""
        _, components = _get_operation_and_components("login/", "POST")
        error_schema = components["schemas"]["ErrorResponseSchema"]
        errors_field_schema = error_schema["properties"]["errors"]
        self.assertTrue(
            errors_field_schema.get("nullable") is True,
            f"'errors' field schema does not document nullability: {errors_field_schema}",
        )
