"""Behavioural regression tests for the Cycle 25 write-atomicity fixes.

See state/IMPLEMENTATION_PLAN.md Section 19 for the full defect list
(findings A-1 through A-9) and the fix (wrapping each multi-write function in
transaction.atomic).

These use TransactionTestCase deliberately, not TestCase: TestCase wraps each
test in an outer transaction that would roll back any partial commit anyway,
masking exactly the defect being tested here. TransactionTestCase commits for
real, matching production (no ATOMIC_REQUESTS is configured anywhere in this
project).
"""

from datetime import date
from unittest import mock

from django.test import TransactionTestCase

from apps.personnel.models import CNSSDeclaration, EmploymentSalary
from apps.personnel.services import CNSSService, EmploymentService
from apps.personnel.tests.factories import (
    create_test_company,
    create_test_employment,
    create_test_person,
    create_test_salary,
    create_test_user,
)


class Cycle25EmploymentSalarySaveAtomicityTests(TransactionTestCase):
    """A-1: EmploymentSalary.save() demotes every other current salary, then
    saves itself. A failure in the save used to leave the employment with
    zero current salaries because the demote had already committed."""

    def test_a_failed_save_does_not_leave_the_employment_with_no_current_salary(self):
        user = create_test_user(email="c25-salary-atomic@example.com")
        employment = create_test_employment(user=user)
        good = create_test_salary(employment=employment, user=user)
        self.assertTrue(
            EmploymentSalary.objects.filter(employment=employment, is_current=True).exists()
        )

        # A real (not mocked) integrity failure: the money column is required.
        bad = EmploymentSalary(
            employment=employment,
            fixed_monthly_gross_salary=None,
            effective_from=date(2025, 6, 1),
            is_current=True,
            created_by=user,
        )
        with self.assertRaises(Exception):
            bad.save()

        # The invariant must survive the failure: the employment must still
        # have exactly one current salary, and it must be the original one.
        current = EmploymentSalary.objects.filter(employment=employment, is_current=True)
        self.assertEqual(current.count(), 1)
        self.assertEqual(current.first().pk, good.pk)


class Cycle25CnssCreateAtomicityTests(TransactionTestCase):
    """A-2: CNSSService.create_cnss_declaration deactivates the existing
    current declaration, then creates the replacement. A failure in the
    create used to leave the person with zero current declarations."""

    def test_a_failed_create_does_not_leave_the_person_undeclared(self):
        user = create_test_user(email="c25-cnss-create-atomic@example.com")
        person = create_test_person(user=user)
        company = create_test_company(user=user)
        employment = create_test_employment(person=person, company=company, user=user)

        service = CNSSService()
        original = service.create_cnss_declaration(
            person=person,
            company=company,
            employment=employment,
            cnss_number="12345678",
            user=user,
        )
        self.assertTrue(original.is_currently_declared)

        with mock.patch.object(
            CNSSDeclaration.objects, "create", side_effect=RuntimeError("injected failure")
        ):
            with self.assertRaises(RuntimeError):
                service.create_cnss_declaration(
                    person=person,
                    company=company,
                    employment=employment,
                    cnss_number="87654321",
                    user=user,
                )

        original.refresh_from_db()
        self.assertTrue(
            original.is_currently_declared,
            "the original declaration must still be active after the failed " "replacement attempt",
        )
        self.assertEqual(
            CNSSDeclaration.objects.filter(
                person=person, company=company, is_currently_declared=True
            ).count(),
            1,
        )


class Cycle25TerminateEmploymentAtomicityTests(TransactionTestCase):
    """A-3: terminate_employment saves the employment, then stops the linked
    CNSS declaration. A failure in the second save used to leave a departed
    employee still marked as CNSS-declared."""

    def test_a_failed_cnss_stop_does_not_leave_a_terminated_employee_declared(self):
        user = create_test_user(email="c25-terminate-atomic@example.com")
        person = create_test_person(user=user)
        company = create_test_company(user=user)
        employment = create_test_employment(person=person, company=company, user=user)

        cnss = CNSSService().create_cnss_declaration(
            person=person,
            company=company,
            employment=employment,
            cnss_number="11223344",
            user=user,
        )
        self.assertTrue(employment.is_active)
        self.assertTrue(cnss.is_currently_declared)

        with mock.patch.object(
            CNSSDeclaration, "save", side_effect=RuntimeError("injected failure")
        ):
            with self.assertRaises(RuntimeError):
                EmploymentService().terminate_employment(
                    employment=employment, user=user, departure_reason="cycle25 probe"
                )

        employment.refresh_from_db()
        cnss.refresh_from_db()
        self.assertTrue(
            employment.is_active,
            "the employment save must have rolled back too, since it shares "
            "a transaction with the failed CNSS save",
        )
        self.assertTrue(cnss.is_currently_declared)
        # The key invariant this fix protects: never active=False + declared=True.
        self.assertFalse(not employment.is_active and cnss.is_currently_declared)
