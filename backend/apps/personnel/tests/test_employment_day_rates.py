"""Per-employment worked-day and absence-day rates.

Two things are locked in here:

1. an employment can price its own days, so the figure no longer has to be
   retyped on every payroll run; and
2. an employment that sets neither rate produces exactly the same numbers as
   before the feature existed - the derived gross/scheduled-days default.
"""

from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.companies.models import Company
from apps.personnel.models import (
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PersonnelPerson,
)


class EmploymentDayRateTests(TestCase):
    """Rate resolution order: explicit argument > employment rate > derived."""

    def setUp(self):
        self.company = Company.objects.create(
            name="Rates SARL",
            registration_number="RC-RATES-1",
            tax_id="IF-RATES-1",
            address="Casablanca",
            phone="0500000000",
            email="rates@example.invalid",
        )
        self.person = PersonnelPerson.objects.create(
            first_name="Day",
            last_name="Rate",
        )

    def _employment(self, **kwargs):
        return Employment.objects.create(
            person=self.person,
            company=self.company,
            employee_reference=f"EMP-{Employment.all_objects.count() + 1}",
            contract_type="cdi",
            employment_status="active",
            hire_date=date(2026, 1, 1),
            default_monthly_working_days=26,
            **kwargs,
        )

    def _payroll(self, employment, gross="5200.0000", unpaid_days=0, scheduled=26):
        EmploymentSalary.objects.create(
            employment=employment,
            fixed_monthly_gross_salary=Decimal(gross),
            effective_from=date(2026, 1, 1),
            is_current=True,
        )
        return MonthlyPayrollRecord.objects.create(
            employment=employment,
            year=2026,
            month=3,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            scheduled_working_days=scheduled,
            worked_days=scheduled - unpaid_days,
            unpaid_leave_days=unpaid_days,
            gross_salary_snapshot=Decimal(gross),
        )

    # -----------------------------------------------------------------
    # Regression guard: unchanged behaviour when no rate is configured
    # -----------------------------------------------------------------

    def test_without_rates_the_derived_default_is_unchanged(self):
        employment = self._employment()
        payroll = self._payroll(employment, gross="5200.0000", scheduled=26)

        payroll.calculate_totals()

        # 5200 / 26 = 200 exactly, as before the feature.
        self.assertEqual(payroll.daily_rate, Decimal("200.0000"))

    def test_without_rates_absence_still_deducts_at_the_daily_rate(self):
        employment = self._employment()
        payroll = self._payroll(employment, gross="5200.0000", unpaid_days=3)

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("200.0000"))
        self.assertEqual(payroll.absence_deduction, Decimal("600.0000"))

    def test_zero_scheduled_days_still_yields_a_zero_rate(self):
        employment = self._employment()
        payroll = self._payroll(employment, scheduled=0)

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("0"))

    # -----------------------------------------------------------------
    # The new behaviour
    # -----------------------------------------------------------------

    def test_employment_worked_day_rate_replaces_the_derivation(self):
        employment = self._employment(worked_day_rate=Decimal("310.0000"))
        payroll = self._payroll(employment, gross="5200.0000")

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("310.0000"))

    def test_absence_falls_back_to_the_employment_worked_day_rate(self):
        """One rate set, absences priced at it - no separate rate needed."""
        employment = self._employment(worked_day_rate=Decimal("310.0000"))
        payroll = self._payroll(employment, unpaid_days=2)

        payroll.calculate_totals()

        self.assertEqual(payroll.absence_deduction, Decimal("620.0000"))

    def test_absence_day_rate_is_independent_of_the_worked_day_rate(self):
        employment = self._employment(
            worked_day_rate=Decimal("310.0000"),
            absence_day_rate=Decimal("150.0000"),
        )
        payroll = self._payroll(employment, unpaid_days=2)

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("310.0000"))
        self.assertEqual(payroll.absence_deduction, Decimal("300.0000"))

    def test_absence_day_rate_alone_leaves_the_worked_rate_derived(self):
        employment = self._employment(absence_day_rate=Decimal("50.0000"))
        payroll = self._payroll(employment, gross="5200.0000", unpaid_days=4)

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("200.0000"))
        self.assertEqual(payroll.absence_deduction, Decimal("200.0000"))

    def test_two_employees_can_be_priced_differently(self):
        """The whole point: rates are per employee, not one rule for everyone."""
        # Two distinct people - one person cannot hold two overlapping
        # employments at the same company, which the domain rightly refuses.
        second_person = PersonnelPerson.objects.create(first_name="Other", last_name="Staff")
        cheap = self._employment(worked_day_rate=Decimal("120.0000"))
        pricey = Employment.objects.create(
            person=second_person,
            company=self.company,
            employee_reference="EMP-PRICEY",
            contract_type="cdi",
            employment_status="active",
            hire_date=date(2026, 1, 1),
            default_monthly_working_days=26,
            worked_day_rate=Decimal("480.0000"),
        )

        cheap_payroll = self._payroll(cheap, unpaid_days=1)
        pricey_payroll = self._payroll(pricey, unpaid_days=1)
        cheap_payroll.calculate_totals()
        pricey_payroll.calculate_totals()

        self.assertEqual(cheap_payroll.daily_rate, Decimal("120.0000"))
        self.assertEqual(pricey_payroll.daily_rate, Decimal("480.0000"))
        self.assertEqual(cheap_payroll.absence_deduction, Decimal("120.0000"))
        self.assertEqual(pricey_payroll.absence_deduction, Decimal("480.0000"))

    # -----------------------------------------------------------------
    # Precedence
    # -----------------------------------------------------------------

    def test_explicit_override_still_beats_the_employment_rate(self):
        employment = self._employment(
            worked_day_rate=Decimal("310.0000"),
            absence_day_rate=Decimal("150.0000"),
        )
        payroll = self._payroll(employment, unpaid_days=2)

        payroll.calculate_totals(
            daily_rate_override=Decimal("900"), absence_rate_override=Decimal("10")
        )

        self.assertEqual(payroll.daily_rate, Decimal("900.0000"))
        self.assertEqual(payroll.absence_deduction, Decimal("20.0000"))

    def test_a_zero_employment_rate_is_honoured_not_treated_as_unset(self):
        """0 is a real price; only NULL means "derive it"."""
        employment = self._employment(worked_day_rate=Decimal("0"))
        payroll = self._payroll(employment, gross="5200.0000")

        payroll.calculate_totals()

        self.assertEqual(payroll.daily_rate, Decimal("0.0000"))


class EmploymentDayRateApiTests(TestCase):
    """The rates must be writable through the employment API, not just the ORM."""

    def test_create_serializer_exposes_optional_rates(self):
        from apps.personnel.serializers import EmploymentCreateSerializer

        fields = EmploymentCreateSerializer().fields
        self.assertIn("worked_day_rate", fields)
        self.assertIn("absence_day_rate", fields)
        # Optional, so existing clients that never send them keep working.
        self.assertFalse(fields["worked_day_rate"].required)
        self.assertFalse(fields["absence_day_rate"].required)

    def test_read_serializer_exposes_the_rates(self):
        from apps.personnel.serializers import EmploymentSerializer

        self.assertIn("worked_day_rate", EmploymentSerializer().fields)
        self.assertIn("absence_day_rate", EmploymentSerializer().fields)

    def test_negative_rates_are_refused(self):
        from apps.personnel.serializers import EmploymentCreateSerializer

        serializer = EmploymentCreateSerializer(data={"worked_day_rate": "-5"}, partial=True)
        serializer.is_valid()
        self.assertIn("worked_day_rate", serializer.errors)
