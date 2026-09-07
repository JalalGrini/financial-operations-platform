# apps/financial_records/tests/test_cycle23_fixes.py
"""Regression tests for the Cycle 23 fix (state/IMPLEMENTATION_PLAN.md
Section 17): N-3, the financial record list endpoint inherited a "lines"
prefetch from active_records() that the list serializer never reads,
wasting one extra query set per page and scaling with total line count.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.services import add_line, create_record

User = get_user_model()
D = Decimal

RECORDS_URL = "/api/v1/financial-records/records/"


class Cycle23FinancialRecordListPrefetchTests(APITestCase):
    """N-3: list endpoint query count must not scale with lines per record."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c23-fr-admin@example.com",
            password="testpass123",
            first_name="Cycle23",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)
        cls.company = Company.objects.create(name="C23 FR Co", created_by=cls.admin)
        cls.record_type = FinancialRecordType.objects.create(
            name="C23 FR Invoice", created_by=cls.admin
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _make_record_with_lines(self, description, line_count):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 7),
            description=description,
            user=self.admin,
        )
        for i in range(line_count):
            add_line(
                record=record,
                user=self.admin,
                debit=D("10.0000") if i % 2 == 0 else D("0"),
                credit=D("0") if i % 2 == 0 else D("10.0000"),
                description=f"line {i}",
            )
        return record

    def test_list_query_count_does_not_scale_with_line_count(self):
        # Two non-empty states: 2 records with 2 lines each, then the same 2
        # records but each given many more lines. If "lines" were still being
        # prefetched on the list action, the second query count would be
        # higher than the first (more line rows fetched); with the fix, both
        # counts must be identical because "lines" is never fetched at all
        # for the list action.
        self._make_record_with_lines("Rec A", 2)
        self._make_record_with_lines("Rec B", 2)

        with CaptureQueriesContext(connection) as ctx1:
            response1 = self.client.get(RECORDS_URL)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        results1 = response1.data["results"] if "results" in response1.data else response1.data
        self.assertEqual(len(results1), 2)
        baseline_queries = len(ctx1.captured_queries)

        # Add many more lines to the same two records (no new records) and
        # re-request the same list endpoint via the service layer.
        from apps.financial_records.models import FinancialRecord

        rec_a = FinancialRecord.objects.get(description="Rec A")
        rec_b = FinancialRecord.objects.get(description="Rec B")
        for rec in (rec_a, rec_b):
            for i in range(20):
                add_line(
                    record=rec,
                    user=self.admin,
                    debit=D("5.0000") if i % 2 == 0 else D("0"),
                    credit=D("0") if i % 2 == 0 else D("5.0000"),
                    description=f"extra line {i}",
                )

        with CaptureQueriesContext(connection) as ctx2:
            response2 = self.client.get(RECORDS_URL)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        results2 = response2.data["results"] if "results" in response2.data else response2.data
        self.assertEqual(len(results2), 2)

        self.assertEqual(
            len(ctx2.captured_queries),
            baseline_queries,
            "List endpoint query count changed after adding lines; the list "
            "action must not prefetch or otherwise touch record lines "
            "(N-3 regression).",
        )

    def test_list_response_body_has_no_lines_field(self):
        # Pure performance fix: the list serializer never rendered "lines"
        # before or after N-3, so the response shape must be unchanged.
        self._make_record_with_lines("Rec C", 3)
        response = self.client.get(RECORDS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(len(results), 1)
        self.assertNotIn("lines", results[0])
        self.assertEqual(results[0]["description"], "Rec C")
