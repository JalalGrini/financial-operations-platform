# apps/parties/tests/test_api_contracts.py
"""
API contract regression tests for the Parties domain.

These tests characterize EFOP Engineering Log finding C-03: Parties
serializers and viewsets referenced fields and relationships (e.g.
`Client.legal_name/city/postal_code/country`, `AssociatedPersonType.company`,
`AssociatedPerson.tax_id/city/position`, `ExternalParty.company/party_type`)
that do not exist on the current models or migrations.

They lock the corrected, model-accurate contract. `AssociatedPerson.company`
is intentionally preserved (migration-confirmed). `AssociatedPersonType` and
`ExternalParty` intentionally do NOT get a `company` field added here -- see
Engineering Log Open Question 7 ("Party company scope"), deferred beyond M0.
"""
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.companies.models import Company
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ExternalParty,
    Supplier,
)
from apps.parties.serializers import (
    AssociatedPersonCreateSerializer,
    AssociatedPersonSerializer,
    AssociatedPersonTypeCreateSerializer,
    AssociatedPersonTypeSerializer,
    ClientCreateSerializer,
    ClientSerializer,
    ExternalPartyCreateSerializer,
    ExternalPartySerializer,
    SupplierCreateSerializer,
    SupplierSerializer,
)


def _make_admin_user():
    user = User.objects.create_user(
        email="parties-admin@example.com",
        password="testpass123",
        first_name="Parties",
        last_name="Admin",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class SerializerInstantiationTests(APITestCase):
    """Every Parties serializer must construct against a real model instance."""

    def setUp(self):
        self.user = _make_admin_user()
        self.company = Company.objects.create(name="Acme Corp", created_by=self.user)
        self.person_type = AssociatedPersonType.objects.create(
            name="Employee", created_by=self.user
        )

    def test_client_serializer_instantiates(self):
        client = Client.objects.create(
            name="Client One", company=self.company, created_by=self.user
        )
        data = ClientSerializer(client).data
        self.assertEqual(data["name"], "Client One")
        self.assertIn("trade_name", data)
        self.assertIn("registration_number", data)
        for stale in [
            "legal_name",
            "city",
            "postal_code",
            "country",
            "full_address",
            "is_tax_exempt",
        ]:
            self.assertNotIn(stale, data)

    def test_client_create_serializer_valid(self):
        serializer = ClientCreateSerializer(data={"name": "New Client"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_supplier_serializer_instantiates(self):
        supplier = Supplier.objects.create(
            name="Supplier One", company=self.company, created_by=self.user
        )
        data = SupplierSerializer(supplier).data
        self.assertEqual(data["name"], "Supplier One")
        for stale in [
            "legal_name",
            "city",
            "postal_code",
            "country",
            "full_address",
            "account_number",
            "bank_name",
            "bank_bic",
            "iban",
            "is_tax_exempt",
        ]:
            self.assertNotIn(stale, data)

    def test_supplier_create_serializer_valid(self):
        serializer = SupplierCreateSerializer(data={"name": "New Supplier"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_associated_person_type_serializer_instantiates(self):
        data = AssociatedPersonTypeSerializer(self.person_type).data
        self.assertEqual(data["name"], "Employee")
        # AssociatedPersonType has no company relationship (deferred decision).
        self.assertNotIn("company", data)
        self.assertNotIn("is_active", data)
        self.assertIn("status", data)

    def test_associated_person_type_create_serializer_valid(self):
        serializer = AssociatedPersonTypeCreateSerializer(data={"name": "Director"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_associated_person_serializer_instantiates(self):
        person = AssociatedPerson.objects.create(
            first_name="Jane",
            last_name="Doe",
            person_type=self.person_type,
            company=self.company,
            created_by=self.user,
        )
        data = AssociatedPersonSerializer(person).data
        self.assertEqual(data["first_name"], "Jane")
        # company is preserved -- migration-confirmed relationship.
        self.assertEqual(str(data["company"]), str(self.company.id))
        self.assertIn("national_id", data)
        for stale in ["tax_id", "city", "postal_code", "country", "is_active", "position"]:
            self.assertNotIn(stale, data)

    def test_associated_person_create_serializer_valid(self):
        serializer = AssociatedPersonCreateSerializer(
            data={
                "first_name": "John",
                "last_name": "Smith",
                "person_type": self.person_type.id,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_external_party_serializer_instantiates(self):
        party = ExternalParty.objects.create(name="Occasional Vendor", created_by=self.user)
        data = ExternalPartySerializer(party).data
        self.assertEqual(data["name"], "Occasional Vendor")
        # ExternalParty has no company relationship (deferred decision).
        self.assertNotIn("company", data)
        for stale in ["party_type", "city", "country", "notes"]:
            self.assertNotIn(stale, data)
        self.assertIn("party_category", data)

    def test_external_party_create_serializer_valid(self):
        serializer = ExternalPartyCreateSerializer(data={"name": "One-off Vendor"})
        self.assertTrue(serializer.is_valid(), serializer.errors)


class RoutedEndpointSmokeTests(APITestCase):
    """Representative list/retrieve/create/filter smoke tests via real routes."""

    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)
        self.company = Company.objects.create(name="Acme Corp", created_by=self.user)
        self.person_type = AssociatedPersonType.objects.create(
            name="Employee", created_by=self.user
        )

    def test_clients_list_search_and_filter(self):
        Client.objects.create(
            name="Alpha Client", company=self.company, tax_id="TX001", created_by=self.user
        )
        resp = self.client_api.get("/api/v1/parties/clients/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get("/api/v1/parties/clients/", {"search": "Alpha"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get("/api/v1/parties/clients/", {"company": str(self.company.id)})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_clients_create_and_retrieve(self):
        resp = self.client_api.post(
            "/api/v1/parties/clients/",
            {
                "name": "Beta Client",
                "company": str(self.company.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        client_id = resp.data["id"]
        resp = self.client_api.get(f"/api/v1/parties/clients/{client_id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("company_detail", resp.data)

    def test_clients_search_action(self):
        Client.objects.create(name="Gamma Client", created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/clients/search/", {"q": "Gamma"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_suppliers_list_and_create(self):
        Supplier.objects.create(name="Alpha Supplier", company=self.company, created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/suppliers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.post(
            "/api/v1/parties/suppliers/",
            {
                "name": "Beta Supplier",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_associated_persons_list_search_and_filter(self):
        AssociatedPerson.objects.create(
            first_name="Alice",
            last_name="Wonder",
            person_type=self.person_type,
            company=self.company,
            national_id="NID001",
            created_by=self.user,
        )
        resp = self.client_api.get("/api/v1/parties/associated-persons/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get("/api/v1/parties/associated-persons/", {"search": "Alice"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get(
            "/api/v1/parties/associated-persons/", {"company": str(self.company.id)}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get(
            "/api/v1/parties/associated-persons/", {"person_type": str(self.person_type.id)}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_associated_persons_create_and_retrieve(self):
        resp = self.client_api.post(
            "/api/v1/parties/associated-persons/",
            {
                "first_name": "Bob",
                "last_name": "Builder",
                "person_type": str(self.person_type.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        person_id = resp.data["id"]
        resp = self.client_api.get(f"/api/v1/parties/associated-persons/{person_id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("person_type_detail", resp.data)

    def test_person_types_list_and_create(self):
        resp = self.client_api.get("/api/v1/parties/person-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.post(
            "/api/v1/parties/person-types/",
            {
                "name": "Contractor",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_external_parties_list_create_and_search(self):
        ExternalParty.objects.create(
            name="Gov Agency", party_category="Government", created_by=self.user
        )
        resp = self.client_api.get("/api/v1/parties/external-parties/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.get(
            "/api/v1/parties/external-parties/", {"party_category": "Government"}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client_api.post(
            "/api/v1/parties/external-parties/",
            {
                "name": "Freelancer Jane",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        resp = self.client_api.get("/api/v1/parties/external-parties/search/", {"q": "Gov"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_client_archive(self):
        client = Client.objects.create(name="ToArchive", created_by=self.user)
        resp = self.client_api.post(f"/api/v1/parties/clients/{client.id}/archive/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        client.refresh_from_db()
        self.assertTrue(client.is_archived)
        # NOTE: restore is not exercised here for the same reason documented
        # in apps/configuration/tests/test_api_contracts.py -- see EFOP
        # Engineering Log C-04, deferred to M3.
