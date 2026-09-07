# apps/authentication/tests/test_selectors.py
"""
Tests for Authentication selectors.
"""
import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.authentication.models import (
    FailedLoginAttempt,
    RefreshToken,
    UserSession,
)
from apps.authentication.selectors import (
    FailedLoginAttemptSelector,
    RefreshTokenSelector,
    UserSessionSelector,
)


class RefreshTokenSelectorTests(TestCase):
    """Tests for RefreshTokenSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_all(self):
        """Test getting all non-archived refresh tokens."""
        RefreshToken.objects.create(
            user=self.user,
            token="token_1",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        RefreshToken.objects.create(
            user=self.user,
            token="token_2",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )

        tokens = RefreshTokenSelector.get_all()
        self.assertEqual(tokens.count(), 2)

    def test_get_by_user(self):
        """Test getting refresh tokens by user."""
        RefreshToken.objects.create(
            user=self.user,
            token="token_1",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        RefreshToken.objects.create(
            user=self.user,
            token="token_2",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )

        tokens = RefreshTokenSelector.get_by_user(self.user.id)
        self.assertEqual(tokens.count(), 2)

    def test_get_valid_by_user(self):
        """Test getting valid refresh tokens for a user."""
        RefreshToken.objects.create(
            user=self.user,
            token="valid_token",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        RefreshToken.objects.create(
            user=self.user,
            token="expired_token",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() - timedelta(hours=1),
        )
        revoked_token = RefreshToken.objects.create(
            user=self.user,
            token="revoked_token",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        revoked_token.revoke()

        valid_tokens = RefreshTokenSelector.get_valid_by_user(self.user.id)
        self.assertEqual(valid_tokens.count(), 1)
        self.assertEqual(valid_tokens.first().token, "valid_token")

    def test_get_revoked_by_user(self):
        """Test getting revoked tokens for a user."""
        RefreshToken.objects.create(
            user=self.user,
            token="active_token",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        token2 = RefreshToken.objects.create(
            user=self.user,
            token="revoked_token",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        token2.revoke()

        revoked = RefreshTokenSelector.get_revoked_by_user(self.user.id)
        self.assertEqual(revoked.count(), 1)
        self.assertEqual(revoked.first().token, "revoked_token")


class UserSessionSelectorTests(TestCase):
    """Tests for UserSessionSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_active_by_user(self):
        """Test getting active sessions for a user."""
        UserSession.objects.create(
            user=self.user,
            session_key="session_1",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session2 = UserSession.objects.create(
            user=self.user,
            session_key="session_2",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session2.revoke()

        active_sessions = UserSessionSelector.get_active_by_user(self.user.id)
        self.assertEqual(active_sessions.count(), 1)
        self.assertEqual(active_sessions.first().session_key, "session_1")

    def test_get_revoked_by_user(self):
        """Test getting revoked sessions for a user."""
        UserSession.objects.create(
            user=self.user,
            session_key="session_1",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session2 = UserSession.objects.create(
            user=self.user,
            session_key="session_2",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session2.revoke()

        revoked = UserSessionSelector.get_revoked_by_user(self.user.id)
        self.assertEqual(revoked.count(), 1)
        self.assertEqual(revoked.first().session_key, "session_2")


class FailedLoginAttemptSelectorTests(TestCase):
    """Tests for FailedLoginAttemptSelector."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_get_locked(self):
        """Test getting locked failed login attempts."""
        FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )
        FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.2",
        )

        locked = FailedLoginAttemptSelector.get_locked()
        self.assertEqual(locked.count(), 1)
        self.assertEqual(locked.first().email, "test@example.com")

    def test_get_locked_by_email(self):
        """Test getting locked attempts by email."""
        FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )
        FailedLoginAttempt.objects.create(
            email="test2@example.com",
            ip_address="192.168.1.2",
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )

        locked = FailedLoginAttemptSelector.get_locked_by_email("test@example.com")
        self.assertEqual(locked.count(), 1)
        self.assertEqual(locked.first().email, "test@example.com")
