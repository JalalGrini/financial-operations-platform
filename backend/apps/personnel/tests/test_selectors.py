# apps/personnel/tests/test_selectors.py
"""
Tests for Personnel selectors.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.personnel.models import (
    CNSSMonthlySituation,
    CNSSSituation,
)
from apps.personnel.selectors import (
    CNSSDeclarationSelector,
    CNSSMonthlyDeclarationSelector,
    EmploymentSalarySelector,
    EmploymentSelector,
    MonthlyPayrollRecordSelector,
    PersonnelClassificationSelector,
    PersonnelPersonSelector,
)
from apps.personnel.tests.factories import (
    create_test_cnss_declaration,
    create_test_cnss_monthly,
    create_test_company,
    create_test_employment,
    create_test_payroll,
    create_test_person,
    create_test_salary,
    create_test_user,
)


class PersonnelPersonSelectorTests(TestCase):
    """Tests for PersonnelPersonSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.selector = PersonnelPersonSelector()

    def test_get_all(self):
        """Test getting all non-archived persons."""
        create_test_person(user=self.user)
        create_test_person(first_name="Jane", last_name="Smith", cin="CD789012", user=self.user)

        persons = self.selector.get_all()
        self.assertEqual(persons.count(), 2)

    def test_get_all_with_archived(self):
        """Test getting all persons including archived."""
        create_test_person(user=self.user)
        person2 = create_test_person(first_name="Jane", last_name="Smith", user=self.user)
        person2.archive(user=self.user)

        persons = self.selector.get_all_with_archived()
        self.assertEqual(persons.count(), 2)

    def test_get_by_id(self):
        """Test getting person by ID."""
        person = create_test_person(user=self.user)

        found = self.selector.get_by_id(person.id)
        self.assertEqual(found, person)

    def test_get_by_reference(self):
        """Test getting person by reference."""
        person = create_test_person(user=self.user)

        found = self.selector.get_by_reference(person.reference)
        self.assertEqual(found, person)

    def test_get_by_cin(self):
        """Test getting person by CIN."""
        person = create_test_person(cin="AB123456", user=self.user)

        found = self.selector.get_by_cin("AB123456")
        self.assertEqual(found, person)

    def test_get_by_email(self):
        """Test getting person by email (case-insensitive)."""
        person = create_test_person(email="john@example.com", user=self.user)

        found = self.selector.get_by_email("JOHN@EXAMPLE.COM")
        self.assertEqual(found, person)

    def test_search(self):
        """Test searching persons."""
        create_test_person(first_name="John", last_name="Doe", cin="AB123456", user=self.user)
        create_test_person(first_name="Jane", last_name="Smith", cin="CD789012", user=self.user)

        results = self.selector.search("John")
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().first_name, "John")

        results = self.selector.search("AB123456")
        self.assertEqual(results.count(), 1)

    def test_get_by_company(self):
        """Test getting persons by company."""
        person1 = create_test_person(user=self.user)
        create_test_person(first_name="Jane", last_name="Smith", cin="CD789012", user=self.user)

        create_test_employment(person=person1, company=self.company, user=self.user)
        # person2 has no employment at this company

        persons = self.selector.get_by_company(self.company.id)
        self.assertEqual(persons.count(), 1)
        self.assertEqual(persons.first(), person1)

    def test_get_active(self):
        """Test getting active persons."""
        create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        person2.status = "inactive"
        person2.save()

        active = self.selector.get_active()
        self.assertEqual(active.count(), 1)

    def test_get_with_active_employment(self):
        """Test getting persons with active employment."""
        person1 = create_test_person(user=self.user)
        create_test_person(first_name="Jane", last_name="Smith", cin="CD789012", user=self.user)

        create_test_employment(person=person1, company=self.company, user=self.user)
        # person2 has no employment

        persons = self.selector.get_with_active_employment()
        self.assertEqual(persons.count(), 1)
        self.assertEqual(persons.first(), person1)


