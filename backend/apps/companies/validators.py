# apps/companies/validators.py
"""
Validators for Company domain models.

Validators encapsulate reusable validation rules.
"""
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from .models import Company, CompanyPreference, CompanySettings, CompanyStatus


class CompanyValidator:
    """Validators for Company model."""

    # Valid currencies (ISO 4217 subset)
    VALID_CURRENCIES = {"MAD", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "SAR", "AED"}

    # Valid languages (ISO 639-1)
    VALID_LANGUAGES = {"fr", "en", "ar", "es", "de", "it", "pt", "zh", "ru"}

    def validate_create(self, data: dict) -> None:
        """Validate company creation data."""
        errors = {}

        # Required fields
        if not data.get("name"):
            errors["name"] = _("Company name is required.")

        if data.get("name") and len(data["name"]) > 255:
            errors["name"] = _("Company name must be 255 characters or fewer.")

        # Optional but validated fields
        if data.get("trade_name") and len(data["trade_name"]) > 255:
            errors["trade_name"] = _("Trade name must be 255 characters or fewer.")

        if data.get("registration_number"):
            if len(data["registration_number"]) > 100:
                errors["registration_number"] = _(
                    "Registration number must be 100 characters or fewer."
                )

        if data.get("tax_id"):
            if len(data["tax_id"]) > 100:
                errors["tax_id"] = _("Tax ID must be 100 characters or fewer.")

        if data.get("vat_number"):
            if len(data["vat_number"]) > 100:
                errors["vat_number"] = _("Identifiant Commun de l'Entreprise must be 100 characters or fewer.")

        if data.get("email") and len(data["email"]) > 254:
            errors["email"] = _("Email must be 254 characters or fewer.")

        if data.get("phone") and len(data["phone"]) > 50:
            errors["phone"] = _("Phone must be 50 characters or fewer.")

        if data.get("website") and len(data["website"]) > 200:
            errors["website"] = _("Website must be 200 characters or fewer.")

        if data.get("default_currency") and data["default_currency"] not in self.VALID_CURRENCIES:
            errors["default_currency"] = _(
                f"Invalid currency. Must be one of: {', '.join(sorted(self.VALID_CURRENCIES))}"
            )

        if data.get("default_language") and data["default_language"] not in self.VALID_LANGUAGES:
            errors["default_language"] = _(
                f"Invalid language. Must be one of: {', '.join(sorted(self.VALID_LANGUAGES))}"
            )

        if data.get("status") and data["status"] not in CompanyStatus.values:
            errors["status"] = _(
                f"Invalid status. Must be one of: {', '.join(CompanyStatus.values)}"
            )

        if errors:
            raise ValidationError(errors)

    def validate_update(self, company: Company, data: dict) -> None:
        """Validate company update data."""
        errors = {}

        # Cannot change reference
        if "reference" in data:
            errors["reference"] = _("Company reference cannot be changed.")

        if "name" in data and data["name"]:
            if len(data["name"]) > 255:
                errors["name"] = _("Company name must be 255 characters or fewer.")

        if "trade_name" in data and data["trade_name"] and len(data["trade_name"]) > 255:
            errors["trade_name"] = _("Trade name must be 255 characters or fewer.")

        if "registration_number" in data and data["registration_number"]:
            if len(data["registration_number"]) > 100:
                errors["registration_number"] = _(
                    "Registration number must be 100 characters or fewer."
                )

        if "tax_id" in data and data["tax_id"]:
            if len(data["tax_id"]) > 100:
                errors["tax_id"] = _("Tax ID must be 100 characters or fewer.")

        if "vat_number" in data and data["vat_number"]:
            if len(data["vat_number"]) > 100:
                errors["vat_number"] = _("Identifiant Commun de l'Entreprise must be 100 characters or fewer.")

        if "email" in data and data["email"] and len(data["email"]) > 254:
            errors["email"] = _("Email must be 254 characters or fewer.")

        if "default_currency" in data and data["default_currency"] not in self.VALID_CURRENCIES:
            errors["default_currency"] = _("Invalid currency.")

        if "default_language" in data and data["default_language"] not in self.VALID_LANGUAGES:
            errors["default_language"] = _("Invalid language.")

        if "status" in data and data["status"] not in CompanyStatus.values:
            errors["status"] = _("Invalid status.")

        if errors:
            raise ValidationError(errors)

    def validate_archive(self, company, user=None) -> None:
        """Validate company can be archived."""
        if company.is_archived:
            raise ValidationError(_("Company is already archived."))

        # Check for active dependencies
        # This would check for active financial records, open transactions, etc.
        # Implementation depends on other apps being available

    def validate_restore(self, company) -> None:
        """Validate company can be restored."""
        if not company.is_archived:
            raise ValidationError(_("Company is not archived."))

    def validate_permanent_delete(self, company) -> None:
        """Validate company can be permanently deleted."""
        if not company.is_archived:
            raise ValidationError(_("Only archived companies can be permanently deleted."))

        # Check for active dependencies
        # Would check for financial records, transactions, etc.

    def validate(self, company: Company) -> None:
        """Full model validation."""
        errors = {}

        if company.name and len(company.name) > 255:
            errors["name"] = _("Name too long.")

        if company.trade_name and len(company.trade_name) > 255:
            errors["trade_name"] = _("Trade name too long.")

        if company.default_currency not in self.VALID_CURRENCIES:
            errors["default_currency"] = _("Invalid currency.")

        if company.default_language not in self.VALID_LANGUAGES:
            errors["default_language"] = _("Invalid language.")

        if company.status not in CompanyStatus.values:
            errors["status"] = _("Invalid status.")

        if errors:
            raise ValidationError(errors)


