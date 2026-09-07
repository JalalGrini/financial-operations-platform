# apps/accounts/tests/test_managers.py
"""
Tests for the UserManager.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class UserManagerTests(TestCase):
    """Tests for the custom UserManager."""

    def test_create_user(self):
        """Test creating a regular user."""
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

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
