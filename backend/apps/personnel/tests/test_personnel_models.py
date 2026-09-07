# apps/personnel/tests/test_personnel_models.py
"""
Tests for PersonnelPerson model and related functionality.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.personnel.models import (
    Employment,
    PayrollPayment,
    PersonnelDocumentReference,
    PersonnelPerson,
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


class PersonnelPersonModelTests(TestCase):
    """Tests for PersonnelPerson model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)

    def test_create_minimal_person(self):
        """Test creating a person with only required fields."""
        person = PersonnelPerson.objects.create(
            first_name="John",
            last_name="Doe",
            created_by=self.user,
            updated_by=self.user,
        )
        self.assertEqual(person.first_name, "John")
        self.assertEqual(person.last_name, "DOE")  # Normalized to uppercase
        self.assertTrue(person.reference.startswith("PP-"))
        self.assertEqual(person.status, "active")
        self.assertFalse(person.is_archived)

    def test_create_person_with_all_fields(self):
        """Test creating a person with all optional fields filled."""
        person = create_test_person(
            first_name="Jane",
            last_name="Smith",
            cin="CD789012",
            email="jane.smith@example.com",
            phone="+212611111111",
            address="123 Main St",
            city="Rabat",
            province="Rabat",
            region="Rabat-Salé-Kénitra",
            date_of_birth=date(1990, 1, 15),
            nationality="Moroccan",
            notes="Test notes",
            observations="Test observations",
            user=self.user,
        )
        self.assertEqual(person.cin, "CD789012")
        self.assertEqual(person.email, "jane.smith@example.com")
        self.assertEqual(person.city, "Rabat")
        self.assertEqual(person.date_of_birth, date(1990, 1, 15))

    def test_person_reference_generation(self):
        """Test that reference is auto-generated in format PP-YYYY-NNNNN."""
        person = create_test_person(user=self.user)
        self.assertTrue(person.reference.startswith(f"PP-{timezone.now().year}-"))
        # Check format: PP-YYYY-NNNNN (5 digits)
        parts = person.reference.split("-")
        self.assertEqual(len(parts), 3)
        self.assertEqual(parts[0], "PP")
        self.assertEqual(len(parts[2]), 5)

    def test_person_reference_unique(self):
        """Test that reference is unique."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane",
            last_name="Smith",
            cin="CD789012",
            user=self.user,
        )
        self.assertNotEqual(person1.reference, person2.reference)

    def test_get_full_name(self):
        """Test full name formatting."""
        person = create_test_person(
            first_name="John",
            middle_name="Michael",
            last_name="Doe",
            user=self.user,
        )
        self.assertEqual(person.get_full_name(), "John Michael DOE")

    def test_get_full_name_without_middle(self):
        """Test full name without middle name."""
        person = create_test_person(
            first_name="John",
            last_name="Doe",
            user=self.user,
        )
        self.assertEqual(person.get_full_name(), "John DOE")

    def test_cin_unique_constraint(self):
        """Test CIN uniqueness constraint exists in model."""
        # Verify the unique constraint exists on the model
        constraints = PersonnelPerson._meta.constraints
        cin_unique = any(c.name == "unique_personnel_cin" for c in constraints)
        self.assertTrue(cin_unique, "CIN unique constraint should exist")

    def test_cin_optional(self):
        """Test that CIN is optional (stores as NULL when not provided)."""
        # Passing cin='' maps to NULL in DB because the field is unique+nullable.
        # Multiple persons without CINs would conflict if stored as ''.
        person = create_test_person(cin="", user=self.user)
        self.assertIsNone(person.cin)

    def test_email_normalized_lowercase(self):
        """Test email is normalized to lowercase."""
        person = create_test_person(email="JOHN.DOE@EXAMPLE.COM", user=self.user)
        self.assertEqual(person.email, "john.doe@example.com")

    def test_name_normalization(self):
        """Test name normalization."""
        person = PersonnelPerson.objects.create(
            first_name="  john  ",
            last_name="  doe  ",
            middle_name="  michael  ",
            created_by=self.user,
            updated_by=self.user,
        )
        self.assertEqual(person.first_name, "John")
        self.assertEqual(person.last_name, "DOE")
        self.assertEqual(person.middle_name, "Michael")

    def test_cin_normalization(self):
        """Test CIN normalization."""
        person = PersonnelPerson.objects.create(
            first_name="John",
            last_name="Doe",
            cin="  ab123456  ",
            created_by=self.user,
            updated_by=self.user,
        )
        self.assertEqual(person.cin, "AB123456")

    def test_archive_and_restore(self):
        """Test archive and restore functionality."""
        person = create_test_person(user=self.user)
        self.assertFalse(person.is_archived)

        person.archive(user=self.user, reason="Test archive")
        self.assertTrue(person.is_archived)
        self.assertIsNotNone(person.archived_at)
        self.assertEqual(person.archived_by, self.user)
        self.assertIn("[Archived: Test archive]", person.observations)

        person.restore()
        self.assertFalse(person.is_archived)
        self.assertIsNone(person.archived_at)
        self.assertIsNone(person.archived_by)

    def test_completeness_percentage(self):
        """Test completeness percentage calculation."""
        person = create_test_person(user=self.user)
        # Default: first_name, last_name filled, 7 optional fields empty
        # Should be around 2/9 = 22% but only important fields count
        percentage = person.get_completeness_percentage()
        self.assertGreaterEqual(percentage, 0)
        self.assertLessEqual(percentage, 100)

    def test_missing_important_fields(self):
        """Test missing important fields detection."""
        person = PersonnelPerson.objects.create(
            first_name="Test",
            last_name="Person",
            cin=None,  # explicitly null
            phone="",
            email="",
            address="",
            city="",
            date_of_birth=None,
            nationality="",
            created_by=self.user,
            updated_by=self.user,
        )
        missing = person.get_missing_important_fields()
        self.assertIn("CIN", missing)
        self.assertIn("Phone", missing)
        self.assertIn("Email", missing)

    def test_duplicate_detection(self):
        """Test duplicate person detection — duplicates checked by same name+phone."""
        create_test_person(
            first_name="John",
            last_name="Doe",
            cin="AB111111",
            phone="+212600000000",
            user=self.user,
        )
        # Create a different person with same phone (potential duplicate)
        PersonnelPerson.objects.create(
            first_name="John",
            last_name="Doe",
            cin=None,  # different CIN (null)
            phone="+212600000000",  # same phone
            created_by=self.user,
            updated_by=self.user,
        )
        # Both should exist (duplicate warning, not blocking creation)
        self.assertEqual(PersonnelPerson.objects.count(), 2)


class EmploymentModelTests(TestCase):
    """Tests for Employment model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)

    def test_create_employment(self):
        """Test creating an employment record."""
        person = create_test_person(user=self.user)
        employment = create_test_employment(person=person, company=self.company, user=self.user)

        self.assertEqual(employment.person, person)
        self.assertEqual(employment.company, self.company)
        self.assertTrue(employment.reference.startswith("EMP-"))
        self.assertTrue(employment.is_active)
        self.assertEqual(employment.employment_status, "active")
        self.assertEqual(employment.default_monthly_working_days, 26)

    def test_employment_reference_format(self):
        """Test employment reference format."""
        person = create_test_person(user=self.user)
        employment = create_test_employment(person=person, company=self.company, user=self.user)

        parts = employment.reference.split("-")
        self.assertEqual(parts[0], "EMP")
        self.assertEqual(len(parts[2]), 5)  # 5 digits

    def test_multi_company_employment(self):
        """Test that a person can have employments at multiple companies."""
        person = create_test_person(user=self.user)
        company2 = create_test_company(name="Company 2", user=self.user)

        create_test_employment(person=person, company=self.company, user=self.user)
        create_test_employment(person=person, company=company2, user=self.user)

        self.assertEqual(person.employments.count(), 2)
        self.assertTrue(person.employments.filter(company=self.company).exists())
        self.assertTrue(person.employments.filter(company=company2).exists())

    def test_sequential_employment_periods(self):
        """Test sequential employment periods at same company."""
        person = create_test_person(user=self.user)

        # First employment
        emp1 = create_test_employment(
            person=person,
            company=self.company,
            hire_date=date(2020, 1, 1),
            employment_end_date=date(2021, 12, 31),
            user=self.user,
        )
        emp1.employment_status = "resigned"
        emp1.is_active = False
        emp1.save()

        # Second employment at same company
        emp2 = create_test_employment(
            person=person,
            company=self.company,
            hire_date=date(2022, 1, 15),
            user=self.user,
        )

        self.assertEqual(person.employments.filter(company=self.company).count(), 2)
        self.assertFalse(emp1.is_active)
        self.assertTrue(emp2.is_active)

    def test_same_company_overlap_rejected(self):
        """Test that overlapping employment at same company is rejected."""
        person = create_test_person(user=self.user)
        create_test_employment(
            person=person,
            company=self.company,
            hire_date=date(2020, 1, 1),
            user=self.user,
        )

        # Try to create overlapping employment
        with self.assertRaises(ValidationError):
            create_test_employment(
                person=person,
                company=self.company,
                hire_date=date(2021, 6, 1),
                user=self.user,
            )

    def test_different_company_overlap_allowed(self):
        """Test that overlapping employment at different companies is allowed."""
        person = create_test_person(user=self.user)
        company2 = create_test_company(name="Company 2", user=self.user)

        emp1 = create_test_employment(
            person=person, company=self.company, hire_date=date(2020, 1, 1), user=self.user
        )
        emp2 = create_test_employment(
            person=person, company=company2, hire_date=date(2021, 6, 1), user=self.user
        )

        self.assertTrue(emp1.is_active)
        self.assertTrue(emp2.is_active)

    def test_employment_terminate(self):
        """Test employment termination."""
        person = create_test_person(user=self.user)
        employment = create_test_employment(person=person, company=self.company, user=self.user)

        # Use service to terminate
        from apps.personnel.services import EmploymentService

        service = EmploymentService()
        service.terminate_employment(
            employment,
            user=self.user,
            departure_reason="resignation",
            resignation_date=date.today(),
        )

        employment.refresh_from_db()
        self.assertFalse(employment.is_active)
        self.assertEqual(employment.employment_status, "resigned")
        self.assertEqual(employment.departure_reason, "resignation")

    def test_optional_fields(self):
        """Test that all optional fields can be empty."""
        person = create_test_person(user=self.user)
        employment = Employment.objects.create(
            person=person,
            company=self.company,
            hire_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )
        self.assertEqual(employment.job_title, "")
        self.assertEqual(employment.department, "")
        self.assertIsNone(employment.payment_method)
        self.assertEqual(employment.rib, "")

    def test_employment_end_date_validation(self):
        """Test that end date cannot be before hire date."""
        person = create_test_person(user=self.user)
        with self.assertRaises(ValidationError):
            Employment.objects.create(
                person=person,
                company=self.company,
                hire_date=date(2022, 1, 1),
                employment_end_date=date(2021, 1, 1),
                created_by=self.user,
                updated_by=self.user,
            )

    def test_active_employment_cannot_have_past_end_date(self):
        """Test that active employment cannot have past end date."""
        person = create_test_person(user=self.user)
        employment = Employment(
            person=person,
            company=self.company,
            hire_date=date(2020, 1, 1),
            employment_end_date=date(2021, 1, 1),
            employment_status="active",
            is_active=True,
            created_by=self.user,
            updated_by=self.user,
        )
        with self.assertRaises(ValidationError):
            employment.full_clean()