class EmploymentSelectorTests(TestCase):
    """Tests for EmploymentSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.company2 = create_test_company(name="Company 2", user=self.user)
        self.selector = EmploymentSelector()

    def test_get_all(self):
        """Test getting all employments."""
        person = create_test_person(user=self.user)
        create_test_employment(person=person, company=self.company, user=self.user)
        create_test_employment(person=person, company=self.company2, user=self.user)

        employments = self.selector.get_all()
        self.assertEqual(employments.count(), 2)

    def test_get_by_person(self):
        """Test getting employments by person."""
        person = create_test_person(user=self.user)
        create_test_employment(person=person, company=self.company, user=self.user)
        create_test_employment(person=person, company=self.company2, user=self.user)

        employments = self.selector.get_by_person(person.id)
        self.assertEqual(employments.count(), 2)

    def test_get_by_company(self):
        """Test getting employments by company."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        employments = self.selector.get_by_company(self.company.id)
        self.assertEqual(employments.count(), 2)

    def test_get_active_for_person(self):
        """Test getting active employments for a person."""
        person = create_test_person(user=self.user)
        emp1 = create_test_employment(person=person, company=self.company, user=self.user)
        emp2 = create_test_employment(person=person, company=self.company2, user=self.user)
        emp2.is_active = False
        emp2.save()

        active = self.selector.get_active_for_person(person.id)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.first(), emp1)

    def test_get_active_for_company(self):
        """Test getting active employments for a company."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        emp2 = create_test_employment(person=person2, company=self.company, user=self.user)
        emp2.is_active = False
        emp2.save()

        active = self.selector.get_active_for_company(self.company.id)
        self.assertEqual(active.count(), 1)

    def test_get_multi_company_employees(self):
        """Test getting persons with employments at multiple companies."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person1, company=self.company2, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        multi_company = self.selector.get_multi_company_employees()
        self.assertEqual(multi_company.count(), 1)
        self.assertEqual(multi_company.first()["person"], person1.id)


