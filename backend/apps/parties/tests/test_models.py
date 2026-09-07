# apps/parties/tests/test_models.py
"""
Tests for Party domain models.

Tests cover:
- AssociatedPersonType
- Client
- Supplier
- AssociatedPerson
- ExternalParty
- Archive/restore behavior
- Reference generation
- Managers and querysets
"""
import uuid

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.accounts.models import User
from apps.companies.models import Company
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    AssociatedPersonTypeStatus,
    Client,
    ExternalParty,
    PartyStatus,
    Supplier,
)


class AssociatedPersonTypeModelTests(TestCase):
    """Tests for AssociatedPersonType model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_person_type(self):
        """Test creating a person type."""
        person_type = AssociatedPersonType.objects.create(
            name="Employee",
            description="Full-time employee",
            created_by=self.user,
        )
        self.assertIsInstance(person_type.id, uuid.UUID)
        self.assertTrue(person_type.reference.startswith("APT-"))
        self.assertEqual(person_type.status, AssociatedPersonTypeStatus.ACTIVE)

    def test_person_type_reference_format(self):
        """Test person type reference follows APT-YYYY-NNNNN format."""
        person_type = AssociatedPersonType.objects.create(
            name="Director",
            created_by=self.user,
        )
        import re

        pattern = r"^APT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, person_type.reference))

    def test_person_type_unique_name(self):
        """Test person type name is unique."""
        AssociatedPersonType.objects.create(name="Employee", created_by=self.user)
        with self.assertRaises(Exception):
            AssociatedPersonType.objects.create(name="Employee", created_by=self.user)

    def test_person_type_default_single(self):
        """Test only one default person type allowed."""
        AssociatedPersonType.objects.create(name="Employee", is_default=True, created_by=self.user)
        AssociatedPersonType.objects.create(name="Director", is_default=True, created_by=self.user)
        defaults = AssociatedPersonType.objects.filter(is_default=True)
        self.assertEqual(defaults.count(), 1)
        self.assertEqual(defaults.first().name, "Director")

    def test_person_type_archive_restore(self):
        """Test archive and restore."""
        person_type = AssociatedPersonType.objects.create(name="Employee", created_by=self.user)
        person_type.archive(user=self.user)
        self.assertTrue(person_type.is_archived)
        person_type.restore()
        self.assertFalse(person_type.is_archived)


class ClientModelTests(TestCase):
    """Tests for Client model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test Company", created_by=self.user)

    def test_create_client(self):
        """Test creating a client."""
        client = Client.objects.create(
            name="Test Client",
            trade_name="TC",
            email="client@test.com",
            phone="+212 5 22 00 00 00",
            address="123 Test St, Casablanca",
            default_currency="MAD",
            created_by=self.user,
        )
        self.assertIsInstance(client.id, uuid.UUID)
        self.assertTrue(client.reference.startswith("CLI-"))
        self.assertEqual(client.status, PartyStatus.ACTIVE)

    def test_client_reference_format(self):
        """Test client reference follows CLI-YYYY-NNNNN format."""
        client = Client.objects.create(name="Test", created_by=self.user)
        import re

        pattern = r"^CLI-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, client.reference))

    def test_client_unique_reference(self):
        """Test client reference is unique."""
        Client.objects.create(name="Client 1", created_by=self.user)
        Client.objects.create(name="Client 2", created_by=self.user)
        refs = Client.objects.values_list("reference", flat=True)
        self.assertEqual(len(refs), len(set(refs)))

    def test_client_str(self):
        """Test string representation."""
        client = Client.objects.create(name="Test Client", created_by=self.user)
        self.assertIn(client.reference, str(client))
        self.assertIn("Test Client", str(client))

    def test_client_archive_restore(self):
        """Test archive and restore."""
        client = Client.objects.create(name="Test", created_by=self.user)
        client.archive(user=self.user)
        self.assertTrue(client.is_archived)
        client.restore()
        self.assertFalse(client.is_archived)

    def test_client_active_manager(self):
        """Test ActiveManager excludes archived."""
        Client.objects.create(name="Active", created_by=self.user)
        archived = Client.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)
        self.assertEqual(Client.objects.count(), 1)

    def test_client_company_link(self):
        """Test client company relationship."""
        client = Client.objects.create(name="Client", company=self.company, created_by=self.user)
        self.assertEqual(client.company, self.company)

    def test_client_validation(self):
        """Test client field validation."""
        client = Client(name="Test", default_currency="INVALID", created_by=self.user)
        with self.assertRaises(ValidationError):
            client.full_clean()


