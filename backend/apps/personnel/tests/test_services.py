# apps/personnel/tests/test_services.py
"""
Tests for Personnel services.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.personnel.models import (
    PayrollAdjustment,
    PayrollPayment,
    PayrollPaymentStatus,
)
from apps.personnel.services import (
    CNSSService,
    EmploymentService,
    MonthlyPayrollService,
    PersonnelService,
    ReportService,
)
from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_cnss_declaration,
    create_test_cnss_monthly,
    create_test_company,
    create_test_employment,
    create_test_payment,
    create_test_payroll,
    create_test_person,
    create_test_salary,
    create_test_user,
)


class PersonnelServiceTests(TestCase):
    """Tests for PersonnelService."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.service = PersonnelService()

    def test_create_person(self):
        """Test creating a person via service."""
        person = self.service.create_person(
            {
                "first_name": "John",
                "last_name": "Doe",
                "cin": "AB123456",
                "email": "john@example.com",
            },
            user=self.user,
        )

        self.assertEqual(person.first_name, "John")
        self.assertEqual(person.last_name, "DOE")
        self.assertEqual(person.cin, "AB123456")
        self.assertTrue(person.reference.startswith("PP-"))

    def test_create_person_minimal(self):
        """Test creating a person with only required fields."""
        person = self.service.create_person(
            {
                "first_name": "Jane",
                "last_name": "Smith",
            },
            user=self.user,
        )

        self.assertEqual(person.first_name, "Jane")
        self.assertEqual(person.last_name, "SMITH")
        # CIN is None (not '') because the field is unique+nullable;
        # storing '' would conflict when multiple persons have no CIN.
        self.assertIsNone(person.cin)

    def test_update_person(self):
        """Test updating a person."""
        person = create_test_person(user=self.user)

        updated = self.service.update_person(
            person,
            {
                "first_name": "John",
                "last_name": "Updated",
                "phone": "+212600000000",
            },
            user=self.user,
        )

        self.assertEqual(updated.last_name, "UPDATED")
        self.assertEqual(updated.phone, "+212600000000")

    def test_archive_person(self):
        """Test archiving a person."""
        person = create_test_person(user=self.user)

        archived = self.service.archive_person(person, user=self.user, reason="Left company")

        self.assertTrue(archived.is_archived)
        self.assertIn("[Archived: Left company]", archived.observations)

    def test_restore_person(self):
        """Test restoring an archived person."""
        person = create_test_person(user=self.user)
        person.archive(user=self.user)

        restored = self.service.restore_person(person)

        self.assertFalse(restored.is_archived)

    def test_search_persons(self):
        """Test searching persons."""
        create_test_person(first_name="John", last_name="Doe", cin="AB123456", user=self.user)
        create_test_person(first_name="Jane", last_name="Smith", cin="CD789012", user=self.user)

        results = self.service.search_persons("John")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().first_name, "John")

        results = self.service.search_persons("AB123456")
        self.assertEqual(results.count(), 1)

    def test_get_completeness_report(self):
        """Test completeness report."""
        person = create_test_person(user=self.user)

        report = self.service.get_completeness_report(person)

        self.assertIn("percentage", report)
        self.assertIn("missing_fields", report)
        self.assertIn("is_complete", report)
        self.assertIsInstance(report["percentage"], int)


