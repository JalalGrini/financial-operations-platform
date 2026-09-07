# apps/authentication/tests/test_models.py
"""
Tests for authentication models.
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


class RefreshTokenModelTests(TestCase):
    """Tests for the RefreshToken model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_refresh_token(self):
        """Test creating a refresh token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            access_token_jti="access_jti_123",
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.assertEqual(token.user, self.user)
        self.assertEqual(token.token, "test_token_123")
        self.assertIsNotNone(token.token_family)
        self.assertEqual(token.access_token_jti, "access_jti_123")
        self.assertIsNone(token.revoked_at)
        self.assertIsNone(token.revoked_by)
        self.assertIsNone(token.replaced_by)

    def test_refresh_token_str_representation(self):
        """Test string representation of refresh token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        expected = f"{token.reference} - {self.user.email}"
        self.assertEqual(str(token), expected)

    def test_refresh_token_is_valid(self):
        """Test is_valid method for valid token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.assertTrue(token.is_valid())

    def test_refresh_token_is_valid_archived(self):
        """Test is_valid method for archived token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        token.archive()
        self.assertFalse(token.is_valid())

    def test_refresh_token_is_valid_revoked(self):
        """Test is_valid method for revoked token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        token.revoke(user=None)
        self.assertFalse(token.is_valid())

    def test_refresh_token_is_valid_expired(self):
        """Test is_valid method for expired token."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(token.is_valid())

    def test_refresh_token_revoke(self):
        """Test revoke method."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        token.revoke(reason="User logout")
        self.assertTrue(token.revoked_at is not None)
        self.assertEqual(token.revoked_reason, "User logout")

    def test_refresh_token_replace_with(self):
        """Test replace_with method for token rotation."""
        token = RefreshToken.objects.create(
            user=self.user,
            token="test_token_123",
            token_family=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        new_token = RefreshToken.objects.create(
            user=self.user,
            token="new_token_456",
            token_family=token.token_family,
            expires_at=timezone.now() + timedelta(days=7),
        )
        original_token = token.replace_with(new_token, user=None)
        self.assertEqual(original_token.replaced_by, new_token)
        self.assertTrue(original_token.is_archived)
        self.assertIsNotNone(original_token.archived_at)


class UserSessionModelTests(TestCase):
    """Tests for the UserSession model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_user_session(self):
        """Test creating a user session."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            device_name="Chrome on Windows",
            device_type="desktop",
            ip_address="192.168.1.1",
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertEqual(session.user, self.user)
        self.assertEqual(session.session_key, "test_session_key_123")
        self.assertEqual(session.device_name, "Chrome on Windows")
        self.assertEqual(session.device_type, "desktop")
        self.assertEqual(session.ip_address, "192.168.1.1")
        self.assertTrue(session.is_active)
        self.assertIsNone(session.revoked_at)

    def test_user_session_is_valid(self):
        """Test is_valid method for valid session."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertTrue(session.is_valid())

    def test_user_session_is_valid_expired(self):
        """Test is_valid method for expired session."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(session.is_valid())

    def test_user_session_is_valid_revoked(self):
        """Test is_valid method for revoked session."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session.revoke(user=None, reason="Test revocation")
        self.assertFalse(session.is_valid())

    def test_user_session_revoke(self):
        """Test revoke method."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session.revoke(user=None, reason="Test revocation")
        self.assertTrue(session.is_revoked)
        self.assertIsNotNone(session.revoked_at)
        self.assertEqual(session.revoked_reason, "Test revocation")

    def test_user_session_revoke_all_other_sessions(self):
        """Test revoke_all_other_sessions method."""
        session1 = UserSession.objects.create(
            user=self.user,
            session_key="session_1",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session2 = UserSession.objects.create(
            user=self.user,
            session_key="session_2",
            expires_at=timezone.now() + timedelta(days=30),
        )
        session3 = UserSession.objects.create(
            user=self.user,
            session_key="session_3",
            expires_at=timezone.now() + timedelta(days=30),
        )

        session1.revoke_all_other_sessions()

        # Refresh from database
        session1.refresh_from_db()
        session2.refresh_from_db()
        session3.refresh_from_db()

        self.assertFalse(session1.is_revoked)
        self.assertTrue(session2.is_revoked)
        self.assertTrue(session3.is_revoked)

    def test_user_session_extend(self):
        """Test extend method."""
        session = UserSession.objects.create(
            user=self.user,
            session_key="test_session_key_123",
            expires_at=timezone.now() + timedelta(days=1),
        )
        original_expiry = session.expires_at
        session.extend(timedelta(days=7))
        self.assertGreater(session.expires_at, original_expiry)
        self.assertAlmostEqual(
            session.expires_at, timezone.now() + timedelta(days=7), delta=timedelta(seconds=10)
        )


class FailedLoginAttemptModelTests(TestCase):
    """Tests for the FailedLoginAttempt model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_failed_login_attempt(self):
        """Test creating a failed login attempt."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0",
            failure_reason="invalid_credentials",
        )
        self.assertEqual(attempt.email, "test@example.com")
        self.assertEqual(attempt.ip_address, "192.168.1.1")
        self.assertEqual(attempt.failure_reason, "invalid_credentials")
        self.assertEqual(attempt.attempt_count, 1)
        self.assertFalse(attempt.is_locked)
        self.assertIsNone(attempt.locked_until)

    def test_failed_login_attempt_is_locked(self):
        """Test is_currently_locked method."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )
        self.assertTrue(attempt.is_currently_locked())

    def test_failed_login_attempt_is_locked_expired(self):
        """Test is_currently_locked method for expired lock."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            is_locked=True,
            locked_until=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(attempt.is_currently_locked())

    def test_failed_login_attempt_lock(self):
        """Test lock method."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
        )
        attempt.lock(duration=30)
        self.assertTrue(attempt.is_locked)
        self.assertEqual(attempt.lockout_count, 1)
        self.assertIsNotNone(attempt.locked_until)

    def test_failed_login_attempt_unlock(self):
        """Test unlock method."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )
        attempt.unlock()
        self.assertFalse(attempt.is_locked)
        self.assertIsNone(attempt.locked_until)

    def test_failed_login_attempt_increment_attempt(self):
        """Test increment_attempt method."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
        )
        attempt.increment_attempt()
        self.assertEqual(attempt.attempt_count, 2)

    def test_failed_login_attempt_reset_attempts(self):
        """Test reset_attempts method."""
        attempt = FailedLoginAttempt.objects.create(
            email="test@example.com",
            ip_address="192.168.1.1",
            attempt_count=5,
            is_locked=True,
            locked_until=timezone.now() + timedelta(hours=1),
        )
        attempt.reset_attempts()
        self.assertEqual(attempt.attempt_count, 0)
        self.assertFalse(attempt.is_locked)
        self.assertIsNone(attempt.locked_until)
