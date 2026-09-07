# apps/reports/tests/test_api.py
"""API-level tests for the Reports Engine.

Model/service invariants are covered in test_models.py/test_services.py.
This file covers what only the HTTP layer can break: the approve action's
narrower permission (decision R-6/permissions.py CanApproveReports), the
immutability guards wired from the first commit (decision R-6), the
traceability drill-down (blueprint Section 11), and the xlsx export
(decision R-7).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, ReportType
from apps.financial_records.services import add_line, create_record, post_record
from apps.reports.services import approve, generate, submit_for_review

User = get_user_model()

REPORTS_URL = "/api/v1/reports/reports/"
VERSIONS_URL = "/api/v1/reports/versions/"


class ReportsAPITestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = cls.make_user("rpt-api-admin@example.com", "Administrator")
        cls.assistant = cls.make_user("rpt-api-assistant@example.com", "Assistant")
        cls.director = cls.make_user("rpt-api-director@example.com", "Director")
        cls.norole = cls.make_user("rpt-api-norole@example.com", None)

        cls.company = Company.objects.create(name="API Reports Co", created_by=cls.admin)
        cls.report_type = ReportType.objects.create(name="API Report Type", created_by=cls.admin)
        cls.record_type = FinancialRecordType.objects.create(
            name="API Fuel Expense",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.admin,
        )

    @classmethod
    def make_user(cls, email, role):
        user = User.objects.create_user(
            email=email, password="testpass123", first_name="Api", last_name="Tester"
        )
        if role:
            group, _created = Group.objects.get_or_create(name=role)
            user.groups.add(group)
        return user

    def make_posted_record(self, amount="100.0000", day=5):
        record = create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 1, day),
            description="Fuel",
            user=self.admin,
        )
        add_line(record=record, user=self.admin, debit=Decimal(amount), description="Expense")
        add_line(record=record, user=self.admin, credit=Decimal(amount), description="Payable")
        return post_record(record=record, user=self.admin)

    def make_pending_version(self, record=None):
        record = record or self.make_posted_record()
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=[
                {
                    "key": "fuel_expense.2026.01",
                    "label": "January Fuel",
                    "amount": record.total_amount,
                    "period_label": "2026-01",
                    "source_record_ids": [record.id],
                }
            ],
            user=self.admin,
            mode="manual",
            calculation_mode="keep_missing",
        )
        return submit_for_review(version=version, user=self.admin), record


class ApprovePermissionNarrowingTests(ReportsAPITestBase):
    """CanApproveReports (decision R-6): narrower than CanManageReports."""

    def test_an_assistant_can_generate_a_report(self):
        record = self.make_posted_record()
        self.client.force_authenticate(user=self.assistant)
        response = self.client.post(
            REPORTS_URL + "generate/",
            {
                "company": str(self.company.id),
                "report_type": str(self.report_type.id),
                "period_start": "2026-01-01",
                "period_end": "2026-01-31",
                "period_label": "2026-01",
                "values": [
                    {
                        "key": "fuel_expense.2026.01",
                        "label": "January Fuel",
                        "amount": str(record.total_amount),
                        "period_label": "2026-01",
                        "source_record_ids": [str(record.id)],
                    }
                ],
                "mode": "manual",
                "calculation_mode": "keep_missing",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_an_assistant_cannot_approve_a_report(self):
        version, _record = self.make_pending_version()
        self.client.force_authenticate(user=self.assistant)
        response = self.client.post(
            f"{VERSIONS_URL}{version.id}/approve/", {"approved": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_director_can_approve_a_report(self):
        version, _record = self.make_pending_version()
        self.client.force_authenticate(user=self.director)
        response = self.client.post(
            f"{VERSIONS_URL}{version.id}/approve/", {"approved": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_an_administrator_can_approve_a_report(self):
        version, _record = self.make_pending_version()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"{VERSIONS_URL}{version.id}/approve/", {"approved": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_a_user_with_no_role_cannot_even_read_reports(self):
        self.client.force_authenticate(user=self.norole)
        response = self.client.get(REPORTS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ImmutabilityGuardTests(ReportsAPITestBase):
    """Decision R-6: archive/update guards shipped from the first commit."""

    def test_deleting_a_reviewed_report_through_the_api_is_blocked(self):
        version, _record = self.make_pending_version()
        approved = approve(version=version, user=self.admin, approved=True)
        report = approved.report

        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"{REPORTS_URL}{report.id}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_the_generic_patch_path_onto_a_report_does_not_exist(self):
        """http_method_names excludes put/patch entirely (see views.py
        docstring): reports only ever change through generate/regenerate/
        approve."""
        self.make_posted_record()
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=[],
            user=self.admin,
            mode="manual",
            calculation_mode="keep_missing",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"{REPORTS_URL}{version.report_id}/", {"period_label": "hacked"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class TraceabilityDrillDownTests(ReportsAPITestBase):
    """Blueprint Section 11: drill down from a computed value to its
    source Financial Records."""

    def test_the_values_action_exposes_the_source_financial_record(self):
        record = self.make_posted_record()
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=[
                {
                    "key": "fuel_expense.2026.01",
                    "label": "January Fuel",
                    "amount": record.total_amount,
                    "period_label": "2026-01",
                    "source_record_ids": [record.id],
                }
            ],
            user=self.admin,
            mode="manual",
            calculation_mode="keep_missing",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{VERSIONS_URL}{version.id}/values/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data
        self.assertEqual(len(rows), 1)
        source_record_ids = [str(source["financial_record"]) for source in rows[0]["sources"]]
        self.assertIn(str(record.id), source_record_ids)


class XlsxExportTests(ReportsAPITestBase):
    """Decision R-7: xlsx is the only supported export format offline."""

    def test_exporting_a_version_returns_an_xlsx_workbook(self):
        record = self.make_posted_record()
        version = generate(
            company=self.company,
            report_type=self.report_type,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            period_label="2026-01",
            values=[
                {
                    "key": "fuel_expense.2026.01",
                    "label": "January Fuel",
                    "amount": record.total_amount,
                    "period_label": "2026-01",
                    "source_record_ids": [record.id],
                }
            ],
            user=self.admin,
            mode="manual",
            calculation_mode="keep_missing",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{VERSIONS_URL}export-xlsx/", {"version": str(version.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertTrue(len(response.content) > 0)

    def test_exporting_without_a_version_id_is_a_400_not_a_500(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{VERSIONS_URL}export-xlsx/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