class EmploymentServiceTests(TestCase):
    """Tests for EmploymentService."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.service = EmploymentService()

    def test_create_employment(self):
        """Test creating an employment via service."""
        employment = self.service.create_employment(
            {
                "person": self.person,
                "company": self.company,
                "job_title": "Developer",
                "department": "IT",
                "hire_date": date.today(),
                "employment_status": "active",
                "contract_type": "permanent",
            },
            user=self.user,
        )

        self.assertEqual(employment.person, self.person)
        self.assertEqual(employment.company, self.company)
        self.assertEqual(employment.job_title, "Developer")
        self.assertTrue(employment.reference.startswith("EMP-"))

    def test_create_employment_generates_employee_reference(self):
        """Test that employee reference is auto-generated."""
        employment = self.service.create_employment(
            {
                "person": self.person,
                "company": self.company,
                "hire_date": date.today(),
            },
            user=self.user,
        )

        self.assertTrue(employment.employee_reference.startswith(f"EMP-{self.company.reference}-"))

    def test_terminate_employment(self):
        """Test terminating an employment."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

        terminated = self.service.terminate_employment(
            employment,
            user=self.user,
            departure_reason="resignation",
            resignation_date=date.today(),
        )

        self.assertFalse(terminated.is_active)
        self.assertEqual(terminated.employment_status, "resigned")
        self.assertEqual(terminated.departure_reason, "resignation")

    def test_archive_employment(self):
        """Test archiving an employment."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

        archived = self.service.archive_employment(employment, user=self.user, reason="Test")

        self.assertTrue(archived.is_archived)
        self.assertIn("[Archived: Test]", archived.observations)

    def test_restore_employment(self):
        """Test restoring an archived employment."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        employment.archive(user=self.user)

        restored = self.service.restore_employment(employment)

        self.assertFalse(restored.is_archived)

    def test_set_salary(self):
        """Test setting a salary via service."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

        salary = self.service.set_salary(
            employment,
            Decimal("60000.0000"),
            date.today(),
            reason="Promotion",
            user=self.user,
        )

        self.assertEqual(salary.fixed_monthly_gross_salary, Decimal("60000.0000"))
        self.assertTrue(salary.is_current)

    def test_salary_history_preserved(self):
        """Test that salary history is preserved."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

        # Set first salary
        salary1 = self.service.set_salary(
            employment,
            Decimal("40000.0000"),
            date(2020, 1, 1),
            reason="Initial",
            user=self.user,
        )

        # Set second salary
        salary2 = self.service.set_salary(
            employment,
            Decimal("50000.0000"),
            date(2022, 1, 1),
            reason="Raise",
            user=self.user,
        )

        salary1.refresh_from_db()
        self.assertFalse(salary1.is_current)
        self.assertEqual(salary1.effective_to, date(2021, 12, 31))
        self.assertTrue(salary2.is_current)

    def test_get_salary_on_date(self):
        """Test getting salary valid on a specific date."""
        employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

        self.service.set_salary(employment, Decimal("40000.0000"), date(2020, 1, 1), user=self.user)
        self.service.set_salary(employment, Decimal("50000.0000"), date(2022, 1, 1), user=self.user)

        salary_2021 = self.service.get_salary_on_date(employment, date(2021, 6, 1))
        salary_2022 = self.service.get_salary_on_date(employment, date(2022, 6, 1))

        self.assertEqual(salary_2021.fixed_monthly_gross_salary, Decimal("40000.0000"))
        self.assertEqual(salary_2022.fixed_monthly_gross_salary, Decimal("50000.0000"))