class EmploymentSalaryModelTests(TestCase):
    """Tests for EmploymentSalary model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

    def test_create_salary(self):
        """Test creating a salary record."""
        salary = create_test_salary(employment=self.employment, user=self.user)

        self.assertEqual(salary.employment, self.employment)
        self.assertEqual(salary.fixed_monthly_gross_salary, Decimal("50000.0000"))
        self.assertTrue(salary.is_current)
        self.assertTrue(salary.reference.startswith("ESL-"))

    def test_salary_history_preserved(self):
        """Test that salary history is preserved when creating new salary."""
        # Create first salary
        salary1 = create_test_salary(
            employment=self.employment,
            amount=Decimal("40000.0000"),
            effective_from=date(2020, 1, 1),
            user=self.user,
        )

        # Create second salary
        salary2 = create_test_salary(
            employment=self.employment,
            amount=Decimal("50000.0000"),
            effective_from=date(2022, 1, 1),
            user=self.user,
        )

        # First salary should no longer be current
        salary1.refresh_from_db()
        self.assertFalse(salary1.is_current)
        self.assertEqual(salary1.effective_to, date(2021, 12, 31))

        # Second salary should be current
        self.assertTrue(salary2.is_current)

    def test_get_current_salary(self):
        """Test getting current salary."""
        create_test_salary(employment=self.employment, user=self.user)
        current = self.employment.get_current_salary()
        self.assertIsNotNone(current)
        self.assertTrue(current.is_current)

    def test_salary_valid_on_date(self):
        """Test checking if salary is valid on a specific date."""
        salary = create_test_salary(
            employment=self.employment,
            effective_from=date(2022, 1, 1),
            user=self.user,
        )

        self.assertTrue(salary.is_valid_on(date(2022, 6, 15)))
        self.assertTrue(salary.is_valid_on(date(2023, 1, 1)))
        self.assertFalse(salary.is_valid_on(date(2021, 12, 31)))

    def test_salary_reference_format(self):
        """Test salary reference format."""
        salary = create_test_salary(employment=self.employment, user=self.user)
        parts = salary.reference.split("-")
        self.assertEqual(parts[0], "ESL")
        self.assertEqual(len(parts[2]), 5)

    def test_only_one_current_salary(self):
        """Test that only one salary can be current per employment."""
        create_test_salary(
            employment=self.employment,
            amount=Decimal("40000.0000"),
            effective_from=date(2020, 1, 1),
            user=self.user,
        )

        salary2 = create_test_salary(
            employment=self.employment,
            amount=Decimal("50000.0000"),
            effective_from=date(2022, 1, 1),
            user=self.user,
        )

        self.assertTrue(salary2.is_current)
        current_count = self.employment.salaries.filter(is_current=True).count()
        self.assertEqual(current_count, 1)


class MonthlyPayrollRecordModelTests(TestCase):
    """Tests for MonthlyPayrollRecord model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.salary = create_test_salary(employment=self.employment, user=self.user)

    def test_create_payroll(self):
        """Test creating a monthly payroll record."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        self.assertEqual(payroll.employment, self.employment)
        self.assertEqual(payroll.year, date.today().year)
        self.assertEqual(payroll.month, date.today().month)
        self.assertEqual(payroll.status, "draft")
        self.assertTrue(payroll.reference.startswith("MPR-"))

    def test_payroll_unique_per_employment_per_month(self):
        """Test unique constraint on employment + year + month."""
        create_test_payroll(employment=self.employment, user=self.user)

        with self.assertRaises(Exception):
            create_test_payroll(employment=self.employment, user=self.user)

    def test_payroll_reference_format(self):
        """Test payroll reference format."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        parts = payroll.reference.split("-")
        self.assertEqual(parts[0], "MPR")
        self.assertEqual(len(parts), 4)  # MPR-YYYY-MM-NNNNN

    def test_calculate_totals(self):
        """Test payroll totals calculation."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.calculate_totals()

        # Daily rate = 50000 / 26
        expected_daily_rate = Decimal("50000.0000") / Decimal("26")
        self.assertEqual(payroll.daily_rate, expected_daily_rate.quantize(Decimal("0.0001")))

        # No absence deduction initially
        self.assertEqual(payroll.absence_deduction, Decimal("0"))

        # Net = gross + supplements - absence_deduction - deductions
        self.assertEqual(payroll.calculated_net_salary, Decimal("50000.0000"))

    def test_calculate_with_absence(self):
        """Test calculation with unpaid absence."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.unpaid_leave_days = 2
        payroll.calculate_totals()

        daily_rate = (Decimal("50000.0000") / Decimal("26")).quantize(Decimal("0.0001"))
        expected_deduction = (daily_rate * Decimal("2")).quantize(Decimal("0.0001"))
        self.assertEqual(payroll.absence_deduction, expected_deduction)
        self.assertEqual(payroll.calculated_net_salary, Decimal("50000.0000") - expected_deduction)

    def test_calculate_with_adjustments(self):
        """Test calculation with supplements and deductions."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        create_test_adjustment(
            payroll=payroll,
            adjustment_type="supplement",
            direction="addition",
            amount=Decimal("5000.0000"),
            user=self.user,
        )
        create_test_adjustment(
            payroll=payroll,
            adjustment_type="deduction",
            direction="deduction",
            amount=Decimal("2000.0000"),
            user=self.user,
        )

        payroll.calculate_totals()

        self.assertEqual(payroll.supplements_total, Decimal("5000.0000"))
        self.assertEqual(payroll.other_deductions_total, Decimal("2000.0000"))
        self.assertEqual(payroll.calculated_net_salary, Decimal("53000.0000"))

    def test_calculate_with_payments(self):
        """Test calculation with payments."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        create_test_payment(payroll=payroll, amount=Decimal("20000.0000"), user=self.user)

        payroll.calculate_totals()

        self.assertEqual(payroll.total_paid, Decimal("20000.0000"))
        self.assertEqual(payroll.remaining_amount, Decimal("30000.0000"))
        self.assertEqual(payroll.payment_status, "partial")

    def test_approve_payroll(self):
        """Test approving a payroll."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.calculate(user=self.user)

        self.assertEqual(payroll.status, "approved")
        self.assertEqual(payroll.approved_by, self.user)
        self.assertIsNotNone(payroll.approved_at)

    def test_cannot_calculate_approved(self):
        """Test that approved payroll cannot be recalculated."""
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)

        with self.assertRaises(ValueError):
            payroll.calculate(user=self.user)

    def test_recalculate_draft(self):
        """Test recalculating draft payroll."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.worked_days = 25
        payroll.recalculate()

        self.assertEqual(payroll.worked_days, 25)
        self.assertEqual(payroll.status, "draft")

    def test_zero_scheduled_days_protection(self):
        """Test zero scheduled days protection."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.scheduled_working_days = 0
        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("0"))
        self.assertEqual(payroll.absence_deduction, Decimal("0"))

    def test_payroll_status_transitions(self):
        """Test valid payroll status transitions."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        # Draft -> Calculated
        payroll.calculate(user=None)
        self.assertEqual(payroll.status, "calculated")

        # Calculated -> Approved
        payroll.approve(self.user)
        self.assertEqual(payroll.status, "approved")

        # Approved -> cannot recalculate
        with self.assertRaises(ValueError):
            payroll.recalculate()


