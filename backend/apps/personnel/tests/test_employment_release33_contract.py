"""Cycle 33 Employment API contract and interval regressions."""

from datetime import date, timedelta

from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.configuration.models import PaymentMethod
from apps.personnel.tests.factories import (
    create_test_company,
    create_test_person,
    create_test_user,
)

URL = "/api/v1/personnel/employments/"


class EmploymentRelease33ContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = create_test_user(email="employment-r33@example.test")
        role, _ = Group.objects.get_or_create(name="Administrator")
        self.user.groups.add(role)
        self.client.force_authenticate(self.user)
        self.company = create_test_company(name="Atlas Demo SARL", user=self.user)
        self.person = create_test_person(
            first_name="Amina", last_name="El Idrissi", cin="AB123456", user=self.user
        )
        self.payment_method = PaymentMethod.objects.create(
            name="Bank Transfer R33", kind="bank_transfer", created_by=self.user
        )
        self.hire_date = date.today() - timedelta(days=30)

    def payload(self, **overrides):
        data = {
            "person": str(self.person.id),
            "company": str(self.company.id),
            "employee_reference": "ATL-EMP-0001",
            "job_title": "Junior Accountant",
            "department": "Finance",
            "work_domain": "Accounting",
            "work_city": "Casablanca",
            "contract_type": "permanent",
            "employment_status": "active",
            "hire_date": self.hire_date.isoformat(),
            "employment_end_date": "",
            "payment_method": "",
            "rib": "MA64011519000001234567890123",
            "default_monthly_working_days": 26,
            "observations": "Architecture regression fixture",
        }
        data.update(overrides)
        return data

    def test_exact_browser_payload_without_payment_method_returns_201(self):
        response = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data["payment_method"])

    def test_exact_browser_payload_with_payment_method_uuid_returns_201(self):
        response = self.client.post(
            URL, self.payload(payment_method=str(self.payment_method.id)), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(str(response.data["payment_method"]), str(self.payment_method.id))

    def test_payment_method_label_is_a_field_specific_400(self):
        response = self.client.post(
            URL, self.payload(payment_method="Bank Transfer R33"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("payment_method", response.data["errors"])

    def test_cdd_requires_an_end_date(self):
        response = self.client.post(URL, self.payload(contract_type="fixed_term"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("employment_end_date", response.data["errors"])

    def test_cdd_accepts_a_future_end_date(self):
        end = date.today() + timedelta(days=365)
        response = self.client.post(
            URL,
            self.payload(contract_type="fixed_term", employment_end_date=end.isoformat()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_end_date_must_be_strictly_after_hire_date(self):
        response = self.client.post(
            URL, self.payload(employment_end_date=self.hire_date.isoformat()), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("employment_end_date", response.data["errors"])

    def test_overlapping_same_company_is_a_readable_400(self):
        first = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        response = self.client.post(
            URL, self.payload(employee_reference="ATL-EMP-0002"), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data["errors"])

    def test_patch_excludes_the_current_employment_from_overlap(self):
        created = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        response = self.client.patch(
            f"{URL}{created.data['id']}/", {"job_title": "Accountant"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_same_dates_at_a_different_company_are_allowed(self):
        first = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        other = create_test_company(name="Horizon Demo SARL", user=self.user)
        response = self.client.post(
            URL,
            self.payload(company=str(other.id), employee_reference="HOR-EMP-0001"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_archived_person_cannot_be_selected(self):
        self.person.archive(user=self.user)
        response = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("person", response.data["errors"])

    def test_response_contains_fields_needed_by_the_edit_form(self):
        response = self.client.post(URL, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        for field in (
            "payment_method",
            "rib",
            "default_monthly_working_days",
            "default_cnss_declared_days",
            "observations",
        ):
            self.assertIn(field, response.data)