class MonthlyPayrollServiceTests(TestCase):
    """Tests for MonthlyPayrollService."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.salary = create_test_salary(employment=self.employment, user=self.user)
        self.service = MonthlyPayrollService()

    def test_create_payroll_record(self):
        """Test creating a payroll record."""
        payroll = self.service.create_payroll_record(
            self.employment,
            2024,
            1,
            user=self.user,
        )

        self.assertEqual(payroll.employment, self.employment)
        self.assertEqual(payroll.year, 2024)
        self.assertEqual(payroll.month, 1)
        self.assertEqual(payroll.status, "draft")
        self.assertEqual(payroll.gross_salary_snapshot, self.salary.fixed_monthly_gross_salary)

    def test_get_or_create_payroll(self):
        """Test get_or_create payroll."""
        payroll1 = self.service.get_or_create_payroll(self.employment, 2024, 1)
        payroll2 = self.service.get_or_create_payroll(self.employment, 2024, 1)

        self.assertEqual(payroll1, payroll2)

    def test_calculate_payroll(self):
        """Test calculating payroll."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        calculated = self.service.calculate_payroll(payroll)  # No user = just calculate

        self.assertEqual(calculated.status, "calculated")
        self.assertIsNone(calculated.approved_by)
        self.assertIsNotNone(calculated.calculated_at)

    def test_recalculate_draft_payroll(self):
        """Test recalculating draft payroll."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.worked_days = 25

        recalculated = self.service.recalculate_payroll(payroll)

        self.assertEqual(recalculated.worked_days, 25)
        self.assertEqual(recalculated.status, "draft")

    def test_cannot_recalculate_approved(self):
        """Test that approved payroll cannot be recalculated."""
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)

        with self.assertRaises(ValidationError):
            self.service.recalculate_payroll(payroll)

    def test_add_adjustment(self):
        """Test adding an adjustment."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        adjustment = self.service.add_adjustment(
            payroll=payroll,
            adjustment_type="supplement",
            direction="addition",
            amount=Decimal("5000.0000"),
            description="Bonus",
            effective_date=date.today(),
            user=self.user,
        )

        self.assertEqual(adjustment.adjustment_type, "supplement")
        self.assertEqual(adjustment.direction, "addition")
        self.assertEqual(adjustment.amount, Decimal("5000.0000"))

        payroll.refresh_from_db()
        self.assertEqual(payroll.supplements_total, Decimal("5000.0000"))

    def test_cannot_add_adjustment_to_approved(self):
        """Test that adjustment cannot be added to approved payroll."""
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)

        with self.assertRaises(ValidationError):
            self.service.add_adjustment(
                payroll=payroll,
                adjustment_type="supplement",
                direction="addition",
                amount=Decimal("5000.0000"),
                description="Bonus",
                effective_date=date.today(),
                user=self.user,
            )

    def test_remove_adjustment(self):
        """Test removing an adjustment."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        adjustment = create_test_adjustment(payroll=payroll, user=self.user)

        self.service.remove_adjustment(adjustment)

        self.assertFalse(PayrollAdjustment.objects.filter(pk=adjustment.pk).exists())
        payroll.refresh_from_db()
        self.assertEqual(payroll.supplements_total, Decimal("0"))

    def test_record_payment(self):
        """Test recording a payment."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        payment = self.service.record_payment(
            payroll=payroll,
            amount=Decimal("10000.0000"),
            # A deterministic in-period date, not date.today() (bug F-1,
            # Cycle 19 - state/IMPLEMENTATION_PLAN.md Section 13.6): the
            # payroll_payment_pre_save signal compares against
            # timezone.now().date() in Africa/Casablanca (UTC+1) while
            # date.today() reads the OS clock (UTC in this sandbox), so
            # this test failed for real between 23:00-00:00 UTC.
            payment_date=payroll.period_start,
            payment_kind="advance",
            user=self.user,
        )

        self.assertEqual(payment.amount, Decimal("10000.0000"))
        self.assertEqual(payment.payment_kind, "advance")

        payroll.refresh_from_db()
        self.assertEqual(payroll.total_paid, Decimal("10000.0000"))
        self.assertEqual(payroll.remaining_amount, Decimal("40000.0000"))

    def test_record_advance(self):
        """Test recording an advance."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        payment = self.service.record_advance(
            payroll=payroll,
            amount=Decimal("20000.0000"),
            # See test_record_payment above (bug F-1, Cycle 19).
            payment_date=payroll.period_start,
            user=self.user,
        )

        self.assertEqual(payment.payment_kind, "advance")

    def test_record_final_payment(self):
        """Test recording final payment."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        payment = self.service.record_final_payment(
            payroll=payroll,
            amount=Decimal("50000.0000"),
            # See test_record_payment above (bug F-1, Cycle 19).
            payment_date=payroll.period_start,
            user=self.user,
        )

        self.assertEqual(payment.payment_kind, "final_payment")

    def test_void_payment(self):
        """Test voiding a payment.

        Cycle 18 decision C-4: voiding now marks the payment CANCELLED
        instead of deleting the row, so the payment stays visible for audit
        purposes while being excluded from total_paid.
        """
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payment = create_test_payment(payroll=payroll, user=self.user)

        self.service.void_payment(payment, user=self.user)

        payment.refresh_from_db()
        self.assertTrue(PayrollPayment.objects.filter(pk=payment.pk).exists())
        self.assertEqual(payment.status, PayrollPaymentStatus.CANCELLED)
        self.assertIsNotNone(payment.cancelled_at)
        self.assertEqual(payment.cancelled_by, self.user)
        payroll.refresh_from_db()
        self.assertEqual(payroll.total_paid, Decimal("0"))

    def test_approve_payroll(self):
        """Test approving a payroll."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        # Calculate first
        self.service.calculate_payroll(payroll, user=self.user)

        approved = self.service.approve_payroll(payroll, self.user)

        self.assertEqual(approved.status, "approved")
        self.assertEqual(approved.approved_by, self.user)

    def test_unapprove_payroll(self):
        """Test unapproving a payroll."""
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        payroll.approved_by = self.user
        payroll.approved_at = timezone.now()
        payroll.save()

        unapproved = self.service.unapprove_payroll(payroll, self.user)

        self.assertEqual(unapproved.status, "calculated")
        self.assertIsNone(unapproved.approved_by)

    def test_bulk_create_payrolls(self):
        """Test bulk creating payrolls."""
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        employment2 = create_test_employment(person=person2, company=self.company, user=self.user)
        create_test_salary(employment=employment2, user=self.user)

        payrolls = self.service.bulk_create_payrolls(self.company, 2024, 1, user=self.user)

        self.assertEqual(len(payrolls), 2)

    def test_bulk_calculate_payrolls(self):
        """Test bulk calculating payrolls."""
        payroll1 = create_test_payroll(employment=self.employment, user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        employment2 = create_test_employment(person=person2, company=self.company, user=self.user)
        create_test_salary(employment=employment2, user=self.user)
        payroll2 = create_test_payroll(employment=employment2, user=self.user)

        calculated = self.service.bulk_calculate_payrolls([payroll1, payroll2], self.user)

        self.assertEqual(len(calculated), 2)
        for p in calculated:
            self.assertEqual(p.status, "calculated")

    def test_bulk_approve_payrolls(self):
        """Test bulk approving payrolls."""
        payroll1 = create_test_payroll(employment=self.employment, user=self.user)
        payroll1.calculate(user=None)
        payroll1.save()

        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        employment2 = create_test_employment(person=person2, company=self.company, user=self.user)
        create_test_salary(employment=employment2, user=self.user)
        payroll2 = create_test_payroll(employment=employment2, user=self.user)
        payroll2.calculate(user=None)
        payroll2.save()

        approved = self.service.bulk_approve_payrolls([payroll1, payroll2], self.user)

        self.assertEqual(len(approved), 2)
        for p in approved:
            self.assertEqual(p.status, "approved")


class CNSSServiceTests(TestCase):
    """Tests for CNSSService."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.service = CNSSService()

    def test_create_cnss_declaration(self):
        """Test creating a CNSS declaration."""
        person = create_test_person(user=self.user)

        cnss = self.service.create_cnss_declaration(
            person=person,
            company=self.company,
            cnss_number="12345678",
            situation="declared_by_this_company",
            is_currently_declared=True,
            declaration_start_date=date.today(),
            user=self.user,
        )

        self.assertEqual(cnss.person, person)
        self.assertEqual(cnss.company, self.company)
        self.assertEqual(cnss.cnss_registration_number, "12345678")
        self.assertTrue(cnss.is_currently_declared)

    def test_create_cnss_only_person(self):
        """Test creating CNSS-only person (no employment)."""
        person = create_test_person(user=self.user)

        cnss = self.service.create_cnss_declaration(
            person=person,
            company=self.company,
            employment=None,
            is_currently_declared=True,
            user=self.user,
        )

        self.assertIsNone(cnss.employment)

    def test_stop_cnss_declaration(self):
        """Test stopping a CNSS declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person,
            company=self.company,
            is_currently_declared=True,
            user=self.user,
        )

        stopped = self.service.stop_cnss_declaration(
            cnss=cnss,
            stop_date=date.today(),
            stop_reason="resignation",
            user=self.user,
        )

        self.assertFalse(stopped.is_currently_declared)
        self.assertEqual(stopped.stop_reason, "resignation")
        self.assertEqual(stopped.declaration_stop_date, date.today())

    def test_restart_cnss_declaration(self):
        """Test restarting a stopped CNSS declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person,
            company=self.company,
            is_currently_declared=True,
            user=self.user,
        )

        self.service.stop_cnss_declaration(cnss, date.today(), "resignation", user=self.user)

        restarted = self.service.restart_cnss_declaration(
            cnss, date.today() + timedelta(days=1), user=self.user
        )

        self.assertTrue(restarted.is_currently_declared)
        self.assertIsNone(restarted.declaration_stop_date)

    def test_create_monthly_declaration(self):
        """Test creating a monthly CNSS declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person,
            company=self.company,
            is_currently_declared=True,
            user=self.user,
        )

        monthly = self.service.create_monthly_declaration(
            cnss_declaration=cnss,
            year=2024,
            month=1,
            declared_days=26,
            declared_salary=Decimal("50000.0000"),
            user=self.user,
        )

        self.assertEqual(monthly.year, 2024)
        self.assertEqual(monthly.month, 1)
        self.assertEqual(monthly.declared_days, 26)
        self.assertEqual(monthly.declared_salary, Decimal("50000.0000"))

    def test_get_or_create_monthly_declaration(self):
        """Test get_or_create monthly declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person, company=self.company, user=self.user
        )

        monthly1 = self.service.get_or_create_monthly_declaration(cnss, 2024, 1)
        monthly2 = self.service.get_or_create_monthly_declaration(cnss, 2024, 1)

        self.assertEqual(monthly1, monthly2)

    def test_submit_monthly_declaration(self):
        """Test submitting a monthly declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person, company=self.company, user=self.user
        )
        monthly = self.service.create_monthly_declaration(
            cnss_declaration=cnss, year=2024, month=1, user=self.user
        )

        submitted = self.service.submit_monthly_declaration(monthly, self.user)

        self.assertEqual(submitted.status, "submitted")
        self.assertIsNotNone(submitted.submission_date)

    def test_correct_monthly_declaration(self):
        """Test correcting a monthly declaration."""
        person = create_test_person(user=self.user)
        cnss = self.service.create_cnss_declaration(
            person=person, company=self.company, user=self.user
        )
        monthly = self.service.create_monthly_declaration(
            cnss_declaration=cnss, year=2024, month=1, user=self.user
        )
        self.service.submit_monthly_declaration(monthly, self.user)

        corrected = self.service.correct_monthly_declaration(monthly, self.user)

        self.assertEqual(corrected.status, "corrected")


class ReportServiceTests(TestCase):
    """Tests for ReportService."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.salary = create_test_salary(employment=self.employment, user=self.user)
        self.payroll = create_test_payroll(employment=self.employment, user=self.user)
        self.cnss = create_test_cnss_declaration(
            person=self.person, company=self.company, user=self.user
        )
        self.monthly_cnss = create_test_cnss_monthly(cnss_declaration=self.cnss, user=self.user)
        self.service = ReportService()

    def test_build_cnss_monthly_report(self):
        """Test building CNSS monthly report dataset."""
        rows = self.service.build_cnss_monthly_report(
            year=date.today().year,
            month=date.today().month,
        )

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["company"], self.company.name)
        self.assertEqual(row["cnss_registration_number"], self.cnss.cnss_registration_number)
        self.assertEqual(row["full_name"], self.person.get_full_name())

    def test_build_cnss_monthly_report_company_filter(self):
        """Test CNSS report with company filter."""
        company2 = create_test_company(name="Company 2", user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        cnss2 = create_test_cnss_declaration(person=person2, company=company2, user=self.user)
        create_test_cnss_monthly(cnss_declaration=cnss2, user=self.user)

        rows = self.service.build_cnss_monthly_report(
            year=date.today().year,
            month=date.today().month,
            company_ids=[str(self.company.id)],
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["company"], self.company.name)

    def test_build_payroll_monthly_report(self):
        """Test building payroll monthly report dataset."""
        rows = self.service.build_payroll_monthly_report(
            year=date.today().year,
            month=date.today().month,
        )

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["company"], self.company.name)
        self.assertEqual(row["full_name"], self.person.get_full_name())
        self.assertEqual(row["gross_salary_snapshot"], self.payroll.gross_salary_snapshot)

    def test_build_payroll_monthly_report_filters(self):
        """Test payroll report with filters."""
        company2 = create_test_company(name="Company 2", user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        emp2 = create_test_employment(person=person2, company=company2, user=self.user)
        create_test_salary(employment=emp2, user=self.user)
        create_test_payroll(employment=emp2, user=self.user)

        rows = self.service.build_payroll_monthly_report(
            year=date.today().year,
            month=date.today().month,
            company_ids=[str(self.company.id)],
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["company"], self.company.name)

    def test_export_cnss_report_xlsx(self):
        """Test CNSS report XLSX export."""
        content, content_type, ext = self.service.export_cnss_report(
            year=date.today().year,
            month=date.today().month,
            output_format="xlsx",
        )

        self.assertEqual(ext, "xlsx")
        self.assertEqual(
            content_type,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIsInstance(content, bytes)
        self.assertGreater(len(content), 0)
        # Check it's a valid XLSX (starts with PK for zip)
        self.assertTrue(content.startswith(b"PK"))

    def test_export_payroll_report_xlsx(self):
        """Test payroll report XLSX export."""
        content, content_type, ext = self.service.export_payroll_report(
            year=date.today().year,
            month=date.today().month,
            output_format="xlsx",
        )

        self.assertEqual(ext, "xlsx")
        self.assertIsInstance(content, bytes)
        self.assertGreater(len(content), 0)
        self.assertTrue(content.startswith(b"PK"))

    def test_export_payroll_report_csv(self):
        """Test payroll report CSV export (audit fix: CSV previously 400'd)."""
        content, content_type, ext = self.service.export_payroll_report(
            year=date.today().year,
            month=date.today().month,
            output_format="csv",
        )

        self.assertEqual(ext, "csv")
        self.assertEqual(content_type, "text/csv; charset=utf-8")
        self.assertIsInstance(content, bytes)
        # utf-8-sig BOM so Excel detects UTF-8
        self.assertTrue(content.startswith(b"\xef\xbb\xbf"))
        self.assertIn(b"Net Salary", content)

    def test_export_report_rejects_unknown_format(self):
        """An unsupported format raises ValueError so the view can answer
        400 rather than crashing."""
        with self.assertRaises(ValueError):
            self.service.export_payroll_report(
                year=date.today().year,
                month=date.today().month,
                output_format="docx",
            )

    def test_export_payroll_report_pdf(self):
        """Test payroll report PDF export (added in the limitations pass:
        the serializer always advertised pdf but every request 400'd)."""
        content, content_type, ext = self.service.export_payroll_report(
            year=date.today().year,
            month=date.today().month,
            output_format="pdf",
        )

        self.assertEqual(ext, "pdf")
        self.assertEqual(content_type, "application/pdf")
        self.assertIsInstance(content, bytes)
        # Valid PDF magic bytes
        self.assertTrue(content.startswith(b"%PDF"))
        self.assertGreater(len(content), 500)

    def test_xlsx_injection_protection(self):
        """Test that XLSX export protects against formula injection."""
        # Create payroll with formula-like values
        self.payroll.observations = "=SUM(A1:A10)"
        self.payroll.save()

        content, _content_type, _ext = self.service.export_payroll_report(
            year=date.today().year,
            month=date.today().month,
            output_format="xlsx",
        )

        self.assertIsInstance(content, bytes)
        # The value should be written as-is, not executed
        self.assertTrue(content.startswith(b"PK"))
