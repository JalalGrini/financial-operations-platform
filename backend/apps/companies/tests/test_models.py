# apps/companies/tests/test_models.py
"""
Tests for Company domain models.

Tests cover:
- Company creation and validation
- UUID primary keys
- Reference generation
- Archive/restore behavior
- CompanySettings and CompanyPreference
- Managers and querysets
"""
import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.accounts.models import User
from apps.companies.models import (
    Company,
    CompanyPreference,
    CompanyPreferenceType,
    CompanySettings,
    CompanyStatus,
)


class CompanyModelTests(TestCase):
    """Tests for Company model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_company(self):
        """Test creating a company."""
        company = Company.objects.create(
            name="Test Company",
            trade_name="Test Co.",
            email="contact@test.com",
            phone="+212 5 22 00 00 00",
            address="123 Test St, Casablanca",
            default_currency="MAD",
            default_language="fr",
        )
        self.assertIsInstance(company.id, uuid.UUID)
        self.assertTrue(company.reference.startswith("CMP-"))
        self.assertEqual(company.status, CompanyStatus.ACTIVE)
        self.assertFalse(company.is_archived)
        self.assertIsNotNone(company.created_at)
        self.assertIsNotNone(company.updated_at)

    def test_company_reference_format(self):
        """Test company reference follows CMP-YYYY-NNNNN format."""
        company = Company.objects.create(
            name="Test Company",
        )
        import re

        pattern = r"^CMP-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, company.reference))

    def test_company_reference_unique(self):
        """Test company reference is unique."""
        Company.objects.create(name="Company 1", created_by=self.user)
        Company.objects.create(name="Company 2", created_by=self.user)
        refs = Company.objects.values_list("reference", flat=True)
        self.assertEqual(len(refs), len(set(refs)))

    def test_company_str_representation(self):
        """Test string representation."""
        company = Company.objects.create(
            name="Test Company",
        )
        self.assertIn(company.reference, str(company))
        self.assertIn("Test Company", str(company))

    def test_company_archive_restore(self):
        """Test archive and restore functionality."""
        company = Company.objects.create(
            name="Test Company",
        )
        self.assertFalse(company.is_archived)

        company.archive(user=self.user)
        self.assertTrue(company.is_archived)
        self.assertIsNotNone(company.archived_at)
        self.assertEqual(company.archived_by, self.user)

        company.restore()
        self.assertFalse(company.is_archived)
        self.assertIsNone(company.archived_at)
        self.assertIsNone(company.archived_by)

    def test_company_active_manager_excludes_archived(self):
        """Test ActiveManager excludes archived companies."""
        active = Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        active_qs = Company.objects.all()
        self.assertEqual(active_qs.count(), 1)
        self.assertEqual(active_qs.first(), active)

    def test_company_all_objects_includes_archived(self):
        """Test all_objects manager includes archived."""
        Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        all_qs = Company.all_objects.all()
        self.assertEqual(all_qs.count(), 2)

    def test_company_validation(self):
        """Test company validation."""
        # Test invalid currency
        company = Company(
            name="Test",
            default_currency="INVALID",
        )
        with self.assertRaises(ValidationError):
            company.full_clean()

        # Test invalid language
        company = Company(
            name="Test",
            default_currency="MAD",
            default_language="xx",
        )
        with self.assertRaises(ValidationError):
            company.full_clean()

    def test_company_email_validation(self):
        """Test email format validation."""
        company = Company(
            name="Test",
            email="invalid-email",
        )
        with self.assertRaises(ValidationError):
            company.full_clean()


class CompanySettingsTests(TestCase):
    """Tests for CompanySettings model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(
            name="Test Company",
        )

    def test_create_settings(self):
        """Test creating company settings."""
        settings = CompanySettings.objects.create(
            company=self.company,
            default_record_type="INV",
            auto_validate_records=True,
            require_payment_confirmation=False,
        )
        self.assertEqual(settings.company, self.company)
        self.assertTrue(settings.auto_validate_records)
        self.assertFalse(settings.require_payment_confirmation)

    def test_settings_str(self):
        """Test string representation."""
        settings = CompanySettings.objects.create(company=self.company)
        self.assertIn(self.company.reference, str(settings))

    def test_get_by_company_manager(self):
        """Test get_by_company manager method."""
        settings = CompanySettings.objects.get_by_company(self.company)
        self.assertEqual(settings.company, self.company)

    def test_settings_created_once(self):
        """Test get_by_company creates only one settings per company."""
        settings1 = CompanySettings.objects.get_by_company(self.company)
        settings2 = CompanySettings.objects.get_by_company(self.company)
        self.assertEqual(settings1.id, settings2.id)


