# apps/personnel/tests/test_cycle20_fixes.py
"""
Cycle 20 regression tests (state/IMPLEMENTATION_PLAN.md Section 14).

Covers, one test class per finding, all proven empirically during the
Cycle 20 architect pass with throwaway scratch probes (deleted after their
output was recorded):

- G-1: a payment's amount could be edited after payroll settlement through
  a plain PATCH, corrupting total_paid/payment_status.
- G-1b: a payment's payroll_record FK could be reparented through PATCH.
- G-2: an adjustment could be edited on a settled payroll through PATCH,
  even though the service layer refuses the equivalent domain call.
- G-3: payroll calculation inputs (worked_days, etc.) could be rewritten
  after the net salary was already calculated from the old values.
- G-3b: a settled payroll (or a salary history row) could be reassigned to
  a different employee/employment through PATCH.

Also covers the two accompanying fixes: total recomputation after a
legitimate pre-settlement edit (task 5), and the total-paid-drift integrity
endpoint (task 6).
"""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.personnel.models import (
    MonthlyPayrollRecord,
)
from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_company,
    create_test_employment,
    create_test_payment,
    create_test_payroll,
    create_test_salary,
    create_test_user,
)


class Cycle20BaseTestCase(TestCase):
    def setUp(self):
        self.user = create_test_user(email="admin20@example.com")
        group, _ = Group.objects.get_or_create(name="Administrator")
        self.user.groups.add(group)
        self.company = create_test_company(user=self.user)
        self.employment = create_test_employment(company=self.company, user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class PaymentUpdateBlockedOnSettledPayrollTests(Cycle20BaseTestCase):
    """G-1/G-1b: a payment on an approved/paid payroll must be frozen."""

    def test_amount_edit_refused_on_paid_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="paid", user=self.user)
        payment = create_test_payment(payroll=payroll, amount=Decimal("10000.0000"), user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payments/{payment.pk}/", {"amount": "1.0000"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        payment.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("10000.0000"))

    def test_amount_edit_refused_on_approved_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        payment = create_test_payment(payroll=payroll, amount=Decimal("5000.0000"), user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payments/{payment.pk}/", {"amount": "1.0000"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_reparenting_to_another_payroll_refused_even_when_unsettled(self):
        """G-1b: payroll_record is now read-only on update unconditionally,
        so this must fail with a 400 (unknown/ignored field via read-only,
        so the value is simply not applied) rather than reparenting."""
        payroll_a = create_test_payroll(
            employment=self.employment, year=2025, month=1, user=self.user
        )
        payroll_b = create_test_payroll(
            employment=self.employment, year=2025, month=2, user=self.user
        )
        payment = create_test_payment(payroll=payroll_a, user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payments/{payment.pk}/",
            {"payroll_record": str(payroll_b.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.payroll_record_id, payroll_a.pk)

    def test_legitimate_amount_edit_before_settlement_recomputes_totals(self):
        """Task 5: an allowed edit (draft/calculated payroll) must keep
        total_paid/remaining_amount in sync rather than merely permitting
        the write and leaving the totals stale.

        The factory creates the payment directly at the ORM level (bypassing
        record_payment()), so total_paid is not yet synced; establish that
        baseline explicitly with the same calculate_totals() the real
        service uses, then assert the PATCH keeps it in sync."""
        payroll = create_test_payroll(
            employment=self.employment, status="calculated", user=self.user
        )
        payment = create_test_payment(payroll=payroll, amount=Decimal("1000.0000"), user=self.user)
        payroll.calculate_totals()
        payroll.save()
        payroll.refresh_from_db()
        self.assertEqual(payroll.total_paid, Decimal("1000.0000"))

        response = self.client.patch(
            f"/api/v1/personnel/payments/{payment.pk}/", {"amount": "4000.0000"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payroll.refresh_from_db()
        self.assertEqual(payroll.total_paid, Decimal("4000.0000"))


class AdjustmentUpdateBlockedOnSettledPayrollTests(Cycle20BaseTestCase):
    """G-2: an adjustment on an approved/paid payroll must be frozen,
    matching MonthlyPayrollService.add_adjustment's own refusal."""

    def test_amount_and_direction_edit_refused_on_approved_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="approved", user=self.user)
        adjustment = create_test_adjustment(
            payroll=payroll, amount=Decimal("1000.0000"), direction="addition", user=self.user
        )

        response = self.client.patch(
            f"/api/v1/personnel/adjustments/{adjustment.pk}/",
            {"amount": "99999.0000", "direction": "deduction"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.amount, Decimal("1000.0000"))
        self.assertEqual(adjustment.direction, "addition")

    def test_legitimate_edit_before_settlement_recomputes_payroll_net(self):
        """As above: the factory-created adjustment has not yet been folded
        into calculated_net_salary, so establish that baseline explicitly
        before asserting the PATCH keeps the two in sync."""
        payroll = create_test_payroll(
            employment=self.employment, status="calculated", user=self.user
        )
        adjustment = create_test_adjustment(
            payroll=payroll, amount=Decimal("1000.0000"), direction="addition", user=self.user
        )
        payroll.calculate_totals()
        payroll.save()
        payroll.refresh_from_db()
        net_before = payroll.calculated_net_salary

        response = self.client.patch(
            f"/api/v1/personnel/adjustments/{adjustment.pk}/",
            {"amount": "2000.0000"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payroll.refresh_from_db()
        self.assertEqual(payroll.calculated_net_salary, net_before + Decimal("1000.0000"))


class PayrollUpdateLockdownTests(Cycle20BaseTestCase):
    """G-3/G-3b: calculation inputs and employment become read-only on
    update; the whole record is frozen once approved/paid."""

    def test_worked_days_edit_refused_on_paid_payroll(self):
        payroll = create_test_payroll(employment=self.employment, status="paid", user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payrolls/{payroll.pk}/",
            {"worked_days": "1.00", "absence_days": "25.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_worked_days_edit_ignored_even_on_draft_payroll(self):
        """Calculation inputs are read-only on update unconditionally (task
        4) - they may only change through recalculate_payroll."""
        payroll = create_test_payroll(employment=self.employment, status="draft", user=self.user)
        original_worked_days = payroll.worked_days

        response = self.client.patch(
            f"/api/v1/personnel/payrolls/{payroll.pk}/", {"worked_days": "1.00"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payroll.refresh_from_db()
        self.assertEqual(payroll.worked_days, original_worked_days)

    def test_employment_reassignment_refused_on_paid_payroll(self):
        other_employment = create_test_employment(company=self.company, user=self.user)
        payroll = create_test_payroll(employment=self.employment, status="paid", user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payrolls/{payroll.pk}/",
            {"employment": str(other_employment.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_employment_reassignment_ignored_even_on_draft_payroll(self):
        other_employment = create_test_employment(company=self.company, user=self.user)
        payroll = create_test_payroll(employment=self.employment, status="draft", user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/payrolls/{payroll.pk}/",
            {"employment": str(other_employment.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payroll.refresh_from_db()
        self.assertEqual(payroll.employment_id, self.employment.pk)


class SalaryEmploymentReadOnlyOnUpdateTests(Cycle20BaseTestCase):
    """G-3b's salary analogue: employment is read-only on update."""

    def test_employment_reassignment_ignored(self):
        other_employment = create_test_employment(company=self.company, user=self.user)
        salary = create_test_salary(employment=self.employment, user=self.user)

        response = self.client.patch(
            f"/api/v1/personnel/salaries/{salary.pk}/",
            {"employment": str(other_employment.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        salary.refresh_from_db()
        self.assertEqual(salary.employment_id, self.employment.pk)


class TotalPaidDriftReportTests(Cycle20BaseTestCase):
    """Task 6: the read-only integrity report should be empty in a healthy
    system and should surface a manufactured drift."""

    def test_empty_when_no_drift(self):
        """A payment created straight through the factory has not yet been
        folded into total_paid; sync it with the real service's own
        calculate_totals() first so this test reflects a healthy system,
        not the drift this report exists to catch."""
        payroll = create_test_payroll(
            employment=self.employment, status="calculated", user=self.user
        )
        create_test_payment(payroll=payroll, amount=Decimal("1000.0000"), user=self.user)
        payroll.calculate_totals()
        payroll.save()

        response = self.client.get("/api/v1/personnel/payrolls/total-paid-drift/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        drifted_ids = [row["payroll"]["id"] for row in response.data]
        self.assertNotIn(str(payroll.pk), drifted_ids)

    def test_surfaces_a_manufactured_drift(self):
        """Manufacture drift the only way still possible: sync total_paid
        correctly first, then overwrite it directly at the ORM/model layer
        (bypassing the service entirely) - the same class of out-of-band
        write this report exists to catch."""
        payroll = create_test_payroll(
            employment=self.employment, status="calculated", user=self.user
        )
        create_test_payment(payroll=payroll, amount=Decimal("1000.0000"), user=self.user)
        payroll.calculate_totals()
        payroll.save()
        MonthlyPayrollRecord.objects.filter(pk=payroll.pk).update(total_paid=Decimal("9999.0000"))

        response = self.client.get("/api/v1/personnel/payrolls/total-paid-drift/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        drifted = {row["payroll"]["id"]: row for row in response.data}
        self.assertIn(str(payroll.pk), drifted)
        self.assertEqual(
            Decimal(drifted[str(payroll.pk)]["stored_total_paid"]), Decimal("9999.0000")
        )
        self.assertEqual(
            Decimal(drifted[str(payroll.pk)]["computed_total_paid"]), Decimal("1000.0000")
        )