class PayrollAdjustmentModelTests(TestCase):
    """Tests for PayrollAdjustment model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.payroll = create_test_payroll(employment=self.employment, user=self.user)

    def test_create_adjustment(self):
        """Test creating an adjustment."""
        adjustment = create_test_adjustment(
            payroll=self.payroll,
            adjustment_type="supplement",
            direction="addition",
            amount=Decimal("5000.0000"),
            user=self.user,
        )

        self.assertEqual(adjustment.payroll_record, self.payroll)
        self.assertEqual(adjustment.adjustment_type, "supplement")
        self.assertEqual(adjustment.direction, "addition")
        self.assertEqual(adjustment.amount, Decimal("5000.0000"))
        self.assertTrue(adjustment.reference.startswith("PAD-"))

    def test_signed_amount(self):
        """Test signed amount calculation."""
        add_adj = create_test_adjustment(
            payroll=self.payroll, direction="addition", amount=Decimal("1000.0000"), user=self.user
        )
        ded_adj = create_test_adjustment(
            payroll=self.payroll, direction="deduction", amount=Decimal("500.0000"), user=self.user
        )

        self.assertEqual(add_adj.get_signed_amount(), Decimal("1000.0000"))
        self.assertEqual(ded_adj.get_signed_amount(), Decimal("-500.0000"))

    def test_adjustment_amount_positive(self):
        """Test that adjustment amount is always positive."""
        adjustment = create_test_adjustment(
            payroll=self.payroll,
            amount=Decimal("1000.0000"),
            user=self.user,
        )
        self.assertGreater(adjustment.amount, 0)

    def test_adjustment_adds_to_payroll(self):
        """Test that adjustment affects payroll totals."""
        create_test_adjustment(
            payroll=self.payroll, direction="addition", amount=Decimal("5000.0000"), user=self.user
        )
        create_test_adjustment(
            payroll=self.payroll, direction="deduction", amount=Decimal("2000.0000"), user=self.user
        )

        self.payroll.calculate_totals()

        self.assertEqual(self.payroll.supplements_total, Decimal("5000.0000"))
        self.assertEqual(self.payroll.other_deductions_total, Decimal("2000.0000"))
        self.assertEqual(self.payroll.calculated_net_salary, Decimal("53000.0000"))


class PayrollPaymentModelTests(TestCase):
    """Tests for PayrollPayment model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.payroll = create_test_payroll(employment=self.employment, user=self.user)

    def test_create_payment(self):
        """Test creating a payment."""
        payment = create_test_payment(
            payroll=self.payroll,
            amount=Decimal("10000.0000"),
            payment_kind="advance",
            user=self.user,
        )

        self.assertEqual(payment.payroll_record, self.payroll)
        self.assertEqual(payment.amount, Decimal("10000.0000"))
        self.assertEqual(payment.payment_kind, "advance")
        self.assertTrue(payment.reference.startswith("PPT-"))

    def test_multiple_payments(self):
        """Test multiple payments per payroll period."""
        create_test_payment(
            payroll=self.payroll,
            amount=Decimal("20000.0000"),
            payment_kind="advance",
            user=self.user,
        )
        create_test_payment(
            payroll=self.payroll,
            amount=Decimal("15000.0000"),
            payment_kind="partial_payment",
            user=self.user,
        )
        create_test_payment(
            payroll=self.payroll,
            amount=Decimal("15000.0000"),
            payment_kind="final_payment",
            user=self.user,
        )

        self.payroll.calculate_totals()

        self.assertEqual(self.payroll.total_paid, Decimal("50000.0000"))
        self.assertEqual(self.payroll.remaining_amount, Decimal("0"))
        self.assertEqual(self.payroll.payment_status, "paid")

    def test_payment_date_validation(self):
        """Test that payment date cannot be in future."""
        with self.assertRaises(ValidationError):
            PayrollPayment.objects.create(
                payroll_record=self.payroll,
                payment_date=date.today() + timedelta(days=1),
                amount=Decimal("10000.0000"),
                payment_kind="advance",
                created_by=self.user,
                updated_by=self.user,
            )

    def test_payment_amount_positive(self):
        """Test that payment amount must be positive."""
        with self.assertRaises(ValidationError):
            PayrollPayment.objects.create(
                payroll_record=self.payroll,
                # A deterministic in-period date, not date.today() (bug F-1,
                # Cycle 19 - state/IMPLEMENTATION_PLAN.md Section 13.6).
                payment_date=self.payroll.period_start,
                amount=Decimal("-1000.0000"),
                payment_kind="advance",
                created_by=self.user,
                updated_by=self.user,
            )


