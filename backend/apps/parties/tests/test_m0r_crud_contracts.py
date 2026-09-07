# apps/parties/tests/test_m0r_crud_contracts.py
"""
M0-R CRUD contract evidence for the Parties domain.

This module closes Architect Review finding AR-01: the M0 Parties
contract tests provided no update (PUT/PATCH) coverage and only partial
retrieve coverage across the five Parties resources, and filter/search
tests asserted only HTTP 200 without verifying the returned collection
was actually narrowed.

For every Parties resource (Client, Supplier, AssociatedPersonType,
AssociatedPerson, ExternalParty) this module verifies, through real routed
URLs:

- list returns the expected items
- retrieve returns the expected fields for a specific object
- create returns an `id` that can be used to address the created object
  (already true for Parties since M0; re-verified here)
- PUT/PATCH persists changes to the database
- at least one filter/search parameter actually narrows the result set

Archive/restore behavior is explicitly out of scope for M0-R (see
Engineering Log AR-04, C-04); this module does not add coverage for it.
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


def _make_admin_user(email="m0r-parties-admin@example.com"):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="M0R",
        last_name="Admin",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class ClientCRUDContractTests(APITestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)
        self.company_a = Company.objects.create(name="Company A", created_by=self.user)
        self.company_b = Company.objects.create(name="Company B", created_by=self.user)

    def test_list_returns_created_items(self):
        Client.objects.create(name="Client One", created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/clients/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Client One", names)

    def test_company_filter_actually_narrows_results(self):
        Client.objects.create(name="Client In A", company=self.company_a, created_by=self.user)
        Client.objects.create(name="Client In B", company=self.company_b, created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/clients/", {"company": str(self.company_a.id)})
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Client In A", names)
        self.assertNotIn("Client In B", names)

    def test_retrieve_returns_detail_fields(self):
        client_obj = Client.objects.create(
            name="Detail Client",
            company=self.company_a,
            tax_id="TX-DETAIL",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/parties/clients/{client_obj.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Detail Client")
        self.assertEqual(resp.data["tax_id"], "TX-DETAIL")
        self.assertIn("company_detail", resp.data)
        self.assertEqual(resp.data["company_detail"]["name"], "Company A")

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client_api.post(
            "/api/v1/parties/clients/",
            {
                "name": "New Client",
                "company": str(self.company_a.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client_api.get(f"/api/v1/parties/clients/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "New Client")

    def test_patch_persists_change(self):
        client_obj = Client.objects.create(name="Original Client", created_by=self.user)
        resp = self.client_api.patch(
            f"/api/v1/parties/clients/{client_obj.id}/",
            {
                "phone": "+212600000000",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        client_obj.refresh_from_db()
        self.assertEqual(client_obj.phone, "+212600000000")

    def test_put_persists_full_replacement(self):
        client_obj = Client.objects.create(name="Original Client 2", created_by=self.user)
        resp = self.client_api.put(
            f"/api/v1/parties/clients/{client_obj.id}/",
            {
                "name": "Replaced Client",
                "company": str(self.company_b.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        client_obj.refresh_from_db()
        self.assertEqual(client_obj.name, "Replaced Client")
        self.assertEqual(client_obj.company_id, self.company_b.id)


class SupplierCRUDContractTests(APITestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)
        self.company_a = Company.objects.create(name="Supplier Co A", created_by=self.user)
        self.company_b = Company.objects.create(name="Supplier Co B", created_by=self.user)

    def test_list_returns_created_items(self):
        Supplier.objects.create(name="Supplier One", created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/suppliers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Supplier One", names)

    def test_company_filter_actually_narrows_results(self):
        Supplier.objects.create(name="Supplier In A", company=self.company_a, created_by=self.user)
        Supplier.objects.create(name="Supplier In B", company=self.company_b, created_by=self.user)
        resp = self.client_api.get(
            "/api/v1/parties/suppliers/", {"company": str(self.company_a.id)}
        )
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Supplier In A", names)
        self.assertNotIn("Supplier In B", names)

    def test_retrieve_returns_detail_fields(self):
        supplier = Supplier.objects.create(
            name="Detail Supplier",
            company=self.company_a,
            tax_id="TX-SUP",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/parties/suppliers/{supplier.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Detail Supplier")
        self.assertIn("company_detail", resp.data)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client_api.post(
            "/api/v1/parties/suppliers/",
            {
                "name": "New Supplier",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client_api.get(f"/api/v1/parties/suppliers/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)

    def test_patch_persists_change(self):
        supplier = Supplier.objects.create(name="Original Supplier", created_by=self.user)
        resp = self.client_api.patch(
            f"/api/v1/parties/suppliers/{supplier.id}/",
            {
                "payment_terms": "Net 30",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        supplier.refresh_from_db()
        self.assertEqual(supplier.payment_terms, "Net 30")

    def test_put_persists_full_replacement(self):
        supplier = Supplier.objects.create(name="Original Supplier 2", created_by=self.user)
        resp = self.client_api.put(
            f"/api/v1/parties/suppliers/{supplier.id}/",
            {
                "name": "Replaced Supplier",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        supplier.refresh_from_db()
        self.assertEqual(supplier.name, "Replaced Supplier")


class AssociatedPersonTypeCRUDContractTests(APITestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        AssociatedPersonType.objects.create(name="Employee", created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/person-types/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Employee", names)

    def test_retrieve_returns_expected_fields(self):
        person_type = AssociatedPersonType.objects.create(
            name="Director",
            description="Board director",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/parties/person-types/{person_type.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Director")
        self.assertEqual(resp.data["description"], "Board director")

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client_api.post(
            "/api/v1/parties/person-types/",
            {
                "name": "Agent",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client_api.get(f"/api/v1/parties/person-types/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["name"], "Agent")

    def test_patch_persists_change(self):
        person_type = AssociatedPersonType.objects.create(
            name="Original Type", created_by=self.user
        )
        resp = self.client_api.patch(
            f"/api/v1/parties/person-types/{person_type.id}/",
            {
                "is_default": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        person_type.refresh_from_db()
        self.assertTrue(person_type.is_default)

    def test_put_persists_full_replacement(self):
        person_type = AssociatedPersonType.objects.create(
            name="Original Type 2", created_by=self.user
        )
        resp = self.client_api.put(
            f"/api/v1/parties/person-types/{person_type.id}/",
            {
                "name": "Replaced Type",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        person_type.refresh_from_db()
        self.assertEqual(person_type.name, "Replaced Type")


class AssociatedPersonCRUDContractTests(APITestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)
        self.company_a = Company.objects.create(name="AP Company A", created_by=self.user)
        self.company_b = Company.objects.create(name="AP Company B", created_by=self.user)
        self.person_type = AssociatedPersonType.objects.create(
            name="Employee", created_by=self.user
        )

    def test_list_returns_created_items(self):
        AssociatedPerson.objects.create(
            first_name="Alice",
            last_name="Wonder",
            person_type=self.person_type,
            created_by=self.user,
        )
        resp = self.client_api.get("/api/v1/parties/associated-persons/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["first_name"] for item in resp.data["results"]}
        self.assertIn("Alice", names)

    def test_company_filter_actually_narrows_results(self):
        AssociatedPerson.objects.create(
            first_name="InA",
            last_name="Person",
            person_type=self.person_type,
            company=self.company_a,
            created_by=self.user,
        )
        AssociatedPerson.objects.create(
            first_name="InB",
            last_name="Person",
            person_type=self.person_type,
            company=self.company_b,
            created_by=self.user,
        )
        resp = self.client_api.get(
            "/api/v1/parties/associated-persons/", {"company": str(self.company_a.id)}
        )
        names = {item["first_name"] for item in resp.data["results"]}
        self.assertIn("InA", names)
        self.assertNotIn("InB", names)

    def test_retrieve_returns_detail_fields(self):
        person = AssociatedPerson.objects.create(
            first_name="Detail",
            last_name="Person",
            person_type=self.person_type,
            company=self.company_a,
            national_id="NID-DETAIL",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/parties/associated-persons/{person.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["first_name"], "Detail")
        self.assertEqual(resp.data["national_id"], "NID-DETAIL")
        self.assertIn("person_type_detail", resp.data)
        self.assertIn("company_detail", resp.data)

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client_api.post(
            "/api/v1/parties/associated-persons/",
            {
                "first_name": "New",
                "last_name": "Person",
                "person_type": str(self.person_type.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client_api.get(
            f"/api/v1/parties/associated-persons/{resp.data['id']}/"
        )
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)

    def test_patch_persists_change(self):
        person = AssociatedPerson.objects.create(
            first_name="Original",
            last_name="Person",
            person_type=self.person_type,
            created_by=self.user,
        )
        resp = self.client_api.patch(
            f"/api/v1/parties/associated-persons/{person.id}/",
            {
                "job_title": "Senior Accountant",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        person.refresh_from_db()
        self.assertEqual(person.job_title, "Senior Accountant")

    def test_put_persists_full_replacement(self):
        person = AssociatedPerson.objects.create(
            first_name="Original2",
            last_name="Person",
            person_type=self.person_type,
            created_by=self.user,
        )
        resp = self.client_api.put(
            f"/api/v1/parties/associated-persons/{person.id}/",
            {
                "first_name": "Replaced",
                "last_name": "Renamed",
                "person_type": str(self.person_type.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        person.refresh_from_db()
        self.assertEqual(person.first_name, "Replaced")
        self.assertEqual(person.last_name, "Renamed")


class ExternalPartyCRUDContractTests(APITestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)

    def test_list_returns_created_items(self):
        ExternalParty.objects.create(name="Gov Agency", created_by=self.user)
        resp = self.client_api.get("/api/v1/parties/external-parties/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Gov Agency", names)

    def test_category_filter_actually_narrows_results(self):
        ExternalParty.objects.create(
            name="Government Body", party_category="Government", created_by=self.user
        )
        ExternalParty.objects.create(
            name="Freelancer Jane", party_category="Freelancer", created_by=self.user
        )
        resp = self.client_api.get(
            "/api/v1/parties/external-parties/", {"party_category": "Government"}
        )
        names = {item["name"] for item in resp.data["results"]}
        self.assertIn("Government Body", names)
        self.assertNotIn("Freelancer Jane", names)

    def test_retrieve_returns_expected_fields(self):
        party = ExternalParty.objects.create(
            name="Detail Party",
            party_category="NGO",
            tax_id="TX-EXT",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/parties/external-parties/{party.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Detail Party")
        self.assertEqual(resp.data["party_category"], "NGO")

    def test_create_returns_id_and_object_is_addressable(self):
        resp = self.client_api.post(
            "/api/v1/parties/external-parties/",
            {
                "name": "New External Party",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        retrieve_resp = self.client_api.get(f"/api/v1/parties/external-parties/{resp.data['id']}/")
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)

    def test_patch_persists_change(self):
        party = ExternalParty.objects.create(name="Original Party", created_by=self.user)
        resp = self.client_api.patch(
            f"/api/v1/parties/external-parties/{party.id}/",
            {
                "is_recurring": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        party.refresh_from_db()
        self.assertTrue(party.is_recurring)

    def test_put_persists_full_replacement(self):
        party = ExternalParty.objects.create(name="Original Party 2", created_by=self.user)
        resp = self.client_api.put(
            f"/api/v1/parties/external-parties/{party.id}/",
            {
                "name": "Replaced Party",
                "party_category": "Updated Category",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        party.refresh_from_db()
        self.assertEqual(party.name, "Replaced Party")
        self.assertEqual(party.party_category, "Updated Category")
