"""Account preferences, safe self-service profile, and Administrator governance APIs."""

import mimetypes

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User, UserPreference
from apps.accounts.serializers import (
    DEFAULT_PREFERENCES,
    AccountCreateSerializer,
    AccountSerializer,
    AccountUpdateSerializer,
    AvatarUploadSerializer,
    SelfProfileSerializer,
    UserPreferencesPayloadSerializer,
    validate_preferences,
)
from apps.audit_log.services import record_event
from apps.common.permissions import IsAuthenticatedOwnerOrReadOnly, RoleBasedAccessPermission

PROTECTED_ACCOUNT_FIELDS = {
    "password",
    "is_staff",
    "is_superuser",
    "user_permissions",
    "groups",
    "must_change_password",
    "last_login",
    "date_joined",
    "username",
}


class AdministratorOnly(RoleBasedAccessPermission):
    """Administrator-only governance permission recognized by the role guard."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (user.is_superuser or user.groups.filter(name="Administrator").exists())
        )


class RecognizedAccountUser(RoleBasedAccessPermission):
    """Allow every active EFOP role to manage its own profile and avatar."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (
                user.is_superuser
                or user.groups.filter(name__in=("Administrator", "Assistant", "Director")).exists()
            )
        )


def generate_temporary_password() -> str:
    """A strong temporary password that satisfies Django's validators.

    Built from an explicit alphabet with one guaranteed character from each
    class, then shuffled, so it cannot randomly come out all-lowercase and be
    rejected by the very validators it is about to be checked against.
    """
    import secrets

    lower = "abcdefghijkmnopqrstuvwxyz"
    upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "23456789"
    symbols = "!@#$%^&*-_=+"
    alphabet = lower + upper + digits + symbols
    required = [
        secrets.choice(lower),
        secrets.choice(upper),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    rest = [secrets.choice(alphabet) for _ in range(12)]
    chars = required + rest
    # secrets.SystemRandom().shuffle is the cryptographic shuffle; random's is not.
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _reject_protected_fields(payload):
    attempted = sorted(PROTECTED_ACCOUNT_FIELDS.intersection(payload))
    if attempted:
        raise DRFValidationError(
            {
                field: ["This security field cannot be changed through this endpoint."]
                for field in attempted
            }
        )


def _merged_preferences(record) -> dict:
    merged = dict(DEFAULT_PREFERENCES)
    if record is not None:
        merged.update(record.values or {})
    return merged


class UserPreferencesView(APIView):
    permission_classes = [IsAuthenticatedOwnerOrReadOnly]
    serializer_class = UserPreferencesPayloadSerializer

    def _get_record(self, user):
        return UserPreference.objects.filter(user=user).first()

    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "Preferences retrieved.",
                "data": {"preferences": _merged_preferences(self._get_record(request.user))},
            }
        )

    @transaction.atomic
    def put(self, request):
        payload = request.data.get("preferences", request.data)
        try:
            cleaned = validate_preferences(payload)
        except DjangoValidationError as exc:
            raise DRFValidationError(
                getattr(exc, "message_dict", {"preferences": exc.messages})
            ) from exc
        record, _ = UserPreference.objects.get_or_create(user=request.user)
        record.values = {**(record.values or {}), **cleaned}
        record.save(update_fields=["values", "updated_at"])
        return Response(
            {
                "success": True,
                "message": "Preferences saved.",
                "data": {"preferences": _merged_preferences(record)},
            }
        )

    def delete(self, request):
        record = self._get_record(request.user)
        if record is not None:
            record.values = {}
            record.save(update_fields=["values", "updated_at"])
        return Response(
            {
                "success": True,
                "message": "Preferences reset to defaults.",
                "data": {"preferences": dict(DEFAULT_PREFERENCES)},
            }
        )


class AccountListCreateView(APIView):
    permission_classes = [AdministratorOnly]
    serializer_class = AccountSerializer

    def get(self, request):
        users = User.objects.prefetch_related("groups").order_by("first_name", "last_name", "email")
        return Response(
            {"success": True, "data": {"users": AccountSerializer(users, many=True).data}}
        )

    @transaction.atomic
    def post(self, request):
        _reject_protected_fields(request.data)
        serializer = AccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        record_event(
            action="create",
            summary=f"Created {AccountSerializer(user).data['role']} account {user.email}",
            actor=request.user,
            entity=user,
            after={
                "email": user.email,
                "role": AccountSerializer(user).data["role"],
                "is_active": user.is_active,
            },
            request=request,
        )
        return Response(
            {
                "success": True,
                "message": "Account created. The temporary password must be shared privately and changed at first login.",
                "data": {"user": AccountSerializer(user).data},
            },
            status=status.HTTP_201_CREATED,
        )


class AccountDetailView(APIView):
    permission_classes = [AdministratorOnly]
    serializer_class = AccountSerializer

    def _get(self, user_id):
        try:
            return User.objects.prefetch_related("groups").get(pk=user_id)
        except User.DoesNotExist as exc:
            raise NotFound("Account not found.") from exc

    def get(self, request, user_id):
        return Response(
            {"success": True, "data": {"user": AccountSerializer(self._get(user_id)).data}}
        )

    @transaction.atomic
    def patch(self, request, user_id):
        _reject_protected_fields(request.data)
        user = self._get(user_id)
        if user.is_superuser:
            raise DRFValidationError(
                {"account": ["Superuser governance fields cannot be changed here."]}
            )
        if user.pk == request.user.pk and request.data.get("is_active") is False:
            raise DRFValidationError({"is_active": ["You cannot deactivate your own account."]})
        # Roles became editable in v17.26. Demoting yourself is the same class
        # of mistake as deactivating yourself: it locks the last administrator
        # out of account management with no way back through the UI.
        new_role = request.data.get("role")
        if (
            user.pk == request.user.pk
            and new_role
            and new_role != AccountSerializer(user).data["role"]
        ):
            raise DRFValidationError({"role": ["You cannot change your own role."]})
        before = AccountSerializer(user).data
        serializer = AccountUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        after = AccountSerializer(user).data
        record_event(
            action="update",
            summary=f"Updated account {user.email}",
            actor=request.user,
            entity=user,
            before=before,
            after=after,
            request=request,
        )
        return Response({"success": True, "message": "Account updated.", "data": {"user": after}})