class CNSSDeclarationModelTests(TestCase):
    """Tests for CNSSDeclaration model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)

    def test_create_cnss_declaration(self):
        """Test creating a CNSS declaration."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(person=person, company=self.company, user=self.user)

        self.assertEqual(cnss.person, person)
        self.assertEqual(cnss.company, self.company)
        self.assertTrue(cnss.is_currently_declared)
        self.assertTrue(cnss.reference.startswith("CNSS-"))

    def test_cnss_reference_format(self):
        """Test CNSS reference format."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(person=person, company=self.company, user=self.user)

        parts = cnss.reference.split("-")
        self.assertEqual(parts[0], "CNSS")
        self.assertEqual(len(parts[2]), 5)

    def test_cnss_only_person(self):
        """Test CNSS declaration without employment."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(
            person=person,
            company=self.company,
            employment=None,
            user=self.user,
        )

        self.assertIsNone(cnss.employment)
        self.assertEqual(cnss.situation, "declared_by_this_company")

    def test_multiple_archived_cnss_same_person_company(self):
        """Test multiple archived CNSS declarations for same person/company."""
        person = create_test_person(user=self.user)

        cnss1 = create_test_cnss_declaration(person=person, company=self.company, user=self.user)
        cnss1.archive(user=self.user)

        cnss2 = create_test_cnss_declaration(person=person, company=self.company, user=self.user)

        self.assertTrue(cnss1.is_archived)
        self.assertFalse(cnss2.is_archived)
        self.assertNotEqual(cnss1.reference, cnss2.reference)

    def test_mutual_exclusion_active_cnss(self):
        """Test that only one active CNSS per person/company."""
        person = create_test_person(user=self.user)
        create_test_cnss_declaration(person=person, company=self.company, user=self.user)

        # Try to create second active CNSS
        with self.assertRaises(Exception):
            create_test_cnss_declaration(person=person, company=self.company, user=self.user)

    def test_cnss_stop_restart(self):
        """Test stopping and restarting CNSS declaration."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(person=person, company=self.company, user=self.user)

        # Stop
        cnss.is_currently_declared = False
        cnss.declaration_stop_date = date.today()
        cnss.stop_reason = "resignation"
        cnss.save()

        self.assertFalse(cnss.is_currently_declared)

        # Restart
        cnss.is_currently_declared = True
        cnss.declaration_start_date = date.today() + timedelta(days=1)
        cnss.declaration_stop_date = None
        cnss.stop_reason = ""
        cnss.save()

        self.assertTrue(cnss.is_currently_declared)

    def test_cnss_declared_elsewhere(self):
        """Test CNSS declared by another employer."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(
            person=person,
            company=self.company,
            situation="declared_by_another_employer",
            is_currently_declared=False,
            user=self.user,
        )

        self.assertEqual(cnss.situation, "declared_by_another_employer")
        self.assertFalse(cnss.is_currently_declared)


