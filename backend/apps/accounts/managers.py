# apps/accounts/managers.py
"""
Custom managers for the User model.
"""
from django.contrib.auth.base_user import BaseUserManager
from django.utils.translation import gettext_lazy as _


class UserManager(BaseUserManager):
    """
    Custom manager for User model with email as the unique identifier.

    Extends BaseUserManager to provide create_user and create_superuser
    methods that work with email-based authentication.
    """

    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        """
        Create and return a user with an email and password.

        Args:
            email: The user's email address (used as username)
            password: The user's password
            **extra_fields: Additional fields (first_name, last_name, etc.)

        Returns:
            User: The created user instance

        Raises:
            ValueError: If email is not provided
        """
        if not email:
            raise ValueError(_("The Email field must be set"))
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """
        Create and return a superuser with an email and password.

        Args:
            email: The superuser's email address
            password: The superuser's password
            **extra_fields: Additional fields

        Returns:
            User: The created superuser instance

        Raises:
            ValueError: If is_staff or is_superuser is not True
        """
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError(_("Superuser must have is_staff=True."))
        if extra_fields.get("is_superuser") is not True:
            raise ValueError(_("Superuser must have is_superuser=True."))

        return self.create_user(email, password, **extra_fields)
