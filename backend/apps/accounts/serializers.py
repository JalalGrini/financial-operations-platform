# apps/accounts/serializers.py
"""
Serializers and validation for the accounts app.

The preference schema is the single source of truth for which settings keys
exist and what each one's valid values are. Unknown keys are rejected rather
than silently dropped (a typo must look like a failure, not a save), matching
the posture of apps.extensibility's custom-field validation.
"""
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.accounts.models import User
from apps.common.security import validate_private_upload

# Each entry: "key": {"type": "bool" | "choice" | "int", ...}
#   choice → "choices": list of allowed string values
#   int    → "min"/"max": inclusive bounds
PREFERENCE_SCHEMA = {
    # General
    "defaultPageSize": {"type": "choice", "choices": ["10", "25", "50", "100"]},
    "defaultDensity": {"type": "choice", "choices": ["comfortable", "compact", "dense"]},
    "showArchivedByDefault": {"type": "bool"},
    "preferredLanguage": {"type": "choice", "choices": ["en", "fr", "ar"]},
    "preferredTheme": {"type": "choice", "choices": ["light", "dark", "system"]},
    "autoRefreshInterval": {
        "type": "choice",
        "choices": ["0", "30000", "60000", "300000", "600000"],
    },
    # Notifications
    "emailOnArchive": {"type": "bool"},
    "emailOnRestore": {"type": "bool"},
    "emailOnPayrollApproval": {"type": "bool"},
    "emailOnCNSSSubmission": {"type": "bool"},
    # Payroll
    "defaultWorkingDays": {"type": "int", "min": 1, "max": 31},
    "autoCalculatePayroll": {"type": "bool"},
    "requirePayrollApproval": {"type": "bool"},
    # CNSS
    "autoSubmitCNSS": {"type": "bool"},
    "cnssReminderDays": {"type": "int", "min": 0, "max": 90},
    # Security
    "sessionTimeout": {
        "type": "choice",
        "choices": ["15", "30", "60", "120", "240", "480"],
    },
    "requireMFA": {"type": "bool"},
    # View modes (backed by frontend toggle; "table" is the default)
    "personnelViewMode":        {"type": "choice", "choices": ["table", "card"]},
    "companiesViewMode":        {"type": "choice", "choices": ["table", "card"]},
    "financialRecordsViewMode": {"type": "choice", "choices": ["table", "card"]},
    "inventoryViewMode":        {"type": "choice", "choices": ["table", "card"]},
    "partiesViewMode":          {"type": "choice", "choices": ["table", "card"]},
    "transfersViewMode":        {"type": "choice", "choices": ["table", "card"]},
    # Display
    "sidebarCollapsed":         {"type": "bool"},
    "showTotalsInLists":        {"type": "bool"},
    "deadlineWarningDays":      {"type": "int", "min": 1, "max": 90},
    "highlightOverdue":         {"type": "bool"},
    # Error/runtime behavior
    "errorAutoRedirectSeconds": {"type": "choice", "choices": ["2", "3", "5", "0"]},
    "show404Details":           {"type": "bool"},
}

# Server-side defaults. The frontend initializes its form from the GET
# response, so these are the effective defaults everywhere.
DEFAULT_PREFERENCES = {
    "defaultPageSize": "25",
    "defaultDensity": "comfortable",
    "showArchivedByDefault": False,
    "preferredLanguage": "en",
    "preferredTheme": "system",
    "autoRefreshInterval": "0",
    "emailOnArchive": True,
    "emailOnRestore": False,
    "emailOnPayrollApproval": True,
    "emailOnCNSSSubmission": True,
    "defaultWorkingDays": 26,
    "autoCalculatePayroll": False,
    "requirePayrollApproval": True,
    "autoSubmitCNSS": False,
    "cnssReminderDays": 5,
    "sessionTimeout": "30",
    "requireMFA": False,
    "personnelViewMode": "table",
    "companiesViewMode": "table",
    "financialRecordsViewMode": "table",
    "inventoryViewMode": "table",
    "partiesViewMode": "table",
    "transfersViewMode": "table",
    "sidebarCollapsed": False,
    "showTotalsInLists": True,
    "deadlineWarningDays": 7,
    "highlightOverdue": True,
    "errorAutoRedirectSeconds": "2",
    "show404Details": False,
}


class UserPreferencesPayloadSerializer(serializers.Serializer):
    """OpenAPI request shape for the caller's preference dictionary."""

    preferences = serializers.DictField(required=False)