class SupplierModelTests(TestCase):
    """Tests for Supplier model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test Company", created_by=self.user)

    def test_create_supplier(self):
        """Test creating a supplier."""
        supplier = Supplier.objects.create(
            name="Test Supplier",
            email="supplier@test.com",
            phone="+212 5 22 00 00 00",
            address="456 Supplier Ave, Rabat",
            default_currency="MAD",
            created_by=self.user,
        )
        self.assertIsInstance(supplier.id, uuid.UUID)
        self.assertTrue(supplier.reference.startswith("SUP-"))

    def test_supplier_reference_format(self):
        """Test supplier reference follows SUP-YYYY-NNNNN format."""
        supplier = Supplier.objects.create(name="Test", created_by=self.user)
        import re

        pattern = r"^SUP-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, supplier.reference))

    def test_supplier_company_link(self):
        """Test supplier company relationship."""
        supplier = Supplier.objects.create(
            name="Supplier", company=self.company, created_by=self.user
        )
        self.assertEqual(supplier.company, self.company)

    def test_supplier_archive_restore(self):
        """Test archive and restore."""
        supplier = Supplier.objects.create(name="Test", created_by=self.user)
        supplier.archive(user=self.user)
        self.assertTrue(supplier.is_archived)
        supplier.restore()
        self.assertFalse(supplier.is_archived)


class AssociatedPersonModelTests(TestCase):
    """Tests for AssociatedPerson model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test Company", created_by=self.user)
        self.person_type = AssociatedPersonType.objects.create(
            name="Employee",
            is_default=True,
            created_by=self.user,
        )

    def test_create_associated_person(self):
        """Test creating an associated person."""
        person = AssociatedPerson.objects.create(
            first_name="John",
            last_name="Doe",
            email="john.doe@test.com",
            person_type=self.person_type,
            company=self.company,
            created_by=self.user,
        )
        self.assertIsInstance(person.id, uuid.UUID)
        self.assertTrue(person.reference.startswith("AP-"))
        self.assertEqual(person.get_full_name(), "John Doe")

    def test_associated_person_reference_format(self):
        """Test person reference follows AP-YYYY-NNNNN format."""
        person = AssociatedPerson.objects.create(
            first_name="John",
            last_name="Doe",
            person_type=self.person_type,
            created_by=self.user,
        )
        import re

        pattern = r"^AP-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, person.reference))

    def test_associated_person_user_link(self):
        """Test linking to User account."""
        linked_user = User.objects.create_user(
            email="linked@test.com",
            password="pass123",
            first_name="Linked",
            last_name="User",
        )
        person = AssociatedPerson.objects.create(
            first_name="Linked",
            last_name="User",
            person_type=self.person_type,
            user=linked_user,
            created_by=self.user,
        )
        self.assertEqual(person.user, linked_user)
        self.assertEqual(linked_user.associated_person, person)

    def test_associated_person_manager_hierarchy(self):
        """Test manager/subordinate relationship."""
        manager = AssociatedPerson.objects.create(
            first_name="Manager",
            last_name="One",
            person_type=self.person_type,
            created_by=self.user,
        )
        subordinate = AssociatedPerson.objects.create(
            first_name="Sub",
            last_name="Two",
            person_type=self.person_type,
            manager=manager,
            created_by=self.user,
        )
        self.assertEqual(subordinate.manager, manager)
        self.assertIn(subordinate, manager.subordinates.all())

    def test_associated_person_company_link(self):
        """Test company relationship."""
        person = AssociatedPerson.objects.create(
            first_name="John",
            last_name="Doe",
            person_type=self.person_type,
            company=self.company,
            created_by=self.user,
        )
        self.assertEqual(person.company, self.company)

    def test_associated_person_archive_restore(self):
        """Test archive and restore."""
        person = AssociatedPerson.objects.create(
            first_name="John",
            last_name="Doe",
            person_type=self.person_type,
            created_by=self.user,
        )
        person.archive(user=self.user)
        self.assertTrue(person.is_archived)
        person.restore()
        self.assertFalse(person.is_archived)


