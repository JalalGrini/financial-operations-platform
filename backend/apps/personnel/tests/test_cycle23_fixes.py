# apps/personnel/tests/test_cycle23_fixes.py
"""Regression tests for the Cycle 23 fix (state/IMPLEMENTATION_PLAN.md
Section 17): N-1, the personnel person list endpoint called
.get_active_employments().count() and .has_active_cnss_declaration() per
row in the serializer, costing two extra queries per person on every page.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.personnel.tests.factories import (
    create_test_cnss_declaration,
    create_test_company,
    create_test_employment,
    create_test_person,
)

User = get_user_model()

PERSONS_URL = "/api/v1/personnel/persons/"


class Cycle23PersonnelListAnnotationTests(APITestCase):
    """N-1: list endpoint query count must not scale with people count, and
    the annotated counts/flags must match the values the old per-row model
    calls would have produced."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c23-pers-admin@example.com",
            password="testpass123",
            first_name="Cycle23",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)
        cls.company = create_test_company(user=cls.admin)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _make_person_with_state(self, first_name, active_employments, has_cnss):
        person = create_test_person(first_name=first_name, user=self.admin)
        # Each employment for the same person must be at a distinct company;
        # the app enforces no overlapping active employments for one person
        # at the same company.
        for _ in range(active_employments):
            company = create_test_company(name=f"{first_name} Co {_}", user=self.admin)
            create_test_employment(person=person, company=company, user=self.admin)
        if has_cnss:
            create_test_cnss_declaration(
                person=person,
                company=self.company,
                is_currently_declared=True,
                user=self.admin,
            )
        return person

    def test_list_query_count_does_not_scale_with_person_count(self):
        for i in range(2):
            self._make_person_with_state(f"Two{i}", active_employments=1, has_cnss=True)

        with CaptureQueriesContext(connection) as ctx1:
            response1 = self.client.get(PERSONS_URL)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        results1 = response1.data["results"] if "results" in response1.data else response1.data
        self.assertEqual(len(results1), 2)
        baseline_queries = len(ctx1.captured_queries)

        for i in range(10):
            self._make_person_with_state(f"Twelve{i}", active_employments=2, has_cnss=(i % 2 == 0))

        with CaptureQueriesContext(connection) as ctx2:
            response2 = self.client.get(PERSONS_URL)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        results2 = response2.data["results"] if "results" in response2.data else response2.data
        self.assertEqual(len(results2), 12)

        self.assertEqual(
            len(ctx2.captured_queries),
            baseline_queries,
            "List endpoint query count changed after adding more people; "
            "active_employments_count/has_active_cnss must come from a "
            "per-page annotation, not a per-row query (N-1 regression).",
        )

    def test_annotated_values_match_model_helpers(self):
        person_with_two = self._make_person_with_state(
            "WithTwo", active_employments=2, has_cnss=True
        )
        person_with_none = self._make_person_with_state(
            "WithNone", active_employments=0, has_cnss=False
        )

        # Ground truth computed directly from the model helpers the
        # serializer falls back to when no annotation is present.
        expected_two_count = person_with_two.get_active_employments().count()
        expected_two_cnss = person_with_two.has_active_cnss_declaration()
        expected_none_count = person_with_none.get_active_employments().count()
        expected_none_cnss = person_with_none.has_active_cnss_declaration()
        self.assertEqual(expected_two_count, 2)
        self.assertTrue(expected_two_cnss)
        self.assertEqual(expected_none_count, 0)
        self.assertFalse(expected_none_cnss)

        response = self.client.get(PERSONS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        # Match by id rather than first_name: PersonnelPerson normalizes name
        # casing on save, so the API's first_name is not guaranteed to be a
        # verbatim echo of the value passed into the factory.
        by_id = {row["id"]: row for row in results}

        self.assertEqual(
            by_id[str(person_with_two.id)]["active_employments_count"], expected_two_count
        )
        self.assertEqual(by_id[str(person_with_two.id)]["has_active_cnss"], expected_two_cnss)
        self.assertEqual(
            by_id[str(person_with_none.id)]["active_employments_count"], expected_none_count
        )
        self.assertEqual(by_id[str(person_with_none.id)]["has_active_cnss"], expected_none_cnss)