def _validate_bool(key, value, spec=None):
    # bool is a subclass of int in Python; accepting 0/1 or "true" here would
    # let a stringly-typed caller quietly store the wrong shape.
    if not isinstance(value, bool):
        raise ValidationError(_("%(key)s must be true or false.") % {"key": key})
    return value


def _validate_choice(key, value, spec):
    if not isinstance(value, str) or value not in spec["choices"]:
        raise ValidationError(
            _("%(key)s must be one of: %(choices)s")
            % {"key": key, "choices": ", ".join(spec["choices"])}
        )
    return value


def _validate_int(key, value, spec):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(_("%(key)s must be a whole number.") % {"key": key})
    if value < spec["min"] or value > spec["max"]:
        raise ValidationError(
            _("%(key)s must be between %(min)d and %(max)d.")
            % {"key": key, "min": spec["min"], "max": spec["max"]}
        )
    return value


_VALIDATORS = {"bool": _validate_bool, "choice": _validate_choice, "int": _validate_int}


def validate_preferences(payload) -> dict:
    """Validate a preference payload against PREFERENCE_SCHEMA.

    Returns the cleaned dict containing only known keys with coerced values.
    Raises ValidationError describing every problem at once.
    """
    if not isinstance(payload, dict):
        raise ValidationError({"preferences": _("Preferences must be an object.")})

    unknown = set(payload) - set(PREFERENCE_SCHEMA)
    if unknown:
        raise ValidationError(
            {
                "preferences": _("Unknown preference keys: %(keys)s")
                % {"keys": ", ".join(sorted(unknown))}
            }
        )

    errors = {}
    cleaned = {}
    for key, value in payload.items():
        spec = PREFERENCE_SCHEMA[key]
        try:
            cleaned[key] = _VALIDATORS[spec["type"]](key, value, spec)
        except ValidationError as exc:
            errors[key] = exc.messages[0]

    if errors:
        raise ValidationError(errors)
    return cleaned


ROLE_NAMES = ("Administrator", "Assistant", "Director")


class AccountSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    role = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_active",
            "must_change_password",
            "date_joined",
            "last_login",
            "avatar_url",
        )
        read_only_fields = fields

    def get_role(self, obj):
        if obj.is_superuser:
            return "Administrator"
        return obj.groups.filter(name__in=ROLE_NAMES).values_list("name", flat=True).first()

    def get_avatar_url(self, obj):
        return f"/api/v1/accounts/users/{obj.pk}/avatar/" if obj.avatar else None


class AccountCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=ROLE_NAMES)
    temporary_password = serializers.CharField(
        write_only=True, min_length=12, trim_whitespace=False
    )

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_temporary_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("temporary_password")
        user = User.objects.create_user(
            password=password, must_change_password=True, **validated_data
        )
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.set([group])
        return user


class AccountUpdateSerializer(serializers.Serializer):
    """What an Administrator may change on somebody else's account.

    v17.26 added `email` and widened `role` to every role. Email is the login
    identifier, so it is normalised and checked for collisions against every
    other account - excluding this one, otherwise saving a form without
    touching the email would report the user's own address as taken.
    """

    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    role = serializers.ChoiceField(choices=ROLE_NAMES, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_email(self, value):
        value = value.strip().lower()
        clash = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        changed = list(validated_data)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if changed:
            instance.save(update_fields=[*changed, "updated_at"])
        if role:
            group, _ = Group.objects.get_or_create(name=role)
            instance.groups.set([group])
        return instance


class SelfProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "full_name", "avatar_url")
        read_only_fields = ("id", "email", "full_name", "avatar_url")

    def get_avatar_url(self, obj):
        return f"/api/v1/accounts/users/{obj.pk}/avatar/" if obj.avatar else None


class AvatarUploadSerializer(serializers.Serializer):
    avatar = serializers.ImageField()

    def validate_avatar(self, value):
        value = validate_private_upload(
            value, max_bytes=5 * 1024 * 1024, allowed={".png", ".jpg", ".jpeg"}
        )
        from PIL import Image

        value.seek(0)
        with Image.open(value) as image:
            width, height = image.size
            if width < 64 or height < 64:
                raise serializers.ValidationError(
                    "Profile picture must be at least 64 × 64 pixels."
                )
            if width > 4096 or height > 4096 or width * height > 16_000_000:
                raise serializers.ValidationError("Profile picture dimensions are too large.")
        value.seek(0)
        return value
