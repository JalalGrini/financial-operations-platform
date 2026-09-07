# apps/companies/tests/test_managers.py
"""
Tests for Company managers and querysets.
"""
from django.test import TestCase

from apps.accounts.models import User
from apps.companies.models import Company, CompanySettings


class CompanyManagerTests(TestCase):
    """Tests for CompanyManager and CompanyQuerySet."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_active_manager_filters_archived(self):
        """Test ActiveManager excludes archived companies."""
        active = Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        qs = Company.objects.all()
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), active)

    def test_all_objects_includes_archived(self):
        """Test all_objects manager includes archived."""
        Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        qs = Company.all_objects.all()
        self.assertEqual(qs.count(), 2)

    def test_with_settings_select_related(self):
        """Test with_settings queryset optimization."""
        company = Company.objects.create(name="Test", created_by=self.user)
        CompanySettings.objects.create(company=company, created_by=self.user)
        Company.objects.create(name="Test2", created_by=self.user)
        CompanySettings.objects.create(
            company=Company.objects.get(name="Test2"), created_by=self.user
        )

        qs = Company.objects.with_settings()
        self.assertEqual(qs.count(), 2)
        # Verify no additional queries for settings
        with self.assertNumQueries(1):
            for c in qs:
                _ = c.settings  # Should not hit DB

    def test_with_preferences_prefetch(self):
        """Test with_preferences queryset optimization."""
        company = Company.objects.create(name="Test", created_by=self.user)
        company.preferences.create(key="test", value="value", created_by=self.user)

        qs = Company.objects.with_preferences()
        with self.assertNumQueries(2):  # 1 for companies, 1 for preferences
            for c in qs:
                list(c.preferences.all())

    def test_active_with_relations(self):
        """Test active_with_relations queryset."""
        Company.objects.create(name="Active", created_by=self.user)
        archived = Company.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)

        qs = Company.objects.active_with_relations()
        self.assertEqual(qs.count(), 1)

    def test_search(self):
        """Test search functionality."""
        Company.objects.create(
            name="ABC Company",
            trade_name="ABC Trade",
            tax_id="12345",
            created_by=self.user,
        )
        Company.objects.create(
            name="XYZ Corp",
            trade_name="XYZ",
            tax_id="67890",
            created_by=self.user,
        )

        results = Company.objects.search("ABC")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().name, "ABC Company")

        results = Company.objects.search("12345")
        self.assertEqual(results.count(), 1)

        results = Company.objects.search("Trade")
        self.assertEqual(results.count(), 1)

    def test_get_by_tax_id(self):
        """Test get_by_tax_id case insensitive."""
        company = Company.objects.create(
            name="Test",
            tax_id="TAX123",
            created_by=self.user,
        )
        found = Company.objects.get_by_tax_id("tax123")
        self.assertEqual(found, company)

    def test_get_by_registration_number(self):
        """Test get_by_registration_number case insensitive."""
        company = Company.objects.create(
            name="Test",
            registration_number="REG456",
            created_by=self.user,
        )
        found = Company.objects.get_by_registration_number("reg456")
        self.assertEqual(found, company)
