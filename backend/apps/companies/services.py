# apps/companies/services.py
"""
Services for Company domain models.

Services encapsulate business logic and state changes.
They use selectors for reads and perform writes within atomic transactions.
"""
import json

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from .models import (
    Company,
    CompanyPreference,
    CompanySettings,
    CompanyStatus,
)
from .selectors import CompanyPreferenceSelector, CompanySelector, CompanySettingsSelector
from .validators import CompanyPreferenceValidator, CompanySettingsValidator, CompanyValidator


class CompanyService:
    """Service layer for Company operations."""

    def __init__(self):
        self.validator = CompanyValidator()
        self.selector = CompanySelector()

    @transaction.atomic
    def create_company(self, data: dict, user=None) -> Company:
        """
        Create a new company with settings and default preferences.

        Args:
            data: Company data dictionary
            user: User creating the company

        Returns:
            Created Company instance
        """
        self.validator.validate_create(data)

        company = Company.objects.create(
            name=data["name"],
            trade_name=data.get("trade_name", ""),
            registration_number=data.get("registration_number", ""),
            tax_id=data.get("tax_id", ""),
            vat_number=data.get("vat_number", ""),
            email=data.get("email", ""),
            phone=data.get("phone", ""),
            address=data.get("address", ""),
            website=data.get("website", ""),
            default_currency=data.get("default_currency", "MAD"),
            default_language=data.get("default_language", "fr"),
            timezone=data.get("timezone", "Africa/Casablanca"),
            status=data.get("status", CompanyStatus.ACTIVE),
            created_by=user,
            updated_by=user,
        )

        # Create default settings
        CompanySettings.objects.create(
            company=company,
            created_by=user,
            updated_by=user,
        )

        # Create default preferences
        self._create_default_preferences(company, user)

        return company

    @transaction.atomic
    def update_company(self, company: Company, data: dict, user=None) -> Company:
        """
        Update an existing company.

        Args:
            company: Company to update
            data: Fields to update
            user: User performing the update

        Returns:
            Updated Company instance
        """
        self.validator.validate_update(company, data)

        # Fields that cannot be changed
        immutable_fields = {"id", "reference", "created_at", "created_by"}
        for field in immutable_fields:
            data.pop(field, None)

        for field, value in data.items():
            if hasattr(company, field):
                setattr(company, field, value)

        company.updated_by = user
        company.save()

        return company

    @transaction.atomic
    def archive_company(self, company: Company, user=None, reason: str = "") -> Company:
        """
        Archive a company (soft delete).

        Args:
            company: Company to archive
            user: User performing the archive
            reason: Optional reason for archiving

        Returns:
            Archived Company instance
        """
        self.validator.validate_archive(company, user)

        company.archive(user=user)

        if reason:
            CompanyPreferenceService().set_preference(company, "archive_reason", reason, user=user)

        return company

    @transaction.atomic
    def restore_company(self, company: Company, user=None) -> Company:
        """
        Restore an archived company.

        Args:
            company: Company to restore
            user: User performing the restore

        Returns:
            Restored Company instance
        """
        self.validator.validate_restore(company)
        company.restore()
        company.updated_by = user
        company.save(
            update_fields=["is_archived", "archived_at", "archived_by", "updated_by", "updated_at"]
        )
        return company

    @transaction.atomic
    def permanent_delete_company(
        self, company: Company, user=None, confirmation: bool = False
    ) -> None:
        """
        Permanently delete a company.

        Args:
            company: Company to delete
            user: User performing deletion
            confirmation: Must be True to confirm deletion
        """
        if not confirmation:
            raise ValueError(_("Permanent deletion requires explicit confirmation."))

        # Archive first if not already archived. This must happen BEFORE
        # validate_permanent_delete(), which requires is_archived=True - the
        # two calls used to be in the opposite order, which meant this
        # auto-archive branch was unreachable dead code: a non-archived
        # company always failed validation before ever getting archived
        # (found while wiring decision C-5's permanent-delete route in
        # Cycle 17; see state/IMPLEMENTATION_PLAN.md Section 11).
        if not company.is_archived:
            company.archive(user=user)

        self.validator.validate_permanent_delete(company)

        # Log the deletion for audit (would integrate with AuditLogService)
        # AuditLogService().log_deletion(company, user)

        company.delete()

    # Alias for backward compatibility with tests
    permanent_delete = permanent_delete_company

    def _create_default_preferences(self, company: Company, user=None):
        """Create default preferences for a new company."""
        defaults = {
            "dashboard_widgets": ("json", '["balance", "recent_transactions", "pending_reports"]'),
            "default_page_size": ("integer", "20"),
            "date_format": ("string", "DD/MM/YYYY"),
            "number_format": ("string", "1 234,56"),
            "time_format": ("string", "HH:mm"),
            "first_day_of_week": ("integer", "1"),  # Monday
            "auto_refresh_interval": ("integer", "30000"),
        }

        for key, (pref_type, value) in defaults.items():
            CompanyPreference.objects.create(
                company=company,
                key=key,
                value=value,
                preference_type=pref_type,
                is_system=True,
                created_by=user,
                updated_by=user,
            )


