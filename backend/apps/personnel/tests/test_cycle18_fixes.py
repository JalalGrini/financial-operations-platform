# apps/personnel/tests/test_cycle18_fixes.py
"""
Cycle 18 regression tests (state/IMPLEMENTATION_PLAN.md Section 12).

Covers, one test class per finding:
- D-1: service mutations that touch more than one row must be atomic.
- D-2: the generic soft-delete API must refuse to archive/purge financial
  rows belonging to an approved/paid payroll (policy hook on
  SoftDeleteViewSetMixin).
- D-3: personnel financial foreign keys must be PROTECT, not CASCADE, plus
  a structural guard against silent regression back to CASCADE.
- C-4: void_payment must cancel, never delete, a payment row.

Each class first documents (in its docstring) the pre-Cycle-18 broken
behavior that was proven with throwaway scratch probes during the
architect pass, then asserts the fixed behavior.
"""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.personnel.models import (
    CNSSMonthlyDeclaration,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PayrollPaymentStatus,
)
from apps.personnel.services import MonthlyPayrollService
from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_cnss_declaration,
    create_test_cnss_monthly,
    create_test_company,
    create_test_employment,
    create_test_payment,
    create_test_payroll,
    create_test_salary,
    create_test_user,
)


class VoidPaymentCancelsNotDeletesTests(TestCase):
    """C-4: void_payment must mark CANCELLED, never delete the row.

    Pre-Cycle-18, void_payment() called payment.delete(), which (a) erased
    audit history and (b) had no guard against voiding a payment that
    belongs to an approved/paid payroll.
    """

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(company=self.company, user=self.user)
        self.service = MonthlyPayrollService()

    def test_void_payment_marks_cancelled_and_preserves_row(self):
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payment = create_test_payment(payroll=payroll, amount=Decimal("5000.0000"), user=self.user)

        self.service.void_payment(payment, user=self.user)

        payment.refresh_from_db()
        self.assertTrue(PayrollPayment.objects.filter(pk=payment.pk).exists())
        self.assertEqual(payment.status, PayrollPaymentStatus.CANCELLED)
        self.assertIsNotNone(payment.cancelled_at)
        self.assertEqual(payment.cancelled_by, self.user)

    def test_cancelled_payment_excluded_from_total_paid(self):
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        create_test_payment(payroll=payroll, amount=Decimal("3000.0000"), user=self.user)
        voided = create_test_payment(payroll=payroll, amount=Decimal("2000.0000"), user=self.user)

        self.service.void_payment(voided, user=self.user)

        payroll.refresh_from_db()
        self.assertEqual(payroll.total_paid, Decimal("3000.0000"))

    def test_void_payment_refused_on_approved_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        payment = create_test_payment(payroll=payroll, user=self.user)

        with self.assertRaises(DjangoValidationError):
            self.service.void_payment(payment, user=self.user)

        payment.refresh_from_db()
        self.assertEqual(payment.status, PayrollPaymentStatus.RECORDED)

    def test_void_payment_refused_when_already_cancelled(self):
        payroll = create_test_payroll(employment=self.employment, user=self.user)
        payment = create_test_payment(payroll=payroll, user=self.user)
        self.service.void_payment(payment, user=self.user)

        with self.assertRaises(DjangoValidationError):
            self.service.void_payment(payment, user=self.user)