class CompanySettingsValidator:
    """Validators for CompanySettings."""

    def validate(self, settings: CompanySettings) -> None:
        """Validate company settings."""
        errors = {}

        if settings.default_record_type and len(settings.default_record_type) > 100:
            errors["default_record_type"] = _("Record type too long.")

        if settings.record_reference_prefix and len(settings.record_reference_prefix) > 20:
            errors["record_reference_prefix"] = _(
                "Record reference prefix too long (max 20 chars)."
            )

        if (
            settings.transaction_reference_prefix
            and len(settings.transaction_reference_prefix) > 20
        ):
            errors["transaction_reference_prefix"] = _(
                "Transaction reference prefix too long (max 20 chars)."
            )

        if errors:
            raise ValidationError(errors)


class CompanyPreferenceValidator:
    """Validators for CompanyPreference."""

    VALID_TYPES = {"string", "integer", "decimal", "boolean", "json"}

    def validate(self, preference: CompanyPreference) -> None:
        """Validate a company preference."""
        errors = {}

        if not preference.key:
            errors["key"] = _("Preference key is required.")
        elif len(preference.key) > 100:
            errors["key"] = _("Key must be 100 characters or fewer.")

        if preference.key and not preference.key.replace("_", "").replace("-", "").isalnum():
            errors["key"] = _(
                "Key must contain only alphanumeric characters, underscores, and hyphens."
            )

        if preference.preference_type not in self.VALID_TYPES:
            errors["preference_type"] = _(
                f"Invalid type. Must be one of: {', '.join(self.VALID_TYPES)}"
            )

        # Validate value matches type
        if preference.preference_type == "integer":
            try:
                int(preference.value)
            except (ValueError, TypeError):
                errors["value"] = _("Value must be a valid integer.")

        elif preference.preference_type == "decimal":
            try:
                Decimal(preference.value)
            except (InvalidOperation, TypeError):
                errors["value"] = _("Value must be a valid decimal number.")

        elif preference.preference_type == "boolean":
            if preference.value.lower() not in ("true", "false", "1", "0", "yes", "no"):
                errors["value"] = _("Value must be a valid boolean (true/false).")

        elif preference.preference_type == "json":
            import json

            try:
                json.loads(preference.value)
            except (json.JSONDecodeError, TypeError):
                errors["value"] = _("Value must be valid JSON.")

        if errors:
            raise ValidationError(errors)