class CompanyPreferenceTests(TestCase):
    """Tests for CompanyPreference model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(
            name="Test Company",
        )

    def test_create_string_preference(self):
        """Test creating a string preference."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="test_key",
            value="test_value",
            preference_type=CompanyPreferenceType.STRING,
        )
        self.assertEqual(pref.get_typed_value(), "test_value")

    def test_create_integer_preference(self):
        """Test creating an integer preference."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="page_size",
            value="25",
            preference_type=CompanyPreferenceType.INTEGER,
        )
        self.assertEqual(pref.get_typed_value(), 25)

    def test_create_decimal_preference(self):
        """Test creating a decimal preference."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="tax_rate",
            value="10.50",
            preference_type=CompanyPreferenceType.DECIMAL,
        )
        self.assertEqual(pref.get_typed_value(), Decimal("10.50"))

    def test_create_boolean_preference(self):
        """Test creating a boolean preference."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="feature_enabled",
            value="true",
            preference_type=CompanyPreferenceType.BOOLEAN,
        )
        self.assertTrue(pref.get_typed_value())

        pref.value = "false"
        pref.save()
        self.assertFalse(pref.get_typed_value())

    def test_create_json_preference(self):
        """Test creating a JSON preference."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="widget_config",
            value='{"enabled": true, "count": 5}',
            preference_type=CompanyPreferenceType.JSON,
        )
        value = pref.get_typed_value()
        self.assertIsInstance(value, dict)
        self.assertTrue(value["enabled"])
        self.assertEqual(value["count"], 5)

    def test_set_typed_value(self):
        """Test setting typed value."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="test",
            value="",
            preference_type=CompanyPreferenceType.INTEGER,
        )
        pref.set_typed_value(42)
        self.assertEqual(pref.value, "42")
        self.assertEqual(pref.get_typed_value(), 42)

    def test_preference_unique_per_company(self):
        """Test preference key is unique per company."""
        CompanyPreference.objects.create(
            company=self.company,
            key="test",
            value="1",
            preference_type=CompanyPreferenceType.STRING,
        )
        with self.assertRaises(Exception):
            CompanyPreference.objects.create(
                company=self.company,
                key="test",
                value="2",
                preference_type=CompanyPreferenceType.STRING,
            )

    def test_preference_same_key_different_companies(self):
        """Test same key allowed for different companies."""
        company2 = Company.objects.create(name="Company 2", created_by=self.user)
        CompanyPreference.objects.create(
            company=self.company,
            key="test",
            value="1",
            preference_type=CompanyPreferenceType.STRING,
        )
        pref2 = CompanyPreference.objects.create(
            company=company2,
            key="test",
            value="2",
            preference_type=CompanyPreferenceType.STRING,
        )
        self.assertEqual(pref2.value, "2")

    def test_preference_archive_restore(self):
        """Test preference archive/restore."""
        pref = CompanyPreference.objects.create(
            company=self.company,
            key="test",
            value="value",
            preference_type=CompanyPreferenceType.STRING,
        )
        pref.archive(user=self.user)
        self.assertTrue(pref.is_archived)

        pref.restore()
        self.assertFalse(pref.is_archived)

    def test_preference_manager_get_by_key(self):
        """Test manager get_by_key method."""
        CompanyPreference.objects.create(
            company=self.company,
            key="test_key",
            value="test_value",
            preference_type=CompanyPreferenceType.STRING,
        )
        pref = CompanyPreference.objects.get_by_key(self.company, "test_key")
        self.assertIsNotNone(pref)
        self.assertEqual(pref.value, "test_value")

    def test_preference_manager_get_all_values(self):
        """Test manager get_all_values returns typed dict."""
        CompanyPreference.objects.create(
            company=self.company,
            key="int_key",
            value="42",
            preference_type=CompanyPreferenceType.INTEGER,
        )
        CompanyPreference.objects.create(
            company=self.company,
            key="bool_key",
            value="true",
            preference_type=CompanyPreferenceType.BOOLEAN,
        )
        values = CompanyPreference.objects.get_all_values(self.company)
        self.assertEqual(values["int_key"], 42)
        self.assertTrue(values["bool_key"])


class CompanyManagerTests(TestCase):
    """Tests for Company managers and querysets."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_active_manager(self):
        """Test ActiveManager filters correctly."""
        Company.objects.create(name="Active 1", created_by=self.user)
        Company.objects.create(name="Active 2", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        active = Company.objects.all()
        self.assertEqual(active.count(), 2)

    def test_archived_manager(self):
        """Test ArchivedManager filters correctly."""
        Company.objects.create(name="Active")
        archived = Company.objects.create(name="Archived")
        archived.archive()

        archived_qs = Company.all_objects.filter(is_archived=True)
        self.assertEqual(archived_qs.count(), 1)

    def test_all_objects_manager(self):
        """Test all_objects manager includes both."""
        Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        all_qs = Company.all_objects.all()
        self.assertEqual(all_qs.count(), 2)

    def test_company_ordering(self):
        """Test default ordering by -created_at."""
        c1 = Company.objects.create(name="First", created_by=self.user)
        c2 = Company.objects.create(name="Second", created_by=self.user)
        companies = list(Company.objects.all())
        self.assertEqual(companies[0], c2)
        self.assertEqual(companies[1], c1)
