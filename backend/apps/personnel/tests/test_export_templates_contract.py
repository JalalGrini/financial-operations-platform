"""Contract guard for the printed-form export templates (v17.25).

The office files two paper forms every month: the CNSS declaration and the
monthly personnel payment list. v17.25 reproduces both exactly, as opt-in
export templates.

What this file defends:

1. The printed column headers and their order. These are not cosmetic. People
   downstream read these files by column position, so a renamed or reordered
   header is a real defect, not a style change.
2. Every field a template references must actually be produced by the row
   builder. Without this a template silently exports a column of blanks, which
   looks exactly like a month with no data.
3. The TOTAL STE subtotal rows: one per company, money summed, day counts NOT
   summed.
4. The templates stay opt-in. The default (wide) column sets must keep working
   untouched, because test_services.py pins "Net Salary" in the default payroll
   export and analysts rely on the wide files.

These are SimpleTestCase: they assert on pure column/row logic, touch no
database, and so cannot be skipped by a missing fixture.
"""

from decimal import Decimal

from django.test import SimpleTestCase

from apps.personnel.serializers import ReportExportSerializer, ReportPreviewSerializer
from apps.personnel.services import ReportService

# Transcribed from the printed forms. Order is significant.
EXPECTED_CNSS_HEADERS = [
    "SOCIETE",
    "N\u00b0 IMMATRICULATION",
    "NOM ET PRENOM",
    "NBRE J",
    "CIN",
    "SITUATION",
    "DATE 1ERE DECLARATION",
    "DATE RESILIATION",
    "ARCHIVE",
]

EXPECTED_PAYROLL_HEADERS = [
    "STE",
    "LIEU",
    "NOM",
    "PRENOM",
    "N\u00b0 CIN",
    "N\u00b0 TELE",
    "DATE D'EM",
    "NJD",
    "S BRUT",
    "SUP",
    "S NET",
    "RIB",
    "TYPE PAI",
    "OBSERVATION",
]


class PrintedTemplateColumnTests(SimpleTestCase):
    """The templates must match the paper forms, column for column."""

    def test_cnss_template_matches_the_printed_form(self):
        headers = [h for _f, h in ReportService.cnss_declaration_template_columns()]
        self.assertEqual(headers, EXPECTED_CNSS_HEADERS)

    def test_payroll_template_matches_the_printed_form(self):
        headers = [h for _f, h in ReportService.payroll_monthly_template_columns()]
        self.assertEqual(headers, EXPECTED_PAYROLL_HEADERS)

    def test_templates_are_narrower_than_the_default_column_sets(self):
        """The whole point of the templates is dropping unneeded columns.

        If a template ever grows past its default set, someone has wired the
        wrong column list in and the printed form will not fit the page.
        """
        self.assertLess(
            len(ReportService.cnss_declaration_template_columns()),
            len(ReportService._cnss_columns()),
        )
        self.assertLess(
            len(ReportService.payroll_monthly_template_columns()),
            len(ReportService._payroll_columns()),
        )

    def test_default_column_sets_are_untouched_by_the_templates(self):
        """Templates are additive. The wide exports must still carry their
        analyst columns, including the "Net Salary" header pinned elsewhere."""
        payroll_headers = [h for _f, h in ReportService._payroll_columns()]
        self.assertIn("Net Salary", payroll_headers)
        self.assertIn("Deductions", payroll_headers)
        cnss_headers = [h for _f, h in ReportService._cnss_columns()]
        self.assertIn("Company", cnss_headers)


class TemplateFieldsExistTests(SimpleTestCase):
    """A template may only reference keys the row builders actually emit.

    Without this, a typo produces a column of blanks that is indistinguishable
    from a genuinely empty month.
    """

    CNSS_ROW_KEYS = {
        "company",
        "company_reference",
        "cnss_registration_number",
        "last_name",
        "first_name",
        "full_name",
        "declared_days",
        "cin",
        "situation",
        "situation_label",
        "archived_label",
        "first_declaration_date",
        "declaration_start_date",
        "declaration_stop_date",
        "resignation_date",
        "current_declaration_state",
        "observation",
    }

    PAYROLL_ROW_KEYS = {
        "company",
        "company_reference",
        "work_domain",
        "work_city",
        "department",
        "employee_reference",
        "last_name",
        "first_name",
        "full_name",
        "cin",
        "phone",
        "hire_date",
        "payroll_month",
        "scheduled_days",
        "worked_days",
        "absence_days",
        "declared_days",
        "fixed_gross_salary",
        "gross_salary_snapshot",
        "supplements",
        "deductions",
        "calculated_net_salary",
        "total_paid",
        "remaining_amount",
        "rib",
        "payment_method",
        "payroll_status",
        "observation",
    }

    def test_every_cnss_template_field_is_produced_by_the_builder(self):
        for field, header in ReportService.cnss_declaration_template_columns():
            with self.subTest(header=header):
                self.assertIn(field, self.CNSS_ROW_KEYS)

    def test_every_payroll_template_field_is_produced_by_the_builder(self):
        for field, header in ReportService.payroll_monthly_template_columns():
            with self.subTest(header=header):
                self.assertIn(field, self.PAYROLL_ROW_KEYS)

    def test_the_builder_key_lists_are_not_empty(self):
        """Vacuity check: if the sets above were emptied, the two tests over
        them would pass by iterating nothing."""
        self.assertGreaterEqual(len(self.CNSS_ROW_KEYS), 15)
        self.assertGreaterEqual(len(self.PAYROLL_ROW_KEYS), 25)


