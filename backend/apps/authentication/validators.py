# apps/authentication/validators.py
"""
Authentication Validators.

Validators encapsulate reusable validation rules for authentication operations.
"""
import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

# NOTE (cycle 3): the following imports were removed as unused, each verified by
# counting occurrences in this file rather than by inspection:
#   - `Decimal, InvalidOperation` (1 occurrence each: the import itself). Money
#     types have no business in an authentication validator.
#   - `django.conf.settings` (1 occurrence: the import itself).
#   - `django.core.validators.validate_email` (0 real uses - the 3 apparent hits
#     are this module's own `self.validate_email` method, a name collision that
#     made the import look used).
#   - A DUPLICATE `from django.core.exceptions import ValidationError`, imported
#     twice. `ValidationError` itself is genuinely used and is retained.
#   - `FailedLoginAttempt` - see the note at the foot of this file.


class AuthenticationValidator:
    """
    Validators for authentication operations.

    Centralizes validation logic for authentication operations
    to ensure consistency across the application.
    """

    # Valid email regex pattern
    EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

    # Valid password requirements
    MIN_PASSWORD_LENGTH = 8
    MAX_PASSWORD_LENGTH = 128

    def validate_email(self, email: str) -> str:
        """
        Validate email format and return normalized email.

        Args:
            email: Email address to validate

        Returns:
            Normalized lowercase email

        Raises:
            ValidationError: If email is invalid
        """
        if not email:
            raise ValidationError(_("Email is required."))

        email = email.strip().lower()

        if not self.EMAIL_REGEX.match(email):
            raise ValidationError(_("Enter a valid email address."))

        if len(email) > 254:
            raise ValidationError(_("Email address is too long."))

        return email

    def validate_password(self, password: str) -> str:
        """
        Validate password strength.

        Args:
            password: Password to validate

        Returns:
            Validated password

        Raises:
            ValidationError: If password doesn't meet requirements
        """
        if not password:
            raise ValidationError(_("Password is required."))

        if len(password) < self.MIN_PASSWORD_LENGTH:
            raise ValidationError(
                _("Password must be at least %(min_length)d characters.")
                % {"min_length": self.MIN_PASSWORD_LENGTH}
            )

        if len(password) > self.MAX_PASSWORD_LENGTH:
            raise ValidationError(
                _("Password cannot exceed %(max_length)d characters.")
                % {"max_length": self.MAX_PASSWORD_LENGTH}
            )

        # Check for at least one uppercase, lowercase, digit, and special char
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(not c.isalnum() for c in password)

        missing = []
        if not has_upper:
            missing.append(_("uppercase letter"))
        if not has_lower:
            missing.append(_("lowercase letter"))
        if not has_digit:
            missing.append(_("digit"))
        if not has_special:
            missing.append(_("special character"))

        if missing:
            raise ValidationError(
                _("Password must contain at least one %(missing)s.")
                % {"missing": ", ".join(missing)}
            )

        # Check for common weak patterns
        common_patterns = [
            "password",
            "123456",
            "qwerty",
            "abc123",
            "password123",
            "admin123",
            "welcome123",
        ]
        if password.lower() in common_patterns:
            raise ValidationError(_("Password is too common. Choose a stronger password."))

        return password

    def validate_login_credentials(self, email: str, password: str) -> tuple:
        """
        Validate login credentials format.

        Args:
            email: Email address
            password: Password

        Returns:
            Tuple of (validated_email, validated_password)

        Raises:
            ValidationError: If credentials are invalid
        """
        email = self.validate_email(email)
        password = self.validate_password(password)
        return email, password

    def validate_refresh_token(self, token: str) -> str:
        """
        Validate refresh token format.

        Args:
            token: Refresh token string

        Returns:
            Validated token

        Raises:
            ValidationError: If token is invalid
        """
        if not token:
            raise ValidationError(_("Refresh token is required."))

        if len(token) < 20:
            raise ValidationError(_("Invalid refresh token format."))

        return token

    def validate_access_token(self, token: str) -> str:
        """
        Validate access token format.

        Args:
            token: Access token string

        Returns:
            Validated token

        Raises:
            ValidationError: If token is invalid
        """
        if not token:
            raise ValidationError(_("Access token is required."))

        # JWT tokens have 3 parts separated by dots
        parts = token.split(".")
        if len(parts) != 3:
            raise ValidationError(_("Invalid access token format."))

        return token

    def validate_change_password(
        self, current_password: str, new_password: str, confirm_password: str
    ) -> tuple:
        """
        Validate password change request.

        Args:
            current_password: Current password
            new_password: New password
            confirm_password: Password confirmation

        Returns:
            Tuple of (current_password, new_password)

        Raises:
            ValidationError: If validation fails
        """
        if not current_password:
            raise ValidationError(_("Current password is required."))

        if not new_password:
            raise ValidationError(_("New password is required."))

        if not confirm_password:
            raise ValidationError(_("Password confirmation is required."))

        if new_password != confirm_password:
            raise ValidationError(_("New passwords do not match."))

        if current_password == new_password:
            raise ValidationError(_("New password must be different from current password."))

        new_password = self.validate_password(new_password)

        return new_password