class TemporaryPasswordView(APIView):
    permission_classes = [AdministratorOnly]
    serializer_class = AccountUpdateSerializer

    @transaction.atomic
    def post(self, request, user_id):
        _reject_protected_fields(
            {k: v for k, v in request.data.items() if k != "temporary_password"}
        )
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise NotFound("Account not found.") from exc
        if user.is_superuser:
            raise DRFValidationError({"account": ["Superuser credentials cannot be reset here."]})
        password = request.data.get("temporary_password", "")
        from django.contrib.auth.password_validation import validate_password

        # v17.26: one-click reset. With no password supplied the server mints
        # a strong one and returns it once, so an administrator does not have
        # to invent a compliant password to unlock somebody. A supplied
        # password is still honoured and still validated - this widens the
        # endpoint, it does not replace it.
        generated = False
        if not password:
            password = generate_temporary_password()
            generated = True

        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise DRFValidationError({"temporary_password": list(exc.messages)}) from exc
        user.set_password(password)
        user.must_change_password = True
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        record_event(
            action="credential_reset",
            summary=f"Issued a temporary password for {user.email}",
            actor=request.user,
            entity=user,
            request=request,
        )
        return Response(
            {
                "success": True,
                "message": "Temporary password set. The user must change it at next login.",
                # Returned only when the server generated it. An administrator
                # who typed the password already knows it, and echoing a
                # user-supplied secret back over the wire buys nothing.
                "data": {"temporary_password": password} if generated else {},
            }
        )


class SelfProfileView(APIView):
    permission_classes = [RecognizedAccountUser]
    serializer_class = SelfProfileSerializer

    def get(self, request):
        return Response(
            {"success": True, "data": {"profile": SelfProfileSerializer(request.user).data}}
        )

    @transaction.atomic
    def patch(self, request):
        _reject_protected_fields(request.data)
        before = SelfProfileSerializer(request.user).data
        serializer = SelfProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record_event(
            action="update",
            summary="Updated own profile",
            actor=request.user,
            entity=request.user,
            before=before,
            after=serializer.data,
            request=request,
        )
        return Response(
            {"success": True, "message": "Profile updated.", "data": {"profile": serializer.data}}
        )


class AccountAvatarView(APIView):
    permission_classes = [RecognizedAccountUser]
    serializer_class = AvatarUploadSerializer
    parser_classes = [MultiPartParser, FormParser]

    def _target(self, request, user_id=None):
        if user_id is None:
            return request.user
        try:
            return User.objects.get(pk=user_id, is_active=True)
        except User.DoesNotExist as exc:
            raise NotFound("Profile picture not found.") from exc

    def get(self, request, user_id=None):
        user = self._target(request, user_id)
        if not user.avatar:
            raise NotFound("This account has no profile picture.")
        # A row can name a file that is no longer in storage - e.g. media
        # restored from a different environment, or a file removed by hand.
        # `FieldFile.open()` then raises FileNotFoundError, which surfaced as an
        # uncaught HTTP 500 on what is really a "not found". Checking storage
        # first turns a dangling reference into the 404 the clients already
        # handle, so a stale pointer degrades to the initials placeholder
        # instead of erroring.
        if not user.avatar.storage.exists(user.avatar.name):
            raise NotFound("The stored profile picture is no longer available.")
        response = FileResponse(
            user.avatar.open("rb"),
            content_type=mimetypes.guess_type(user.avatar.name)[0] or "application/octet-stream",
        )
        response["Content-Disposition"] = (
            f'inline; filename="{user.avatar.name.rsplit("/", 1)[-1]}"'
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @transaction.atomic
    def put(self, request, user_id=None):
        if user_id is not None:
            return Response(
                {"detail": "Users may replace only their own profile picture."}, status=403
            )
        serializer = AvatarUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old = request.user.avatar
        request.user.avatar = serializer.validated_data["avatar"]
        request.user.save(update_fields=["avatar", "updated_at"])
        if old:
            old.delete(save=False)
        record_event(
            action="update",
            summary="Updated own profile picture",
            actor=request.user,
            entity=request.user,
            request=request,
        )
        return Response(
            {
                "success": True,
                "message": "Profile picture updated.",
                "data": {"avatar_url": f"/api/v1/accounts/users/{request.user.pk}/avatar/"},
            }
        )

    @transaction.atomic
    def delete(self, request, user_id=None):
        if user_id is not None:
            return Response(
                {"detail": "Users may remove only their own profile picture."}, status=403
            )
        old = request.user.avatar
        request.user.avatar = None
        request.user.save(update_fields=["avatar", "updated_at"])
        if old:
            old.delete(save=False)
        record_event(
            action="update",
            summary="Removed own profile picture",
            actor=request.user,
            entity=request.user,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
