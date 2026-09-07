# apps/companies/tests/test_services.py
"""
Tests for Company domain services.

Tests cover:
- CompanyService: create, update, archive, restore, delete
- CompanySettingsService: update settings
- CompanyPreferenceService: get/set/delete preferences
- CompanyStatusService: status transitions
"""
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.companies.models import (
    Company,
    CompanyPreference,
    CompanySettings,
    CompanyStatus,
)
from apps.companies.services import (
    CompanyPreferenceService,
    CompanyService,
    CompanySettingsService,
    CompanyStatusService,
)
from apps.companies.validators import (
    CompanyValidator,
)


class CompanyServiceTests(TestCase):
    """Tests for CompanyService."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.service = CompanyService()
        self.validator = CompanyValidator()

    def test_create_company_minimal(self):
        """Test creating company with minimal data."""
        company = self.service.create_company(
            data={
                "name": "New Company",
            },
            user=self.user,
        )
        self.assertEqual(company.name, "New Company")
        self.assertTrue(company.reference.startswith("CMP-"))
        self.assertEqual(company.status, CompanyStatus.ACTIVE)
        self.assertEqual(company.created_by, self.user)

    def test_create_company_full_data(self):
        """Test creating company with full data."""
        data = {
            "name": "Full Company",
            "trade_name": "FC",
            "email": "contact@fc.com",
            "phone": "+212 5 22 00 00 00",
            "address": "123 Main St",
            "default_currency": "EUR",
            "default_language": "en",
            "timezone": "Europe/Paris",
            "status": CompanyStatus.INACTIVE,
        }
        company = self.service.create_company(data=data, user=self.user)
        self.assertEqual(company.trade_name, "FC")
        self.assertEqual(company.email, "contact@fc.com")
        self.assertEqual(company.default_currency, "EUR")
        self.assertEqual(company.default_language, "en")
        self.assertEqual(company.timezone, "Europe/Paris")
        self.assertEqual(company.status, CompanyStatus.INACTIVE)

    def test_create_company_generates_settings(self):
        """Test company creation also creates settings."""
        company = self.service.create_company(
            data={"name": "Test"},
            user=self.user,
        )
        settings = CompanySettings.objects.filter(company=company).first()
        self.assertIsNotNone(settings)
        self.assertEqual(settings.company, company)

    def test_create_company_generates_preferences(self):
        """Test company creation generates default preferences."""
        company = self.service.create_company(
            data={"name": "Test"},
            user=self.user,
        )
        prefs = CompanyPreference.objects.filter(company=company)
        self.assertGreater(prefs.count(), 0)
        # Check for expected default preferences
        keys = prefs.values_list("key", flat=True)
        self.assertIn("dashboard_widgets", keys)
        self.assertIn("default_page_size", keys)

    def test_update_company(self):
        """Test updating company."""
        company = Company.objects.create(name="Original", created_by=self.user)
        updated = self.service.update_company(
            company=company,
            data={"name": "Updated", "phone": "+212 5 00 00 00 00"},
            user=self.user,
        )
        self.assertEqual(updated.name, "Updated")
        self.assertEqual(updated.phone, "+212 5 00 00 00 00")
        self.assertEqual(updated.updated_by, self.user)

    def test_update_company_preserves_reference(self):
        """Test update doesn't change reference."""
        company = Company.objects.create(name="Test", created_by=self.user)
        original_ref = company.reference
        self.service.update_company(company, {"name": "New Name"}, user=self.user)
        company.refresh_from_db()
        self.assertEqual(company.reference, original_ref)

    def test_archive_company(self):
        """Test archiving company."""
        company = Company.objects.create(name="To Archive", created_by=self.user)
        archived = self.service.archive_company(company, user=self.user)
        self.assertTrue(archived.is_archived)
        self.assertEqual(archived.archived_by, self.user)
        self.assertIsNotNone(archived.archived_at)

    def test_archive_company_with_reason(self):
        """Test archiving with reason stores preference."""
        company = Company.objects.create(name="Test", created_by=self.user)
        self.service.archive_company(company, user=self.user, reason="No longer active")
        pref = CompanyPreference.objects.filter(company=company, key="archive_reason").first()
        self.assertIsNotNone(pref)
        self.assertEqual(pref.get_typed_value(), "No longer active")

    def test_restore_company(self):
        """Test restoring archived company."""
        company = Company.objects.create(name="Test", created_by=self.user)
        company.archive(user=self.user)
        restored = self.service.restore_company(company, user=self.user)
        self.assertFalse(restored.is_archived)
        self.assertIsNone(restored.archived_at)
        self.assertIsNone(restored.archived_by)

    def test_permanent_delete_requires_confirmation(self):
        """Test permanent delete requires confirmation."""
        company = Company.objects.create(name="Test", created_by=self.user)
        with self.assertRaises(ValueError):
            self.service.permanent_delete(company, user=self.user, confirmation=False)

    def test_permanent_delete(self):
        """Test permanent delete."""
        company = Company.objects.create(name="To Delete", created_by=self.user)
        company.archive(user=self.user)  # Must archive first
        company_id = company.id
        self.service.permanent_delete(company, user=self.user, confirmation=True)
        self.assertFalse(Company.all_objects.filter(id=company_id).exists())


