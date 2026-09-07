# apps/authentication/schema.py
"""
Schema-only serializers for Authentication OpenAPI metadata.

M0-R Task 3 (see EFOP Engineering Log finding AR-03 / M-10 and the M0-R
task breakdown "Add accurate Authentication OpenAPI metadata without
changing behavior"): the five Authentication APIViews (`LoginView`,
`RefreshView`, `LogoutView`, `MeView`, `ChangePasswordView`) read directly
from `request.data`/`request.COOKIES` with no `serializer_class`, so
drf-spectacular could not introspect their request or response bodies.

These serializers exist ONLY to describe the existing, already-implemented
request and response shapes to drf-spectacular via `@extend_schema`. They
are not used for validation and do not change any endpoint's runtime
behavior:

- Views continue to read `request.data.get(...)` exactly as before.
- No view method body is modified in this task, only decorated.
- Authentication runtime behavior (tokens, cookies, sessions,
  failed-login tracking, `AuthenticationService`) is explicitly out of
  scope for M0-R and is untouched here.

Field shapes below were characterized directly from the current view
implementations in `apps/authentication/views.py`.
"""
from rest_framework import serializers


class UserDataSchema(serializers.Serializer):
    """Shape of the `user` object embedded in Login/Me responses.

    `MeView` additionally includes `last_login`; `LoginView` does not.
    Both are declared here as optional so this single schema accurately
    describes either response without overstating either endpoint.
    """

    id = serializers.CharField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    full_name = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    is_active = serializers.BooleanField(required=False)
    date_joined = serializers.CharField(required=False, allow_null=True)
    last_login = serializers.CharField(required=False, allow_null=True)
    roles = serializers.ListField(child=serializers.CharField())
    permissions = serializers.ListField(child=serializers.CharField())


class ErrorResponseSchema(serializers.Serializer):
    """Shape of every error response, produced directly by the views
    (not by `config.exceptions.custom_exception_handler`, since these
    views return `Response(...)` explicitly rather than raising).

    `errors` is declared as an unconstrained, nullable top-level
    `JSONField(allow_null=True)` (M0-R3 Task 2 / Engineering Log finding
    M0R2-B1; nullability added in M0-R4 Task 1 / Engineering Log finding
    M0R3-C5). A prior version of this field used
    `DictField(child=JSONField())`, which allows arbitrary *values*
    inside the dict but still requires `errors` itself to be a JSON
    object at the top level. That is narrower than the actual global
    exception envelope this schema is meant to describe generally:
    elsewhere in the project, `config.exceptions.custom_exception_handler`
    can also produce a bare list (e.g. non-field validation errors
    returned as a plain array), a bare string/`detail` value, or (for
    exceptions with no structured detail at all) `None`, depending on
    the underlying DRF exception — none of which is a JSON object and
    none of which `DictField` can validate or describe. A plain
    `JSONField(allow_null=True)` accepts any JSON-serializable value
    (object, array, string, number, boolean, or null) and renders in the
    generated OpenAPI 3.0 schema as an unconstrained schema (no `type`,
    `properties`, or `additionalProperties` restriction) with
    `nullable: true`, accurately describing every shape the 5
    Authentication views themselves construct (always a dict of lists
    of strings today) as well as every other shape — including a
    genuinely absent/null value — the shared exception envelope can
    produce for other apps reusing this schema-only pattern in the
    future. A prior version of this field used a bare `JSONField()`
    (without `allow_null=True`): its docstring already claimed null was
    an accepted value, but the field itself rejected `None` and no test
    exercised the claim (Engineering Log finding M0R3-C5) — this was a
    documentation/implementation mismatch, not a behavior change, since
    none of the 5 views' current code paths ever assign `None` to
    `errors`.
    """

    success = serializers.BooleanField(default=False)
    message = serializers.CharField()
    errors = serializers.JSONField(allow_null=True)


# --- CSRF bootstrap -----------------------------------------------------


class CSRFResponseSchema(serializers.Serializer):
    """Response shape for `GET /api/v1/auth/csrf/`. Contains no
    credential material; its purpose is purely to trigger Django's
    CSRF middleware into setting the (non-HttpOnly, browser-readable)
    CSRF cookie on the client. See `CSRFView.get()`."""

    success = serializers.BooleanField(default=True)
    message = serializers.CharField()
    data = serializers.DictField(default=dict)


# --- Login -------------------------------------------------------------


class LoginRequestSchema(serializers.Serializer):
    """Request body read by `LoginView.post()`."""

    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )


class LoginResponseDataSchema(serializers.Serializer):
    """M1-A (Engineering Log: "Canonical Cookie Authentication and
    Runtime Unification"): login no longer returns `access`/`refresh`
    JWT strings in the JSON body — both tokens are set exclusively as
    HttpOnly cookies. Only safe user data is returned."""

    user = UserDataSchema()


class LoginResponseSchema(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    message = serializers.CharField()
    data = LoginResponseDataSchema()


# --- Refresh -------------------------------------------------------------


class RefreshResponseDataSchema(serializers.Serializer):
    """M1-A: refresh no longer returns `access`/`refresh` JWT strings in
    the JSON body — both replacement tokens are set exclusively as
    HttpOnly cookies. The response body carries no token material."""

    pass


class RefreshResponseSchema(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    message = serializers.CharField()
    data = RefreshResponseDataSchema()


# --- Logout -------------------------------------------------------------


class EmptyDataResponseSchema(serializers.Serializer):
    """Shape of a success response whose `data` payload is always `{}`."""

    success = serializers.BooleanField(default=True)
    message = serializers.CharField()
    data = serializers.DictField(default=dict)


# --- Me -------------------------------------------------------------


class MeResponseDataSchema(serializers.Serializer):
    user = UserDataSchema()


class MeResponseSchema(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    message = serializers.CharField()
    data = MeResponseDataSchema()


# --- Change Password -------------------------------------------------------------


class ChangePasswordRequestSchema(serializers.Serializer):
    """Request body read by `ChangePasswordView.post()`."""

    current_password = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )
    new_password = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )
    confirm_password = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )
