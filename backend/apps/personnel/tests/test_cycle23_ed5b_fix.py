# apps/personnel/tests/test_cycle23_ed5b_fix.py
"""Regression test for the Cycle 23 fix (state/IMPLEMENTATION_PLAN.md
Section 17 / 16.5b): ED-5b, the personnel HR/CNSS dashboard
(`/api/v1/personnel/reports/dashboard/`) returned `0` for cnssDeclared,
notDeclared, and cnssOnly when called without a `company` filter, which is
indistinguishable from "genuinely zero" and violates the "omit or null,
never 0" rule established alongside the Executive Dashboard (Cycle 22).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.personnel.tests.factories import (
    create_test_cnss_declaration,
    create_test_company,
    create_test_employment,
    create_test_person,
)

User = get_user_model()

DASHBOARD_URL = "/api/v1/personnel/reports/dashboard/"


class Cycle23PersonnelDashboardNullNotZeroTests(APITestCase):
    """ED-5b: cnssDeclared/notDeclared/cnssOnly must be null (not 0) when no
    company filter is given, and must remain real counts when one is."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c23-ed5b-admin@example.com",
            password="testpass123",
            first_name="Cycle23",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)
        cls.company = create_test_company(user=cls.admin)

        # Give the company genuine CNSS-declared and not-declared employees so
        # a real (non-zero) count is available to distinguish from null.
        declared_person = create_test_person(first_name="Declared", user=cls.admin)
        create_test_employment(person=declared_person, company=cls.company, user=cls.admin)
        create_test_cnss_declaration(
            person=declared_person,
            company=cls.company,
            is_currently_declared=True,
            user=cls.admin,
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_without_company_filter_cnss_fields_are_null_not_zero(self):
        response = self.client.get(DASHBOARD_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertIsNone(data["cnssDeclared"])
        self.assertIsNone(data["notDeclared"])
        self.assertIsNone(data["cnssOnly"])
        # Company-independent figures must still be real numbers.
        self.assertIsInstance(data["totalPersonnel"], int)
        self.assertIsInstance(data["multiCompany"], int)

    def test_with_company_filter_cnss_fields_are_real_counts(self):
        response = self.client.get(DASHBOARD_URL, {"company": str(self.company.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        self.assertEqual(data["cnssDeclared"], 1)
        self.assertIsInstance(data["notDeclared"], int)
        self.assertIsInstance(data["cnssOnly"], int)