class CompanySettingsServiceTests(TestCase):
    """Tests for CompanySettingsService."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test", created_by=self.user)
        self.service = CompanySettingsService()

    def test_update_settings(self):
        """Test updating company settings."""
        settings = self.service.update_settings(
            company=self.company,
            data={
                "auto_validate_records": True,
                "auto_approve_records": False,
                "require_payment_confirmation": True,
            },
            user=self.user,
        )
        self.assertTrue(settings.auto_validate_records)
        self.assertFalse(settings.auto_approve_records)
        self.assertTrue(settings.require_payment_confirmation)

    def test_update_settings_creates_if_missing(self):
        """Test update creates settings if they don't exist."""
        CompanySettings.objects.filter(company=self.company).delete()
        settings = self.service.update_settings(
            company=self.company,
            data={"auto_validate_records": True},
            user=self.user,
        )
        self.assertIsNotNone(settings)
        self.assertTrue(settings.auto_validate_records)

    def test_update_settings_preserves_unchanged(self):
        """Test update preserves fields not in data."""
        CompanySettings.objects.create(
            company=self.company,
            auto_validate_records=True,
            auto_approve_records=True,
        )
        updated = self.service.update_settings(
            company=self.company,
            data={"auto_validate_records": False},
            user=self.user,
        )
        self.assertFalse(updated.auto_validate_records)
        self.assertTrue(updated.auto_approve_records)


