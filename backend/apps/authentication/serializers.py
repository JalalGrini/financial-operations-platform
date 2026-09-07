# apps/authentication/serializers.py
"""
Authentication Serializers.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification", Entry M1A-3, backend cleanup): this module previously
defined `LoginSerializer` and `LoginResponseSerializer` TWICE each (the
second definition of each silently shadowed the first - dead code
duplication). It also defined `RefreshSerializer`/`RefreshResponseSerializer`/
`LogoutSerializer`/`LogoutResponseSerializer` that accepted a refresh
token via request body (`refresh` field), which conflicts with the M1-A
requirement that refresh/logout be cookie-only and never accept a JWT in
the request body.

A full-repository grep during Entry M1A-1 (re-confirmed during M1A-3)
found ZERO import or call sites for anything in this module anywhere
else in the codebase - `apps/authentication/views.py` is fully
self-contained and does not use any of these serializers. Per the same
non-destructive-retention posture applied in `services.py`, this file
is kept (deduplicated) rather than deleted, but the body-token serializers
have been corrected to reflect the cookie-only contract so that if they
are ever wired up later, they do not reintroduce a body-token acceptance
path. Nothing in this file is imported or used by any routed view as of
M1-A.
"""
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    """
    Serializer for login endpoint.

    Validates email and password credentials.
    """

    email = serializers.EmailField(
        required=True,
        help_text=_("User's email address"),
    )
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        help_text=_("User's password"),
    )
    remember_me = serializers.BooleanField(
        required=False,
        default=False,
        help_text=_("Extend session lifetime"),
    )

    def validate(self, attrs):
        """Validate login credentials."""
        email = attrs.get("email", "")
        password = attrs.get("password", "")

        if not email:
            raise serializers.ValidationError({"email": _("Email is required.")})

        if not password:
            raise serializers.ValidationError({"password": _("Password is required.")})

        attrs["email"] = email.lower().strip()
        return attrs


class LoginResponseSerializer(serializers.Serializer):
    """
    Serializer for login response.

    Tokenless: does NOT include `access`/`refresh` fields. Under M1-A,
    JWTs travel exclusively as HttpOnly cookies set on the response, not
    as JSON body fields.
    """

    user = serializers.SerializerMethodField()

    def get_user(self, obj):
        """Return safe user data."""
        user = self.context.get("user")
        if user:
            return {
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.get_full_name(),
                "is_staff": user.is_staff,
                "is_active": user.is_active,
            }
        return None


class RefreshResponseSerializer(serializers.Serializer):
    """
    Serializer for refresh response.

    Tokenless: does NOT include `access`/`refresh` fields (cookie-only,
    per M1-A).
    """

    success = serializers.BooleanField(read_only=True)


class LogoutResponseSerializer(serializers.Serializer):
    """Serializer for logout response."""

    success = serializers.BooleanField(read_only=True)
    message = serializers.CharField(read_only=True)


class MeSerializer(serializers.ModelSerializer):
    """Serializer for current user profile."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    permissions = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()

    class Meta:
        model = None  # Will be set dynamically
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "permissions",
            "roles",
        ]
        read_only_fields = [
            "id",
            "email",
            "date_joined",
            "last_login",
            "permissions",
            "roles",
        ]

    def get_permissions(self, obj):
        """Get user's effective permissions."""
        return list(obj.get_all_permissions())

    def get_roles(self, obj):
        """Get effective roles, normalizing superusers to Administrator."""
        roles = sorted(obj.groups.values_list("name", flat=True))
        if obj.is_superuser and "Administrator" not in roles:
            roles.insert(0, "Administrator")
        return roles


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change."""

    current_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        help_text=_("Current password"),
    )
    new_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        help_text=_("New password"),
    )
    confirm_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        help_text=_("Confirm new password"),
    )

    def validate(self, attrs):
        if not attrs.get("current_password"):
            raise serializers.ValidationError(
                {"current_password": _("Current password is required.")}
            )

        if not attrs.get("new_password"):
            raise serializers.ValidationError({"new_password": _("New password is required.")})

        if attrs.get("new_password") != attrs.get("confirm_password"):
            raise serializers.ValidationError({"confirm_password": _("Passwords do not match.")})

        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": _("New password must be different from current password.")}
            )

        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile (read-only)."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = None  # Set dynamically
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "is_active",
            "is_staff",
            "date_joined",
            "last_login",
        ]
        read_only_fields = [
            "id",
            "email",
            "date_joined",
            "last_login",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()
