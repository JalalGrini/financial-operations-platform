# apps/reports/tests/test_regenerate_endpoint.py
"""The regenerate ENDPOINT, as opposed to the regenerate service function.

test_services.py already covered `services.regenerate`, but nothing ever
POSTed to `/reports/reports/{id}/regenerate/`. That gap hid a defect that made
the endpoint impossible to call successfully:
`RegenerateReportSerializer` inherited from `GenerateReportSerializer`, so it
demanded `company`, `report_type`, `period_start`, `period_end` and
`period_label` - all five of which `regenerate()` reads off the existing report
and the view popped straight back out of `validated_data`. Sending the
documented payload (a reason) returned 400 with six field errors.

These tests pin the HTTP contract the Regenerate button depends on.
"""
from datetime import date
from decimal import Decimal

from rest_framework import status

from apps.reports.models import ReportVersion
from apps.reports.tests.test_api import REPORTS_URL, ReportsAPITestBase


class RegenerateEndpointContractTests(ReportsAPITestBase):
    def setUp(self):
        self.record = self.make_posted_record()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            REPORTS_URL + "generate/",
            {
                "company": str(self.company.id),
                "report_type": str(self.report_type.id),
                "period_start": "2026-01-01",
                "period_end": "2026-01-31",
                "period_label": "2026-01",
                "values": self._values(),
                "mode": "manual",
                "calculation_mode": "keep_missing",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.report_id = response.data["report"]

    def _values(self, amount=None):
        return [
            {
                "key": "fuel_expense.2026.01",
                "label": "January Fuel",
                "amount": str(amount if amount is not None else self.record.total_amount),
                "period_label": "2026-01",
                "source_record_ids": [str(self.record.id)],
            }
        ]

    def _regenerate(self, payload):
        return self.client.post(
            f"{REPORTS_URL}{self.report_id}/regenerate/", payload, format="json"
        )

    def test_regenerate_needs_only_a_reason_and_values(self):
        """The headline regression: this used to 400 on six discarded fields."""
        response = self._regenerate(
            {"regeneration_reason": "Source records were corrected", "values": self._values()}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["version_number"], 2)

    def test_regenerate_does_not_require_company_or_period(self):
        """Explicitly asserts the five fields are gone, so re-inheriting
        GenerateReportSerializer fails here rather than in the browser."""
        response = self._regenerate(
            {"regeneration_reason": "No identity fields supplied", "values": []}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        for field in ("company", "report_type", "period_start", "period_end", "period_label"):
            self.assertNotIn(field, response.data.get("errors", {}))

    def test_regenerate_derives_the_period_from_the_existing_report(self):
        """Since the client no longer sends them, they must come off the report."""
        response = self._regenerate(
            {"regeneration_reason": "Carry the period over", "values": self._values()}
        )
        version = ReportVersion.objects.get(pk=response.data["id"])
        self.assertEqual(version.report.period_start, date(2026, 1, 1))
        self.assertEqual(version.report.period_end, date(2026, 1, 31))
        self.assertEqual(version.report.period_label, "2026-01")

    def test_regenerate_still_requires_a_reason(self):
        """Blueprint Section 9: a new version must say why it exists."""
        response = self._regenerate({"values": self._values()})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("regeneration_reason", response.data)

    def test_regenerate_rejects_a_blank_reason(self):
        response = self._regenerate({"regeneration_reason": "", "values": self._values()})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("regeneration_reason", response.data)

    def test_regenerate_still_requires_values_explicitly(self):
        """`generate()` persists exactly what it is handed and recomputes
        nothing, so an implicit default of [] would let one click blank a
        populated report. The caller must state the figures."""
        response = self._regenerate({"regeneration_reason": "No values key at all"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("values", response.data)

    def test_regenerate_creates_a_new_version_and_keeps_the_old_one(self):
        before = ReportVersion.objects.filter(report_id=self.report_id).count()
        self._regenerate(
            {"regeneration_reason": "Adding a second version", "values": self._values()}
        )
        after = ReportVersion.objects.filter(report_id=self.report_id).count()
        self.assertEqual(after, before + 1)

    def test_regenerate_records_the_reason_on_the_new_version(self):
        reason = "Bank confirmed a different figure"
        response = self._regenerate({"regeneration_reason": reason, "values": self._values()})
        version = ReportVersion.objects.get(pk=response.data["id"])
        self.assertEqual(version.regeneration_reason, reason)

    def test_regenerate_can_carry_forward_changed_figures(self):
        """What the detail page does: resend the previous values, edited."""
        response = self._regenerate(
            {
                "regeneration_reason": "Corrected the January total",
                "values": self._values(amount=Decimal("250.0000")),
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        version = ReportVersion.objects.get(pk=response.data["id"])
        self.assertEqual(version.values.first().amount, Decimal("250.0000"))

    def test_an_assistant_can_regenerate(self):
        """Regeneration is CanManageReports, not the narrower CanApproveReports."""
        self.client.force_authenticate(user=self.assistant)
        response = self._regenerate(
            {"regeneration_reason": "Assistant correction", "values": self._values()}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)


class ReportDetailEndpointTests(ReportsAPITestBase):
    """The payload the new /reports/[id] page renders."""

    def setUp(self):
        self.record = self.make_posted_record()
        self.client.force_authenticate(user=self.admin)
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
                        "amount": str(self.record.total_amount),
                        "period_label": "2026-01",
                        "source_record_ids": [str(self.record.id)],
                    }
                ],
                "mode": "manual",
                "calculation_mode": "keep_missing",
            },
            format="json",
        )
        self.report_id = response.data["report"]
        self.version_id = response.data["id"]

    def test_detail_returns_the_version_history(self):
        response = self.client.get(f"{REPORTS_URL}{self.report_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(len(response.data["versions"]), 1)

    def test_detail_exposes_the_fields_the_page_renders(self):
        response = self.client.get(f"{REPORTS_URL}{self.report_id}/")
        for field in (
            "reference",
            "company_name",
            "report_type_name",
            "period_label",
            "status",
            "latest_version_number",
            "versions",
        ):
            self.assertIn(field, response.data, f"detail payload is missing '{field}'")

    def test_version_rows_carry_a_download_url_only_when_a_file_exists(self):
        response = self.client.get(f"{REPORTS_URL}{self.report_id}/")
        version = response.data["versions"][0]
        self.assertIn("ready_file_download_url", version)
        # This version was generated, not uploaded, so there is no file.
        self.assertIsNone(version["ready_file_download_url"])

    def test_values_drilldown_includes_the_source_records(self):
        response = self.client.get(f"/api/v1/reports/versions/{self.version_id}/values/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data), 1)
        row = response.data[0]
        self.assertEqual(row["label"], "January Fuel")
        self.assertEqual(len(row["sources"]), 1)
        self.assertEqual(row["sources"][0]["financial_record_reference"], self.record.reference)

    def test_download_ready_file_404s_cleanly_when_there_is_no_file(self):
        """A generated report has no attachment; the page must get a 404 with a
        message rather than a 500."""
        response = self.client.get(
            f"/api/v1/reports/versions/{self.version_id}/download-ready-file/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_detail_404s_for_an_unknown_id(self):
        response = self.client.get(f"{REPORTS_URL}00000000-0000-0000-0000-000000000000/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