class EmploymentSalarySelectorTests(TestCase):
    """Tests for EmploymentSalarySelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.selector = EmploymentSalarySelector()

    def test_get_current_for_employment(self):
        """Test getting current salary for employment."""
        salary = create_test_salary(employment=self.employment, user=self.user)

        current = self.selector.get_current_for_employment(self.employment.id)
        self.assertEqual(current, salary)

    def test_get_valid_on_date(self):
        """Test getting salary valid on a specific date."""
        salary1 = create_test_salary(
            employment=self.employment,
            amount=Decimal("40000.0000"),
            effective_from=date(2020, 1, 1),
            user=self.user,
        )
        salary1.is_current = False
        salary1.effective_to = date(2021, 12, 31)
        salary1.save()

        salary2 = create_test_salary(
            employment=self.employment,
            amount=Decimal("50000.0000"),
            effective_from=date(2022, 1, 1),
            user=self.user,
        )

        # Query for date in 2021
        valid = self.selector.get_valid_on_date(self.employment.id, date(2021, 6, 15))
        self.assertEqual(valid, salary1)

        # Query for date in 2022
        valid = self.selector.get_valid_on_date(self.employment.id, date(2022, 6, 15))
        self.assertEqual(valid, salary2)

    def test_get_history(self):
        """Test getting salary history."""
        create_test_salary(
            employment=self.employment,
            amount=Decimal("40000.0000"),
            effective_from=date(2020, 1, 1),
            user=self.user,
        )
        create_test_salary(
            employment=self.employment,
            amount=Decimal("50000.0000"),
            effective_from=date(2022, 1, 1),
            user=self.user,
        )

        history = self.selector.get_history(self.employment.id)
        self.assertEqual(history.count(), 2)
        # Should be ordered by effective_from descending
        self.assertEqual(history.first().fixed_monthly_gross_salary, Decimal("50000.0000"))


class MonthlyPayrollRecordSelectorTests(TestCase):
    """Tests for MonthlyPayrollRecordSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.company2 = create_test_company(name="Company 2", user=self.user)
        self.person = create_test_person(user=self.user)
        self.person2 = create_test_person(first_name="Jane", last_name="Smith", user=self.user)
        self.employment = create_test_employment(
            person=self.person, company=self.company, user=self.user
        )
        self.employment2 = create_test_employment(
            person=self.person2, company=self.company, user=self.user
        )
        self.salary = create_test_salary(employment=self.employment, user=self.user)
        self.selector = MonthlyPayrollRecordSelector()

    def test_get_for_period(self):
        """Test getting payrolls for a period."""
        create_test_payroll(employment=self.employment, year=2024, month=1, user=self.user)
        create_test_payroll(employment=self.employment, year=2024, month=2, user=self.user)
        create_test_payroll(employment=self.employment2, year=2024, month=1, user=self.user)

        payrolls = self.selector.get_for_period(2024, 1)
        self.assertEqual(payrolls.count(), 2)

    def test_get_for_company_period(self):
        """Test getting payrolls for company and period."""
        create_test_payroll(employment=self.employment, year=2024, month=1, user=self.user)

        company2 = create_test_company(name="Company 2 Extra", user=self.user)
        person2 = create_test_person(first_name="Bob", last_name="Jones", user=self.user)
        emp2 = create_test_employment(person=person2, company=company2, user=self.user)
        create_test_salary(employment=emp2, user=self.user)
        create_test_payroll(employment=emp2, year=2024, month=1, user=self.user)

        payrolls = self.selector.get_for_company_period(self.company.id, 2024, 1)
        self.assertEqual(payrolls.count(), 1)

    def test_get_draft_records(self):
        """Test getting draft payroll records."""
        create_test_payroll(employment=self.employment, status="draft", user=self.user)
        create_test_payroll(
            employment=self.employment, year=2024, month=2, status="calculated", user=self.user
        )
        create_test_payroll(
            employment=self.employment, year=2024, month=3, status="approved", user=self.user
        )

        drafts = self.selector.get_draft_records()
        self.assertEqual(drafts.count(), 1)

    def test_get_approved_records(self):
        """Test getting approved payroll records."""
        create_test_payroll(employment=self.employment, status="draft", user=self.user)
        create_test_payroll(
            employment=self.employment, year=2024, month=2, status="approved", user=self.user
        )

        approved = self.selector.get_approved_records()
        self.assertEqual(approved.count(), 1)

    def test_get_pending_payment(self):
        """Test getting records with remaining payment."""
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payroll.remaining_amount = Decimal("10000.0000")
        payroll.save()

        pending = self.selector.get_pending_payment()
        self.assertEqual(pending.count(), 1)
        self.assertEqual(pending.first(), payroll)


