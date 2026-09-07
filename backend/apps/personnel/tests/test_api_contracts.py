# apps/personnel/tests/test_api_contracts.py
"""
API contract regression tests for entity-linking / relational form fixes.

These tests lock the wire contracts that the frontend depends on so that a
regression (a silently-dropped serializer field or a renamed response field)
fails CI immediately instead of causing silent data loss.
"""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.personnel.tests.factories import (
    create_test_cnss_declaration,
    create_test_company,
    create_test_employment,
    create_test_person,
    create_test_salary,
    create_test_user,
)


def _admin(user):
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class SelectEndpointContractTests(APITestCase):
    """Verify the /select/ endpoints return raw arrays (not wrapped dicts)."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)

    def test_personnel_persons_select_returns_raw_array(self):
        create_test_person(first_name="Alpha", last_name="One", cin="AA000001", user=self.user)
        create_test_person(first_name="Beta", last_name="Two", cin="BB000002", user=self.user)

        resp = self.client.get(reverse("personnel:personnel-person-select"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # Raw array contract (not {"results": [...]} and not paginated)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)
        required = {"id", "reference", "name", "cin"}
        for item in data:
            self.assertTrue(required.issubset(set(item.keys())), item)

    def test_personnel_select_filters_by_company(self):
        person_in = create_test_person(user=self.user)
        person_out = create_test_person(
            first_name="Out", last_name="Side", cin="CC000003", user=self.user
        )
        company = create_test_company(user=self.user)
        create_test_employment(person=person_in, company=company, user=self.user)

        resp = self.client.get(
            reverse("personnel:personnel-person-select"), {"company": company.id}
        )
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], str(person_in.id))
        self.assertNotIn(str(person_out.id), [item["id"] for item in data])

    def test_personnel_select_search(self):
        person = create_test_person(first_name="UniqueSearchable", last_name="Name", user=self.user)
        result = self.client.get(
            reverse("personnel:personnel-person-select"), {"search": "UniqueSearchable"}
        )
        data = result.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], str(person.id))

    def test_companies_select_returns_raw_array(self):
        create_test_company(name="ACME Select", user=self.user)
        resp = self.client.get("/api/v1/companies/select/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        for item in data:
            self.assertIn("id", item)
            self.assertIn("name", item)


class SalarySerializerContractTests(APITestCase):
    """Lock the EmploymentSalary serializer field contract used by the frontend."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)
        self.person = create_test_person(user=self.user)
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.employment.employee_reference = "EMP-CONTRACT-001"
        self.employment.save()
        self.salary = create_test_salary(employment=self.employment, user=self.user)

    def test_salary_serializer_exposes_linking_fields(self):
        url = reverse("personnel:employment-salary-list")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        payload = data["results"] if isinstance(data, dict) else data
        item = next(i for i in payload if i["id"] == str(self.salary.id))
        self.assertEqual(item["person"], str(self.person.id))
        self.assertEqual(item["person_name"], self.person.get_full_name())
        self.assertEqual(item["employment_reference"], "EMP-CONTRACT-001")
        self.assertEqual(item["company_name"], self.company.name)
        # Frontend uses fixed_monthly_gross_salary (NOT fixed_gross_salary)
        self.assertIn("fixed_monthly_gross_salary", item)
        self.assertEqual(Decimal(str(item["fixed_monthly_gross_salary"])), Decimal("50000.0000"))


class EmploymentDetailContractTests(APITestCase):
    """Lock the Employment detail serializer shape for the detail page."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)
        self.person = create_test_person(user=self.user)
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        create_test_salary(employment=self.employment, user=self.user)

    def test_employment_detail_uses_current_salary_and_employment_end_date(self):
        url = reverse("personnel:employment-detail", kwargs={"pk": self.employment.id})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # Renamed field contract (NOT active_salary / employment_finish_date)
        self.assertIn("current_salary", data)
        self.assertIn("employment_end_date", data)
        self.assertIn("salaries", data)
        self.assertIn("cnss_declarations", data)
        self.assertIn("payroll_records", data)
        # Deprecated/incorrect field names must NOT be present
        for bad in [
            "active_salary",
            "has_active_cnss",
            "active_cnss",
            "has_active_salary",
            "employment_finish_date",
            "fixed_gross_salary",
        ]:
            self.assertNotIn(bad, data)


class CNSSDetailContractTests(APITestCase):
    """Lock CNSS detail field names (monthly_declarations, notes, observations)."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)
        self.person = create_test_person(user=self.user)
        self.company = create_test_company(user=self.user)
        self.cnss = create_test_cnss_declaration(
            person=self.person, company=self.company, user=self.user
        )

    def test_cnss_detail_exposes_monthly_declarations(self):
        url = reverse("personnel:cnss-declaration-detail", kwargs={"pk": self.cnss.id})
        resp = self.client.get(url)
        data = resp.json()
        self.assertIn("monthly_declarations", data)
        self.assertNotIn("cnss_monthly_declarations", data)

    def test_cnss_list_includes_notes_and_observations(self):
        self.cnss.notes = "a note"
        self.cnss.observations = "an observation"
        self.cnss.save()
        resp = self.client.get(reverse("personnel:cnss-declaration-list"))
        data = resp.json()
        item = next(i for i in data["results"] if i["id"] == str(self.cnss.id))
        self.assertIn("notes", item)
        self.assertIn("observations", item)


class CompanyDefaultLanguageContractTests(APITestCase):
    """Verify Company serializer now accepts and returns default_language."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)

    def test_company_serializer_accepts_default_language(self):
        company = create_test_company(user=self.user)
        url = reverse("companies:company-detail", kwargs={"pk": company.id})
        resp = self.client.patch(url, {"default_language": "en"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["default_language"], "en")
        company.refresh_from_db()
        self.assertEqual(company.default_language, "en")