class ExternalPartyModelTests(TestCase):
    """Tests for ExternalParty model."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )

    def test_create_external_party(self):
        """Test creating an external party."""
        party = ExternalParty.objects.create(
            name="External Corp",
            party_category="Bank",
            email="contact@external.com",
            created_by=self.user,
        )
        self.assertIsInstance(party.id, uuid.UUID)
        self.assertTrue(party.reference.startswith("EXT-"))

    def test_external_party_reference_format(self):
        """Test external party reference follows EXT-YYYY-NNNNN format."""
        party = ExternalParty.objects.create(name="Test", created_by=self.user)
        import re

        pattern = r"^EXT-\d{4}-\d{5}$"
        self.assertTrue(re.match(pattern, party.reference))

    def test_external_party_archive_restore(self):
        """Test archive and restore."""
        party = ExternalParty.objects.create(name="Test", created_by=self.user)
        party.archive(user=self.user)
        self.assertTrue(party.is_archived)
        party.restore()
        self.assertFalse(party.is_archived)


class PartyManagerTests(TestCase):
    """Tests for Party managers and querysets."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(name="Test Company", created_by=self.user)
        self.person_type = AssociatedPersonType.objects.create(
            name="Employee", created_by=self.user
        )

    def test_client_active_manager(self):
        """Test Client ActiveManager."""
        Client.objects.create(name="Active", created_by=self.user)
        archived = Client.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)
        self.assertEqual(Client.objects.count(), 1)

    def test_supplier_active_manager(self):
        """Test Supplier ActiveManager."""
        Supplier.objects.create(name="Active", created_by=self.user)
        archived = Supplier.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)
        self.assertEqual(Supplier.objects.count(), 1)

    def test_associated_person_active_manager(self):
        """Test AssociatedPerson ActiveManager."""
        AssociatedPerson.objects.create(
            first_name="Active",
            last_name="User",
            person_type=self.person_type,
            created_by=self.user,
        )
        archived = AssociatedPerson.objects.create(
            first_name="Archived",
            last_name="User",
            person_type=self.person_type,
            created_by=self.user,
        )
        archived.archive(user=self.user)
        self.assertEqual(AssociatedPerson.objects.count(), 1)

    def test_external_party_active_manager(self):
        """Test ExternalParty ActiveManager."""
        ExternalParty.objects.create(name="Active", created_by=self.user)
        archived = ExternalParty.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)
        self.assertEqual(ExternalParty.objects.count(), 1)

    def test_all_objects_includes_archived(self):
        """Test all_objects manager includes archived."""
        Client.objects.create(name="Active", created_by=self.user)
        archived = Client.objects.create(name="Archived", created_by=self.user)
        archived.archive(user=self.user)
        self.assertEqual(Client.all_objects.count(), 2)

    def test_associated_person_type_default(self):
        """Test default person type manager."""
        AssociatedPersonType.objects.create(
            name="Employee Default", is_default=True, created_by=self.user
        )
        AssociatedPersonType.objects.create(name="Director", created_by=self.user)
        default = AssociatedPersonType.objects.filter(is_default=True).first()
        self.assertEqual(default.name, "Employee Default")

    def test_associated_person_type_default_unique(self):
        """Test only one default person type."""
        AssociatedPersonType.objects.create(
            name="Employee Unique", is_default=True, created_by=self.user
        )
        AssociatedPersonType.objects.create(
            name="Director Unique", is_default=True, created_by=self.user
        )
        defaults = AssociatedPersonType.objects.filter(is_default=True)
        self.assertEqual(defaults.count(), 1)