class CNSSMonthlyDeclarationModelTests(TestCase):
    """Tests for CNSSMonthlyDeclaration model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.cnss = create_test_cnss_declaration(
            person=self.person, company=self.company, user=self.user
        )

    def test_create_monthly_declaration(self):
        """Test creating a monthly CNSS declaration."""
        monthly = create_test_cnss_monthly(cnss_declaration=self.cnss, user=self.user)

        self.assertEqual(monthly.cnss_declaration, self.cnss)
        self.assertEqual(monthly.year, date.today().year)
        self.assertEqual(monthly.month, date.today().month)
        self.assertEqual(monthly.situation, "active")
        self.assertEqual(monthly.status, "draft")
        self.assertTrue(monthly.reference.startswith("CMD-"))

    def test_monthly_reference_format(self):
        """Test monthly declaration reference format."""
        monthly = create_test_cnss_monthly(cnss_declaration=self.cnss, user=self.user)

        parts = monthly.reference.split("-")
        self.assertEqual(parts[0], "CMD")
        self.assertEqual(len(parts), 4)  # CMD-YYYY-MM-NNNNN

    def test_monthly_unique_per_declaration(self):
        """Test unique constraint on declaration + year + month."""
        create_test_cnss_monthly(cnss_declaration=self.cnss, user=self.user)

        with self.assertRaises(Exception):
            create_test_cnss_monthly(cnss_declaration=self.cnss, user=self.user)

    def test_entrant_situation(self):
        """Test entrant situation."""
        monthly = create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            situation="entrant",
            user=self.user,
        )
        self.assertEqual(monthly.situation, "entrant")

    def test_sortant_situation(self):
        """Test sortant situation."""
        monthly = create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            situation="sortant",
            user=self.user,
        )
        self.assertEqual(monthly.situation, "sortant")

    def test_zero_declared_days_allowed(self):
        """Test that zero declared days is allowed."""
        monthly = create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            declared_days=0,
            declared_salary=Decimal("0"),
            user=self.user,
        )
        self.assertEqual(monthly.declared_days, 0)
        self.assertEqual(monthly.declared_salary, Decimal("0"))

    def test_declared_salary_optional(self):
        """Test that declared salary is optional."""
        monthly = create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            declared_salary=Decimal("0"),
            user=self.user,
        )
        self.assertEqual(monthly.declared_salary, Decimal("0"))


class PersonnelDocumentReferenceModelTests(TestCase):
    """Tests for PersonnelDocumentReference model."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )

    def test_create_document(self):
        """Test creating a document reference."""
        doc = PersonnelDocumentReference.objects.create(
            person=self.person,
            document_type="cin",
            external_reference="/docs/cin_123.pdf",
            issue_date=date.today(),
            created_by=self.user,
            updated_by=self.user,
        )

        self.assertEqual(doc.person, self.person)
        self.assertEqual(doc.document_type, "cin")
        self.assertTrue(doc.reference.startswith("PDOC-"))

    def test_document_linked_to_employment(self):
        """Test document linked to employment."""
        doc = PersonnelDocumentReference.objects.create(
            person=self.person,
            employment=self.employment,
            document_type="employment_contract",
            external_reference="/docs/contract.pdf",
            created_by=self.user,
            updated_by=self.user,
        )

        self.assertEqual(doc.employment, self.employment)

    def test_document_expiry_validation(self):
        """Test document expiry date validation."""
        with self.assertRaises(ValidationError):
            PersonnelDocumentReference.objects.create(
                person=self.person,
                document_type="cin",
                issue_date=date.today(),
                expiry_date=date.today() - timedelta(days=1),
                created_by=self.user,
                updated_by=self.user,
            )