class ServiceMutationsAreAtomicTests(TestCase):
    """D-1: multi-row service mutations must roll back together.

    Pre-Cycle-18, record_payment() and add_adjustment() saved the child row
    and then the parent payroll's recalculated totals as two separate
    un-wrapped writes; a failure between them left the child row committed
    but the payroll totals stale. Proven during the architect pass with a
    scratch probe that forced an exception between the two saves.
    """

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(company=self.company, user=self.user)
        self.service = MonthlyPayrollService()

    def test_record_payment_rolls_back_on_failure_after_payment_created(self):
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        with patch.object(MonthlyPayrollRecord, "save", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.service.record_payment(
                    payroll=payroll,
                    amount=Decimal("1000.0000"),
                    payment_date=payroll.period_start,
                    payment_kind="advance",
                    user=self.user,
                )

        # Because record_payment is @transaction.atomic, the PayrollPayment
        # insert must have been rolled back along with the failed payroll save.
        self.assertEqual(PayrollPayment.objects.filter(payroll_record=payroll).count(), 0)

    def test_add_adjustment_rolls_back_on_failure_after_adjustment_created(self):
        payroll = create_test_payroll(employment=self.employment, user=self.user)

        with patch.object(MonthlyPayrollRecord, "save", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.service.add_adjustment(
                    payroll=payroll,
                    adjustment_type="supplement",
                    direction="addition",
                    amount=Decimal("500.0000"),
                    description="test",
                    effective_date=payroll.period_start,
                    user=self.user,
                )

        self.assertEqual(PayrollAdjustment.objects.filter(payroll_record=payroll).count(), 0)


class FinancialForeignKeysArePotectedTests(TestCase):
    """D-3: personnel financial FKs must be PROTECT, not CASCADE.

    Pre-Cycle-18, deleting an Employment (or a MonthlyPayrollRecord) hard-
    cascaded and silently wiped out EmploymentSalary/MonthlyPayrollRecord/
    PayrollAdjustment/PayrollPayment/CNSSMonthlyDeclaration rows - i.e. a
    financial record could vanish as a side effect of deleting something
    else, with no error and no trace. Now every one of those deletes must
    raise ProtectedError instead.
    """

    def setUp(self):
        self.user = create_test_user()
        self.company = create_test_company(user=self.user)

    def test_deleting_employment_with_salary_is_protected(self):
        employment = create_test_employment(company=self.company, user=self.user)
        create_test_salary(employment=employment, user=self.user)

        with self.assertRaises(ProtectedError):
            employment.delete()

    def test_deleting_employment_with_payroll_record_is_protected(self):
        employment = create_test_employment(company=self.company, user=self.user)
        create_test_payroll(employment=employment, user=self.user)

        with self.assertRaises(ProtectedError):
            employment.delete()

    def test_deleting_payroll_record_with_adjustment_is_protected(self):
        payroll = create_test_payroll(user=self.user)
        create_test_adjustment(payroll=payroll, user=self.user)

        with self.assertRaises(ProtectedError):
            payroll.delete()

    def test_deleting_payroll_record_with_payment_is_protected(self):
        payroll = create_test_payroll(user=self.user)
        create_test_payment(payroll=payroll, user=self.user)

        with self.assertRaises(ProtectedError):
            payroll.delete()

    def test_deleting_cnss_declaration_with_monthly_is_protected(self):
        declaration = create_test_cnss_declaration(company=self.company, user=self.user)
        create_test_cnss_monthly(cnss_declaration=declaration, user=self.user)

        with self.assertRaises(ProtectedError):
            declaration.delete()

    def test_structural_guard_financial_fks_are_protect(self):
        """Fails loudly if any of these five FKs regress back to CASCADE."""
        expectations = [
            (EmploymentSalary, "employment"),
            (MonthlyPayrollRecord, "employment"),
            (PayrollAdjustment, "payroll_record"),
            (PayrollPayment, "payroll_record"),
            (CNSSMonthlyDeclaration, "cnss_declaration"),
        ]
        for model, field_name in expectations:
            field = model._meta.get_field(field_name)
            self.assertIs(
                field.remote_field.on_delete,
                __import__("django.db.models", fromlist=["PROTECT"]).PROTECT,
                f"{model.__name__}.{field_name} must be on_delete=PROTECT (decision D-3, Cycle 18)",
            )


class ArchiveBlockedOnSettledPayrollApiTests(TestCase):
    """D-2: the generic soft-delete API must refuse to archive/purge a
    financial row on an approved/paid payroll.

    Pre-Cycle-18, SoftDeleteViewSetMixin.destroy()/permanent_delete() had no
    domain-awareness at all: any authorized caller could archive or
    permanently purge a MonthlyPayrollRecord (or its adjustments/payments)
    the instant after it was approved or paid, silently erasing settled
    financial history. Now both actions return 409 with a translated reason
    instead.
    """

    def setUp(self):
        self.user = create_test_user(email="admin18@example.com")
        group, _ = Group.objects.get_or_create(name="Administrator")
        self.user.groups.add(group)
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(company=self.company, user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_archive_refused_for_approved_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)

        response = self.client.post(f"/api/v1/personnel/payrolls/{payroll.pk}/archive/")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        payroll.refresh_from_db()
        self.assertFalse(payroll.is_archived)

    def test_archive_refused_for_paid_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="paid", user=self.user)

        response = self.client.post(f"/api/v1/personnel/payrolls/{payroll.pk}/archive/")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_archive_allowed_for_draft_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="draft", user=self.user)

        response = self.client.post(f"/api/v1/personnel/payrolls/{payroll.pk}/archive/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payroll.refresh_from_db()
        self.assertTrue(payroll.is_archived)

    def test_permanent_delete_refused_for_approved_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        payroll.archive(user=self.user)

        response = self.client.delete(
            f"/api/v1/personnel/payrolls/{payroll.pk}/permanent/?confirm=true"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(MonthlyPayrollRecord.all_objects.filter(pk=payroll.pk).exists())

    def test_adjustment_archive_refused_when_payroll_approved(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        adjustment = create_test_adjustment(payroll=payroll, user=self.user)

        response = self.client.post(f"/api/v1/personnel/adjustments/{adjustment.pk}/archive/")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_payment_archive_refused_when_payroll_paid(self):
        payroll = create_test_payroll(employment=self.employment, status="paid", user=self.user)
        payment = create_test_payment(payroll=payroll, user=self.user)

        response = self.client.post(f"/api/v1/personnel/payments/{payment.pk}/archive/")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
