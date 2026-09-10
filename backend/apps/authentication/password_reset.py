"""Public 6-digit password reset: request, verify, set a new password."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.authentication.cookies import clear_auth_cookies
from apps.authentication.models import PasswordResetCode
from apps.authentication.views import _blacklist_all_outstanding_tokens_for_user
from apps.common.email_copy import normalize_locale, reset_body, reset_subject
from apps.common.http import client_ip
from apps.common.mailer import queue_platform_email

User = get_user_model()
CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5


class PasswordResetThrottle(SimpleRateThrottle):
    scope = "password_reset"

    def get_cache_key(self, request, view):
        email = ""
        if hasattr(request, "data") and isinstance(request.data.get("email"), str):
            email = request.data.get("email").strip().lower()
        ident = f"{client_ip(request)}:{email}" if email else client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def _locale(request) -> str:
    return normalize_locale(request.data.get("locale"))


def _find_user(email: str):
    if not email:
        return None
    return User.objects.filter(email__iexact=email.strip(), is_active=True).first()


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        locale = _locale(request)
        if not email:
            return Response(
                {"detail": "Please enter your email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = _find_user(email)
        if not user:
            return Response(
                {"detail": "No account with this email."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        PasswordResetCode.objects.filter(user=user, used_at__isnull=True).delete()
        code = f"{secrets.randbelow(1_000_000):06d}"
        PasswordResetCode.objects.create(
            user=user,
            code_hash=make_password(code),
            expires_at=timezone.now() + CODE_TTL,
        )
        queue_platform_email(
            to=user.email,
            subject=reset_subject(locale),
            body=reset_body(code, locale),
        )
        return Response({"ok": True})


class PasswordResetVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        row, error = _match_code(request)
        if error:
            return error
        return Response({"ok": True})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        row, error = _match_code(request)
        if error:
            return error
        new_password = request.data.get("new_password") or ""
        confirm_password = request.data.get("confirm_password") or ""
        if not new_password or not confirm_password:
            return Response(
                {"detail": "Please fill in all required fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new_password != confirm_password:
            return Response(
                {"detail": "Passwords do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new_password, row.user)
        except ValidationError as exc:
            return Response(
                {"detail": " ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.user.set_password(new_password)
        if hasattr(row.user, "must_change_password"):
            row.user.must_change_password = False
            row.user.save(update_fields=["password", "must_change_password", "updated_at"])
        else:
            row.user.save(update_fields=["password", "updated_at"])
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])
        PasswordResetCode.objects.filter(user=row.user, used_at__isnull=True).delete()
        _blacklist_all_outstanding_tokens_for_user(row.user)
        response = Response({"ok": True})
        clear_auth_cookies(response)
        return response


def _match_code(request):
    email = (request.data.get("email") or "").strip()
    code = (request.data.get("code") or "").strip()
    user = _find_user(email)
    if not user or len(code) != 6 or not code.isdigit():
        return None, Response(
            {"detail": "That code is not valid."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    row = (
        PasswordResetCode.objects.filter(user=user, used_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not row or row.expires_at <= timezone.now():
        return None, Response(
            {"detail": "That code is not valid."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if row.attempts >= MAX_ATTEMPTS:
        return None, Response(
            {"detail": "Too many attempts. Request a new code."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not check_password(code, row.code_hash):
        row.attempts += 1
        row.save(update_fields=["attempts"])
        return None, Response(
            {"detail": "That code is not valid."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return row, None