class CNSSDeclarationSelectorTests(TestCase):
    """Tests for CNSSDeclarationSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.company2 = create_test_company(name="Company 2", user=self.user)
        self.selector = CNSSDeclarationSelector()

    def test_get_employee_declared_by_company(self):
        """Test getting employees declared by a company."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_cnss_declaration(person=person1, company=self.company, user=self.user)
        cnss2 = create_test_cnss_declaration(person=person2, company=self.company, user=self.user)
        cnss2.is_currently_declared = False
        cnss2.save()

        declared = self.selector.get_employee_declared_by_company(self.company.id)
        self.assertEqual(declared.count(), 1)
        self.assertEqual(declared.first().person, person1)

    def test_get_cnss_only_persons(self):
        """Test getting CNSS-only persons (no employment)."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_cnss_declaration(
            person=person1, company=self.company, employment=None, user=self.user
        )
        # person2 has employment
        emp = create_test_employment(person=person2, company=self.company, user=self.user)
        create_test_cnss_declaration(
            person=person2, company=self.company, employment=emp, user=self.user
        )

        cnss_only = self.selector.get_cnss_only_persons(self.company.id)
        self.assertEqual(cnss_only.count(), 1)
        self.assertEqual(cnss_only.first().person, person1)

    def test_get_pending_registration(self):
        """Test getting pending CNSS registrations."""
        person = create_test_person(user=self.user)
        cnss = create_test_cnss_declaration(
            person=person,
            company=self.company,
            situation=CNSSSituation.PENDING_REGISTRATION,
            user=self.user,
        )

        pending = self.selector.get_pending_registration()
        self.assertEqual(pending.count(), 1)
        self.assertEqual(pending.first(), cnss)

    def test_get_suspended_declarations(self):
        """Test getting suspended CNSS declarations."""
        person = create_test_person(user=self.user)
        create_test_cnss_declaration(
            person=person,
            company=self.company,
            situation=CNSSSituation.DECLARATION_SUSPENDED,
            user=self.user,
        )

        suspended = self.selector.get_suspended_declarations()
        self.assertEqual(suspended.count(), 1)


class CNSSMonthlyDeclarationSelectorTests(TestCase):
    """Tests for CNSSMonthlyDeclarationSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.person = create_test_person(user=self.user)
        self.cnss = create_test_cnss_declaration(
            person=self.person, company=self.company, user=self.user
        )
        self.selector = CNSSMonthlyDeclarationSelector()

    def test_get_for_period(self):
        """Test getting monthly declarations for a period."""
        create_test_cnss_monthly(cnss_declaration=self.cnss, year=2024, month=1, user=self.user)
        create_test_cnss_monthly(cnss_declaration=self.cnss, year=2024, month=2, user=self.user)

        period = self.selector.get_for_period(2024, 1)
        self.assertEqual(period.count(), 1)

    def test_get_for_company_period(self):
        """Test getting monthly declarations for company and period."""
        create_test_cnss_monthly(cnss_declaration=self.cnss, year=2024, month=1, user=self.user)

        company2 = create_test_company(name="Company 2", user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )
        cnss2 = create_test_cnss_declaration(person=person2, company=company2, user=self.user)
        create_test_cnss_monthly(cnss_declaration=cnss2, year=2024, month=1, user=self.user)

        period = self.selector.get_for_company_period(self.company.id, 2024, 1)
        self.assertEqual(period.count(), 1)

    def test_get_entrant_declarations(self):
        """Test getting entrant declarations."""
        create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=1,
            situation=CNSSMonthlySituation.ENTRANT,
            user=self.user,
        )
        create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=2,
            situation=CNSSMonthlySituation.ACTIVE,
            user=self.user,
        )

        entrants = self.selector.get_entrant_declarations(date.today().year, 1)
        self.assertEqual(entrants.count(), 1)

    def test_get_sortant_declarations(self):
        """Test getting sortant declarations."""
        create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=1,
            situation=CNSSMonthlySituation.SORTANT,
            user=self.user,
        )
        create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=2,
            situation=CNSSMonthlySituation.ACTIVE,
            user=self.user,
        )

        sortants = self.selector.get_sortant_declarations(date.today().year, 1)
        self.assertEqual(sortants.count(), 1)

    def test_get_draft_declarations(self):
        """Test getting draft monthly declarations."""
        create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=3,
            status="draft",
            user=self.user,
        )
        monthly2 = create_test_cnss_monthly(
            cnss_declaration=self.cnss,
            year=date.today().year,
            month=4,
            user=self.user,
        )
        monthly2.status = "submitted"
        monthly2.save()

        drafts = self.selector.get_draft_declarations()
        self.assertEqual(drafts.count(), 1)