class CompanySettingsService:
    """Service for CompanySettings operations."""

    def __init__(self):
        self.validator = CompanySettingsValidator()
        self.selector = CompanySettingsSelector()

    @transaction.atomic
    def update_settings(self, company: Company, data: dict, user=None) -> CompanySettings:
        """
        Update company settings.

        Args:
            company: Company instance
            data: Settings data to update
            user: User performing the update

        Returns:
            Updated CompanySettings instance
        """
        settings, _ = CompanySettings.objects.get_or_create(
            company=company,
            defaults={"created_by": user, "updated_by": user},
        )

        if not _:
            settings.updated_by = user

        # Allowed fields for update
        allowed_fields = [
            "default_record_type",
            "auto_validate_records",
            "auto_approve_records",
            "require_payment_confirmation",
            "default_payment_method",
            "allow_internal_transfers",
            "require_transfer_approval",
            "record_reference_prefix",
            "transaction_reference_prefix",
            "notify_on_payment",
            "notify_on_transfer",
            "notify_on_report_generated",
            "assistants_can_manage_records",
            "assistants_can_manage_parties",
            "assistants_can_create_transfers",
        ]

        for field in allowed_fields:
            if field in data:
                setattr(settings, field, data[field])

        settings.updated_by = user
        settings.save()

        self.validator.validate(settings)
        return settings


class CompanyPreferenceService:
    """Service for CompanyPreference operations."""

    def __init__(self):
        self.validator = CompanyPreferenceValidator()
        self.selector = CompanyPreferenceSelector()

    @transaction.atomic
    def set_preference(
        self,
        company: Company,
        key: str,
        value,
        preference_type: str = "string",
        description: str = "",
        is_system: bool = False,
        user=None,
    ) -> CompanyPreference:
        """
        Set a preference value.

        Args:
            company: Company instance
            key: Preference key
            value: Value to store (converted to string)
            preference_type: One of 'string', 'integer', 'decimal', 'boolean', 'json'
            description: Optional description
            is_system: Whether this is a system preference
            user: User setting the preference

        Returns:
            Created or updated CompanyPreference
        """
        # Convert value to string based on type
        if preference_type == "json":
            str_value = json.dumps(value)
        elif preference_type == "boolean":
            str_value = "true" if value else "false"
        else:
            str_value = str(value)

        preference, created = CompanyPreference.objects.update_or_create(
            company=company,
            key=key,
            defaults={
                "value": str_value,
                "preference_type": preference_type,
                "description": description,
                "is_system": is_system,
                "updated_by": user,
                "is_archived": False,
                "archived_at": None,
                "archived_by": None,
            },
        )

        if created:
            preference.created_by = user
            preference.save(update_fields=["created_by"])

        self.validator.validate(preference)
        return preference

    @transaction.atomic
    def get_preference(self, company: Company, key: str) -> CompanyPreference | None:
        """Get a preference by key."""
        return CompanyPreference.objects.filter(company=company, key=key, is_archived=False).first()

    @transaction.atomic
    def get_typed_value(self, company: Company, key: str, default=None):
        """Get a preference value cast to its proper type."""
        pref = self.get_preference(company, key)
        if pref:
            return pref.get_typed_value()
        return default

    @transaction.atomic
    def delete_preference(self, company: Company, key: str, user=None) -> bool:
        """Delete (archive) a preference."""
        preference = self.get_preference(company, key)
        if preference and not preference.is_system:
            preference.archive(user)
            return True
        return False

    @transaction.atomic
    def bulk_set_preferences(
        self, company: Company, preferences: dict, user=None
    ) -> list[CompanyPreference]:
        """
        Set multiple preferences at once.

        Args:
            company: Company instance
            preferences: Dict of key -> {value, type, description, is_system}
            user: User setting the preferences

        Returns:
            List of created/updated preferences
        """
        results = []
        for key, config in preferences.items():
            pref = self.set_preference(
                company=company,
                key=key,
                value=config.get("value"),
                preference_type=config.get("type", "string"),
                description=config.get("description", ""),
                is_system=config.get("is_system", False),
                user=user,
            )
            results.append(pref)
        return results


class CompanyStatusService:
    """Service for company status transitions."""

    # Valid status transitions
    TRANSITIONS = {
        CompanyStatus.ACTIVE: [CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED],
        CompanyStatus.INACTIVE: [CompanyStatus.ACTIVE],
        CompanyStatus.SUSPENDED: [CompanyStatus.ACTIVE, CompanyStatus.ARCHIVED],
        CompanyStatus.ARCHIVED: [CompanyStatus.ACTIVE],  # Restore
    }

    @staticmethod
    def get_valid_transitions(current_status: CompanyStatus) -> list[CompanyStatus]:
        """Get valid next statuses for a given status."""
        return CompanyStatusService.TRANSITIONS.get(current_status, [])

    @staticmethod
    def can_transition(current: CompanyStatus, new: CompanyStatus) -> bool:
        """Check if status transition is valid."""
        return new in CompanyStatusService.get_valid_transitions(current)

    @transaction.atomic
    def change_status(self, company: Company, new_status: CompanyStatus, user=None) -> Company:
        """
        Change company status with validation.

        Args:
            company: Company instance
            new_status: New status to set
            user: User performing the change

        Returns:
            Updated Company instance
        """
        if not self.can_transition(company.status, new_status):
            raise ValueError(f"Invalid status transition from {company.status} to {new_status}")

        company.status = new_status
        company.updated_by = user
        company.save(update_fields=["status", "updated_by", "updated_at"])
        return company