class PasswordValidator:
    """
    Password strength validator for configuration-driven validation.
    """

    def __init__(
        self,
        min_length=8,
        require_upper=True,
        require_lower=True,
        require_digit=True,
        require_special=True,
    ):
        self.min_length = min_length
        self.require_upper = require_upper
        self.require_lower = require_lower
        self.require_digit = require_digit
        self.require_special = require_special

    def validate(self, password: str) -> list:
        """
        Validate password against configured requirements.

        Args:
            password: Password to validate

        Returns:
            List of error messages (empty if valid)
        """
        errors = []

        if len(password) < self.min_length:
            errors.append(f"Password must be at least {self.min_length} characters.")

        if self.require_upper and not any(c.isupper() for c in password):
            errors.append("Password must contain at least one uppercase letter.")

        if self.require_lower and not any(c.islower() for c in password):
            errors.append("Password must contain at least one lowercase letter.")

        if self.require_digit and not any(c.isdigit() for c in password):
            errors.append("Password must contain at least one digit.")

        if self.require_special and not any(not c.isalnum() for c in password):
            errors.append("Password must contain at least one special character.")

        return errors

    def __call__(self, password: str):
        """Callable interface for Django validator."""
        errors = self.validate(password)
        if errors:
            from django.core.exceptions import ValidationError

            raise ValidationError(errors)


# ---------------------------------------------------------------------------
# REMOVED (cycle 3): class LoginAttemptValidator
# ---------------------------------------------------------------------------
# This class was the project's intended brute-force protection. It was removed
# rather than repaired, for two reasons.
#
# 1. It was dead AND broken. It had zero importers anywhere in the codebase, and
#    all three of its methods would have raised on the first call:
#      - `clear_failed_attempts()` called `timezone.now()`, but this module never
#        imported `timezone` -> NameError.
#      - `validate_login_attempt()` called `attempt.is_locked()`, but `is_locked`
#        is a BooleanField, not a method -> TypeError. The real predicate is
#        `is_currently_locked()`.
#      - `record_failed_attempt()` called `FailedLoginAttempt.record_failure()`,
#        which does not exist. The model defines `record_attempt()`.
#    So this was never working protection that regressed; it had never run.
#
# 2. Repairing it would have created a SECOND, competing lockout implementation.
#    Cycle 3 wired real brute-force protection into the live endpoint
#    (`LoginView` in apps/authentication/views.py, finding H-8), covered by
#    apps/authentication/tests/test_login_bruteforce.py. Keeping a parallel copy
#    here - with its own separate 5-attempt / 15-minute constants, free to drift
#    from the enforced ones - is exactly the duplicate-definition hazard this
#    cycle spent its time eliminating elsewhere in this app.
#
# The lockout thresholds now live in settings (`LOGIN_MAX_ATTEMPTS`) and the
# progressive lock schedule lives on the `FailedLoginAttempt` model, which is the
# single place that behaviour is defined.
