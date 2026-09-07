# apps/personnel/tests/test_cycle31_contracts.py
"""
Cycle 31/32 contract regression tests.

These lock the wire contracts the frontend depends on, so a regression fails
CI immediately instead of surfacing as a mystery 400/500 or invisible records:

- archive visibility: ``?is_archived=true|false|absent`` on the personnel list,
- ``is_archived`` exposed read-only in the personnel list serializer (the
  frontend gates Archive vs Restore on it),
- employment creation accepts exactly the frontend's payload shape (no hidden
  required field) and rejects overlapping periods with a readable 400 error
  payload (``errors`` key) that the frontend now surfaces in toasts,
- reusing an archived person's CIN is a readable 400, never a raw 500
  (the DB unique constraint covers archived rows too),
- the personnel dashboard exposes ``archivedPersonnel``,
- financial records accept reusable client/supplier party links.

Run: ``pytest apps/personnel/tests/test_cycle31_contracts.py -q``
"""

from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.parties.models import Client
from apps.personnel.tests.factories import (
    create_test_company,
    create_test_employment,
    create_test_person,
    create_test_user,
)

PERSONS_URL = "/api/v1/personnel/persons/"
EMPLOYMENTS_URL = "/api/v1/personnel/employments/"
DASHBOARD_URL = "/api/v1/personnel/reports/dashboard/"
RECORDS_URL = "/api/v1/financial-records/records/"


def _admin(user):
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class ArchiveVisibilityContractTests(APITestCase):
    """An archived record must never become unreachable (Cycle 31 UX bug)."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)

    def test_archived_person_hidden_by_default_and_listed_with_flag(self):
        person = create_test_person(user=self.user)
        person.archive(user=self.user)

        default_resp = self.client.get(PERSONS_URL)
        self.assertEqual(default_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(default_resp.json()["count"], 0)

        archived_resp = self.client.get(PERSONS_URL, {"is_archived": "true"})
        self.assertEqual(archived_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(archived_resp.json()["count"], 1)
        row = archived_resp.json()["results"][0]
        self.assertEqual(row["id"], str(person.id))
        # is_archived must be exposed — the frontend gates Archive vs Restore on it
        self.assertTrue(row["is_archived"])

        active_resp = self.client.get(PERSONS_URL, {"is_archived": "false"})
        self.assertEqual(active_resp.json()["count"], 0)

    def test_restore_returns_person_to_default_list(self):
        person = create_test_person(user=self.user)
        person.archive(user=self.user)

        restore_resp = self.client.post(f"{PERSONS_URL}{person.id}/restore/")
        self.assertEqual(restore_resp.status_code, status.HTTP_200_OK)

        default_resp = self.client.get(PERSONS_URL)
        self.assertEqual(default_resp.json()["count"], 1)
        self.assertFalse(default_resp.json()["results"][0]["is_archived"])

    def test_duplicate_cin_on_archived_person_is_400_not_500(self):
        """Cycle 32: the DB unique constraint on cin covers archived rows too,
        so reusing an archived person's CIN must be a readable 400 — never a
        raw IntegrityError 500."""
        person = create_test_person(user=self.user, cin="XY123456")
        person.archive(user=self.user)

        resp = self.client.post(
            PERSONS_URL,
            {"first_name": "New", "last_name": "Person", "cin": "XY123456"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", resp.json())


class EmploymentCreateContractTests(APITestCase):
    """The frontend employment form payload must be accepted as-is (400 fix)."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)

    def test_create_with_exact_frontend_payload(self):
        """Exactly what the React form sends (empty strings for blanks)."""
        payload = {
            "person": str(self.person.id),
            "company": str(self.company.id),
            "employee_reference": "EMP-001",
            "job_title": "",
            "department": "",
            "work_domain": "",
            "work_city": "",
            "contract_type": "permanent",
            "employment_status": "active",
            "hire_date": "2026-08-01",
            "employment_end_date": "",
            "payment_method": "",
            "rib": "",
            "default_monthly_working_days": 26,
            "observations": "",
        }
        resp = self.client.post(EMPLOYMENTS_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.json())

    def test_overlap_returns_readable_400_with_errors_key(self):
        """A second overlapping employment at the same company must 400 with
        an errors payload the frontend can display (not a silent failure)."""
        create_test_employment(person=self.person, company=self.company, user=self.user)
        resp = self.client.post(
            EMPLOYMENTS_URL,
            {
                "person": str(self.person.id),
                "company": str(self.company.id),
                "hire_date": "2026-08-01",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        body = resp.json()
        self.assertIn("errors", body)
        self.assertTrue(body["errors"])  # non-empty — the UI has something to show


class DashboardContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)

    def test_dashboard_exposes_archived_personnel(self):
        person = create_test_person(user=self.user)
        person.archive(user=self.user)
        resp = self.client.get(DASHBOARD_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["data"]
        self.assertIn("archivedPersonnel", data)
        self.assertEqual(data["archivedPersonnel"], 1)
        # active counts exclude archived by design
        self.assertEqual(data["totalPersonnel"], 0)


class FinancialRecordPartyContractTests(APITestCase):
    """Records link to reusable clients/suppliers (blueprint Section 11)."""

    def setUp(self):
        self.client = APIClient()
        self.user = _admin(create_test_user())
        self.client.force_authenticate(user=self.user)
        self.company = Company.objects.create(name="C31 Co", created_by=self.user)
        self.record_type = FinancialRecordType.objects.create(
            name="C31 Invoice", created_by=self.user
        )
        self.client_party = Client.objects.create(
            company=self.company, name="C31 Client", created_by=self.user
        )

    def test_record_accepts_client_link_and_exposes_name(self):
        resp = self.client.post(
            RECORDS_URL,
            {
                "company": str(self.company.id),
                "record_type": str(self.record_type.id),
                "record_date": "2026-08-10",
                "description": "Invoice with a linked client",
                "client": str(self.client_party.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.json())
        data = resp.json()
        self.assertEqual(data["client"], str(self.client_party.id))
        self.assertEqual(data["client_name"], "C31 Client")