class CompanyPreferenceServiceTests(TestCase):
    """Tests for CompanyPreferenceService."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test", created_by=self.user)
        self.service = CompanyPreferenceService()

    def test_set_string_preference(self):
        """Test setting string preference."""
        pref = self.service.set_preference(
            company=self.company,
            key="test_string",
            value="hello world",
            preference_type="string",
            user=self.user,
        )
        self.assertEqual(pref.get_typed_value(), "hello world")

    def test_set_integer_preference(self):
        """Test setting integer preference."""
        pref = self.service.set_preference(
            company=self.company,
            key="page_size",
            value=50,
            preference_type="integer",
            user=self.user,
        )
        self.assertEqual(pref.get_typed_value(), 50)

    def test_set_decimal_preference(self):
        """Test setting decimal preference."""
        pref = self.service.set_preference(
            company=self.company,
            key="tax_rate",
            value=Decimal("12.50"),
            preference_type="decimal",
            user=self.user,
        )
        self.assertEqual(pref.get_typed_value(), Decimal("12.50"))

    def test_set_boolean_preference(self):
        """Test setting boolean preference."""
        pref = self.service.set_preference(
            company=self.company,
            key="feature_on",
            value=True,
            preference_type="boolean",
            user=self.user,
        )
        self.assertTrue(pref.get_typed_value())

        # Update to false
        pref = self.service.set_preference(
            company=self.company,
            key="feature_on",
            value=False,
            preference_type="boolean",
            user=self.user,
        )
        self.assertFalse(pref.get_typed_value())

    def test_set_json_preference(self):
        """Test setting JSON preference."""
        pref = self.service.set_preference(
            company=self.company,
            key="config",
            value={"enabled": True, "items": [1, 2, 3]},
            preference_type="json",
            user=self.user,
        )
        value = pref.get_typed_value()
        self.assertIsInstance(value, dict)
        self.assertTrue(value["enabled"])
        self.assertEqual(value["items"], [1, 2, 3])

    def test_get_preference(self):
        """Test getting preference."""
        self.service.set_preference(
            company=self.company,
            key="existing",
            value="value",
            user=self.user,
        )
        pref = self.service.get_preference(self.company, "existing")
        self.assertIsNotNone(pref)
        self.assertEqual(pref.get_typed_value(), "value")

    def test_get_typed_value(self):
        """Test getting typed value directly."""
        self.service.set_preference(
            company=self.company,
            key="num",
            value=100,
            preference_type="integer",
            user=self.user,
        )
        value = self.service.get_typed_value(self.company, "num")
        self.assertEqual(value, 100)

    def test_get_typed_value_missing_returns_default(self):
        """Test missing preference returns default."""
        value = self.service.get_typed_value(self.company, "missing", default="default")
        self.assertEqual(value, "default")

    def test_delete_preference(self):
        """Test deleting (archiving) preference."""
        self.service.set_preference(
            company=self.company,
            key="to_delete",
            value="value",
            user=self.user,
        )
        result = self.service.delete_preference(self.company, "to_delete", user=self.user)
        self.assertTrue(result)
        pref = CompanyPreference.all_objects.filter(company=self.company, key="to_delete").first()
        self.assertTrue(pref.is_archived)

    def test_delete_system_preference_fails(self):
        """Test deleting system preference fails."""
        CompanyPreference.objects.create(
            company=self.company,
            key="system_pref",
            value="value",
            is_system=True,
        )
        result = self.service.delete_preference(self.company, "system_pref", user=self.user)
        self.assertFalse(result)

    def test_bulk_set_preferences(self):
        """Test setting multiple preferences at once."""
        prefs = {
            "key1": {"value": "val1", "type": "string"},
            "key2": {"value": 42, "type": "integer"},
            "key3": {"value": True, "type": "boolean"},
        }
        results = self.service.bulk_set_preferences(self.company, prefs, user=self.user)
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0].get_typed_value(), "val1")
        self.assertEqual(results[1].get_typed_value(), 42)
        self.assertTrue(results[2].get_typed_value())


class CompanyStatusServiceTests(TestCase):
    """Tests for CompanyStatusService."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test", created_by=self.user)
        self.service = CompanyStatusService()

    def test_valid_transitions(self):
        """Test valid status transitions."""
        transitions = {
            CompanyStatus.ACTIVE: [CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED],
            CompanyStatus.INACTIVE: [CompanyStatus.ACTIVE],
            CompanyStatus.SUSPENDED: [CompanyStatus.ACTIVE, CompanyStatus.ARCHIVED],
            CompanyStatus.ARCHIVED: [CompanyStatus.ACTIVE],
        }
        for current, valid in transitions.items():
            for valid_status in valid:
                self.assertTrue(
                    self.service.can_transition(current, valid_status),
                    f"Should allow {current} -> {valid_status}",
                )

    def test_invalid_transitions(self):
        """Test invalid status transitions."""
        invalid = [
            (CompanyStatus.ACTIVE, CompanyStatus.ARCHIVED),
            (CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED),
            (CompanyStatus.INACTIVE, CompanyStatus.ARCHIVED),
        ]
        for current, new in invalid:
            self.assertFalse(
                self.service.can_transition(current, new), f"Should not allow {current} -> {new}"
            )

    def test_change_status_valid(self):
        """Test valid status change."""
        self.company.status = CompanyStatus.ACTIVE
        self.company.save()
        updated = self.service.change_status(self.company, CompanyStatus.INACTIVE, user=self.user)
        self.assertEqual(updated.status, CompanyStatus.INACTIVE)

    def test_change_status_invalid_raises(self):
        """Test invalid status change raises error."""
        self.company.status = CompanyStatus.ACTIVE
        self.company.save()
        with self.assertRaises(ValueError):
            self.service.change_status(self.company, CompanyStatus.ARCHIVED, user=self.user)