class CompanySubtotalTests(SimpleTestCase):
    """TOTAL STE rows, as they appear on the printed payment list."""

    @staticmethod
    def _row(company, gross, sup, net, days):
        return {
            "company": company,
            "gross_salary_snapshot": Decimal(gross),
            "supplements": Decimal(sup),
            "calculated_net_salary": Decimal(net),
            "declared_days": days,
        }

    def test_one_total_row_per_company_block(self):
        rows = [
            self._row("STE A", "100", "10", "110", 26),
            self._row("STE A", "200", "20", "220", 20),
            self._row("STE B", "300", "30", "330", 17),
        ]
        out = ReportService._with_company_subtotals(rows)
        totals = [r for r in out if r.get("_is_total")]
        self.assertEqual(len(totals), 2)
        self.assertEqual(totals[0]["company"], "TOTAL STE STE A")
        self.assertEqual(totals[1]["company"], "TOTAL STE STE B")
        self.assertEqual(len(out), 5)

    def test_money_columns_add_up(self):
        rows = [
            self._row("STE A", "100.50", "10", "110.50", 26),
            self._row("STE A", "200.25", "20", "220.25", 20),
        ]
        total = [r for r in ReportService._with_company_subtotals(rows) if r.get("_is_total")][0]
        self.assertEqual(total["gross_salary_snapshot"], Decimal("300.75"))
        self.assertEqual(total["supplements"], Decimal("30"))
        self.assertEqual(total["calculated_net_salary"], Decimal("330.75"))

    def test_day_counts_are_not_summed(self):
        """A total of 46 working days for a company is meaningless, and the
        printed form leaves the NJD cell of the total row blank."""
        rows = [
            self._row("STE A", "100", "10", "110", 26),
            self._row("STE A", "200", "20", "220", 20),
        ]
        total = [r for r in ReportService._with_company_subtotals(rows) if r.get("_is_total")][0]
        self.assertNotIn("declared_days", total)

    def test_missing_money_values_are_treated_as_zero(self):
        rows = [
            {"company": "STE A", "gross_salary_snapshot": Decimal("100")},
            {"company": "STE A", "calculated_net_salary": None},
        ]
        total = [r for r in ReportService._with_company_subtotals(rows) if r.get("_is_total")][0]
        self.assertEqual(total["gross_salary_snapshot"], Decimal("100"))
        self.assertEqual(total["calculated_net_salary"], Decimal("0"))

    def test_empty_input_produces_no_total_row(self):
        """A month with no payroll must not export a lone TOTAL STE row."""
        self.assertEqual(ReportService._with_company_subtotals([]), [])

    def test_total_marker_is_not_an_exported_column(self):
        """_is_total drives styling only; it must never surface as a column."""
        fields = [f for f, _h in ReportService.payroll_monthly_template_columns()]
        self.assertNotIn("_is_total", fields)


class TemplateRequestFieldTests(SimpleTestCase):
    """The template is chosen per request, and only from the known set."""

    BASE = {"report_type": "payroll_monthly", "year": 2026, "month": 6}

    def test_export_serializer_accepts_both_templates(self):
        for template in ("declaration", "monthly_list"):
            with self.subTest(template=template):
                serializer = ReportExportSerializer(data={**self.BASE, "template": template})
                self.assertTrue(serializer.is_valid(), serializer.errors)
                self.assertEqual(serializer.validated_data["template"], template)

    def test_export_serializer_rejects_an_unknown_template(self):
        serializer = ReportExportSerializer(data={**self.BASE, "template": "pretty-please"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("template", serializer.errors)

    def test_template_is_optional_so_existing_callers_keep_working(self):
        """Every caller written before v17.25 omits the field entirely."""
        serializer = ReportExportSerializer(data=dict(self.BASE))
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertIsNone(serializer.validated_data.get("template"))

    def test_preview_serializer_also_carries_the_template(self):
        serializer = ReportPreviewSerializer(
            data={"year": 2026, "month": 6, "template": "declaration"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["template"], "declaration")