class PersonnelClassificationSelectorTests(TestCase):
    """Tests for PersonnelClassificationSelector."""

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.company2 = create_test_company(name="Company 2", user=self.user)
        self.selector = PersonnelClassificationSelector()

    def test_get_active_employees(self):
        """Test getting active employees."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        emp2 = create_test_employment(person=person2, company=self.company, user=self.user)
        emp2.is_active = False
        emp2.save()

        active = self.selector.get_active_employees(self.company.id)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.first(), person1)

    def test_get_employees_declared_to_cnss(self):
        """Test getting employees with CNSS declaration."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        create_test_cnss_declaration(person=person1, company=self.company, user=self.user)
        # person2 has no CNSS declaration

        declared = self.selector.get_employees_declared_to_cnss(self.company.id)
        self.assertEqual(declared.count(), 1)
        self.assertEqual(declared.first(), person1)

    def test_get_employees_not_declared(self):
        """Test getting employees without CNSS declaration."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        create_test_cnss_declaration(person=person1, company=self.company, user=self.user)
        # person2 has no CNSS declaration

        not_declared = self.selector.get_employees_not_declared(self.company.id)
        self.assertEqual(not_declared.count(), 1)
        self.assertEqual(not_declared.first(), person2)

    def test_get_cnss_only_persons(self):
        """Test getting CNSS-only persons."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(first_name="Jane", last_name="Smith", user=self.user)

        create_test_cnss_declaration(
            person=person1, company=self.company, employment=None, user=self.user
        )
        create_test_employment(person=person2, company=self.company, user=self.user)
        create_test_cnss_declaration(person=person2, company=self.company, user=self.user)

        cnss_only = self.selector.get_cnss_only_persons(self.company.id)
        self.assertEqual(cnss_only.count(), 1)
        self.assertEqual(cnss_only.first(), person1)

    def test_get_multi_company_employees(self):
        """Test getting persons working for multiple companies."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person1, company=self.company2, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        multi = self.selector.get_multi_company_employees()
        self.assertEqual(multi.count(), 1)
        self.assertEqual(multi.first(), person1)

    def test_get_incomplete_records(self):
        """Test getting personnel with missing important fields."""
        from apps.personnel.models import PersonnelPerson as PP

        # Person with all important fields filled - should NOT be in results
        person1 = create_test_person(
            cin="AB123456",
            phone="+212600000000",
            email="john.complete@example.com",
            address="123 Main St",
            city="Casablanca",
            date_of_birth=date(1990, 1, 1),
            nationality="Moroccan",
            user=self.user,
        )
        # Person with several missing fields - SHOULD be in results
        person2 = PP.objects.create(
            first_name="Incomplete",
            last_name="Person",
            cin="CD000001",
            phone="+212600000999",
            email="incomplete@example.com",
            address="",  # missing
            city="",  # missing
            date_of_birth=None,  # missing
            nationality="",  # missing
            created_by=self.user,
            updated_by=self.user,
        )

        incomplete = self.selector.get_incomplete_records()
        self.assertIn(person2, list(incomplete))
        self.assertNotIn(person1, list(incomplete))

    def test_get_former_employees(self):
        """Test getting former employees."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        emp2 = create_test_employment(person=person2, company=self.company, user=self.user)
        emp2.is_active = False
        emp2.save()

        former = self.selector.get_former_employees(self.company.id)
        self.assertEqual(former.count(), 1)
        self.assertEqual(former.first(), person2)

    def test_get_currently_undeclared(self):
        """Test getting currently undeclared personnel."""
        person1 = create_test_person(user=self.user)
        person2 = create_test_person(
            first_name="Jane", last_name="Smith", cin="CD789012", user=self.user
        )

        create_test_employment(person=person1, company=self.company, user=self.user)
        create_test_employment(person=person2, company=self.company, user=self.user)

        create_test_cnss_declaration(person=person1, company=self.company, user=self.user)
        # person2 has no CNSS declaration

        undeclared = self.selector.get_currently_undeclared(self.company.id)
        self.assertEqual(undeclared.count(), 1)
        self.assertEqual(undeclared.first(), person2)
