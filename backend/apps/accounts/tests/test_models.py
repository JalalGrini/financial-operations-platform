# apps/accounts/tests/test_models.py
"""
Tests for the accounts app User model.
"""
import uuid

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

User = get_user_model()


class UserModelTests(TestCase):
    """Tests for the custom User model."""

    def test_create_user(self):
        """Test creating a regular user."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.first_name, "John")
        self.assertEqual(user.last_name, "Doe")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password("testpass123"))
        self.assertIsInstance(user.id, uuid.UUID)

    def test_create_user_email_normalization(self):
        """Test that email domain is normalized to lowercase (Django normalizes domain only)."""
        user = User.objects.create_user(
            email="TEST@EXAMPLE.COM",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.email, "TEST@example.com")

    def test_create_user_without_email_raises_error(self):
        """Test that creating user without email raises ValueError."""
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="",
                password="testpass123",
                first_name="John",
                last_name="Doe",
            )

    def test_create_superuser(self):
        """Test creating a superuser."""
        user = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpass123",
            first_name="Admin",
            last_name="User",
        )
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_create_superuser_without_is_staff_raises_error(self):
        """Test that creating superuser without is_staff raises ValueError."""
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="admin@example.com",
                password="adminpass123",
                first_name="Admin",
                last_name="User",
                is_staff=False,
            )

    def test_create_superuser_without_is_superuser_raises_error(self):
        """Test that creating superuser without is_superuser raises ValueError."""
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="admin@example.com",
                password="adminpass123",
                first_name="Admin",
                last_name="User",
                is_superuser=False,
            )

    def test_user_str_representation(self):
        """Test string representation of user."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(str(user), "test@example.com")

    def test_get_full_name(self):
        """Test get_full_name method."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.get_full_name(), "John Doe")

    def test_get_full_name_empty_fallback(self):
        """Test get_full_name falls back to email when names are empty."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="",
            last_name="",
        )
        self.assertEqual(user.get_full_name(), "test@example.com")

    def test_get_short_name(self):
        """Test get_short_name method."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.get_short_name(), "John")

    def test_email_unique_constraint(self):
        """Test that email field is unique."""
        User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                email="test@example.com",
                password="testpass456",
                first_name="Jane",
                last_name="Smith",
            )

    def test_user_uuid_primary_key(self):
        """Test that user has UUID primary key."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertIsInstance(user.pk, uuid.UUID)
        self.assertEqual(user.pk, user.id)

    def test_timestamps_auto_set(self):
        """Test that created_at and updated_at are automatically set."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertIsNotNone(user.created_at)
        self.assertIsNotNone(user.updated_at)

    def test_user_model_permissions_mixin(self):
        """Test that User model has PermissionsMixin functionality."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        # Test has_perm, has_perms, has_module_perms
        self.assertFalse(user.has_perm("some_perm"))
        self.assertFalse(user.has_perms(["perm1", "perm2"]))
        self.assertFalse(user.has_module_perms("some_module"))

    def test_superuser_has_all_permissions(self):
        """Test that superuser has all permissions implicitly."""
        user = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpass123",
            first_name="Admin",
            last_name="User",
        )
        self.assertTrue(user.has_perm("any_permission"))
        self.assertTrue(user.has_perms(["perm1", "perm2"]))
        self.assertTrue(user.has_module_perms("any_module"))

    def test_date_joined_auto_set(self):
        """Test that date_joined is automatically set."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertIsNotNone(user.date_joined)
