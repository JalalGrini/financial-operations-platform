# apps/personnel/managers.py
"""
Personnel Managers.

Custom managers for Personnel domain models.
"""
from django.db import models
from django.db.models import Count

from apps.common.models import ActiveManager


class EmploymentManager(ActiveManager):
    """Manager for Employment with custom queries."""

    def active_for_person(self, person):
        """Get active employments for a person."""
        return self.filter(person=person, is_active=True)

    def active_for_company(self, company):
        """Get active employments for a company."""
        return self.filter(company=company, is_active=True)

    def multi_company_employees(self):
        """Get persons with multiple active employments across different companies."""
        return (
            self.values("person")
            .annotate(company_count=Count("company", distinct=True))
            .filter(company_count__gt=1)
        )

    def active_employments_for_company(self, company):
        """Get active employments with related data for a company."""
        return (
            self.active_for_company(company)
            .select_related("person", "company")
            .prefetch_related("salaries", "payroll_records", "cnss_declarations")
        )


class EmploymentSalaryManager(ActiveManager):
    """Manager for EmploymentSalary."""

    def current_for_employment(self, employment):
        """Get current salary for an employment."""
        return self.filter(employment=employment, is_current=True).first()

    def valid_on_date(self, employment, check_date):
        """Get salary valid on a specific date."""
        return (
            self.filter(employment=employment, effective_from__lte=check_date)
            .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=check_date))
            .first()
        )

    def history_for_employment(self, employment):
        """Get full salary history for an employment."""
        return self.filter(employment=employment).order_by("-effective_from")


class MonthlyPayrollRecordManager(ActiveManager):
    """Manager for MonthlyPayrollRecord."""

    def for_employment(self, employment):
        """Get payroll records for an employment."""
        return self.filter(employment=employment).order_by("-year", "-month")

    def for_period(self, year, month):
        """Get all payroll records for a period."""
        return self.filter(year=year, month=month)

    def for_company_period(self, company, year, month):
        """Get payroll records for a company and period."""
        return self.filter(employment__company=company, year=year, month=month).select_related(
            "employment", "employment__person", "employment__company"
        )

    def draft_records(self):
        """Get draft payroll records."""
        return self.filter(status="draft")

    def approved_records(self):
        """Get approved payroll records."""
        return self.filter(status="approved")

    def pending_payment(self):
        """Get payroll records with remaining amount > 0."""
        return self.filter(remaining_amount__gt=0)


class PayrollAdjustmentManager(ActiveManager):
    """Manager for PayrollAdjustment."""

    def for_payroll_record(self, payroll_record):
        """Get adjustments for a payroll record."""
        return self.filter(payroll_record=payroll_record)

    def additions(self):
        """Get addition adjustments."""
        return self.filter(direction="addition")

    def deductions(self):
        """Get deduction adjustments."""
        return self.filter(direction="deduction")


class PayrollPaymentManager(ActiveManager):
    """Manager for PayrollPayment."""

    def for_payroll_record(self, payroll_record):
        """Get payments for a payroll record."""
        return self.filter(payroll_record=payroll_record).order_by("-payment_date")

    def advances(self):
        """Get advance payments."""
        # The previously imported `PayrollPaymentKind` was never used here; the
        # filter compares against the stored string value directly.
        return self.filter(payment_kind="advance")

    def total_paid_for_record(self, payroll_record):
        """Get total paid for a payroll record."""
        return (
            self.filter(payroll_record=payroll_record).aggregate(total=models.Sum("amount"))[
                "total"
            ]
            or 0
        )


class CNSSDeclarationManager(ActiveManager):
    """Manager for CNSSDeclaration."""

    def active_declarations(self):
        """Get currently active declarations."""
        return self.filter(is_currently_declared=True)

    def for_company(self, company):
        """Get declarations for a company."""
        return self.filter(company=company)

    def for_person(self, person):
        """Get declarations for a person."""
        return self.filter(person=person)

    def employee_declared_by_company(self, company):
        """Get employees with active CNSS declaration at a company."""
        return (
            self.active_declarations()
            .filter(company=company)
            .select_related("person", "employment")
        )

    def cnss_only_persons(self, company):
        """Get CNSS-only persons (no employment) at a company."""
        return (
            self.active_declarations()
            .filter(company=company, employment__isnull=True)
            .select_related("person")
        )

    def declared_by_another_employer(self):
        """Get persons declared to CNSS by another employer."""
        from apps.personnel.models import CNSSSituation

        return self.filter(situation=CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER)

    def not_declared(self, company):
        """Get employees without CNSS declaration at a company."""
        from apps.personnel.models import Employment

        declared_person_ids = (
            self.active_declarations().filter(company=company).values_list("person_id", flat=True)
        )
        return Employment.objects.filter(
            company=company, is_active=True, is_archived=False
        ).exclude(person_id__in=declared_person_ids)

    def pending_registration(self):
        """Get declarations pending registration."""
        from apps.personnel.models import CNSSSituation

        return self.filter(situation=CNSSSituation.PENDING_REGISTRATION)

    def suspended_declarations(self):
        """Get suspended declarations."""
        from apps.personnel.models import CNSSSituation

        return self.filter(situation=CNSSSituation.DECLARATION_SUSPENDED)


class CNSSMonthlyDeclarationManager(ActiveManager):
    """Manager for CNSSMonthlyDeclaration."""

    def for_declaration(self, cnss_declaration):
        """Get monthly declarations for a CNSS declaration."""
        return self.filter(cnss_declaration=cnss_declaration).order_by("-year", "-month")

    def for_period(self, year, month):
        """Get all monthly declarations for a period."""
        return self.filter(year=year, month=month)

    def for_company_period(self, company, year, month):
        """Get monthly declarations for a company and period."""
        return self.filter(
            cnss_declaration__company=company, year=year, month=month
        ).select_related("cnss_declaration", "cnss_declaration__person")

    def draft_declarations(self):
        """Get draft monthly declarations."""
        from apps.personnel.models import CNSSMonthlyStatus

        return self.filter(status=CNSSMonthlyStatus.DRAFT)

    def submitted_declarations(self):
        """Get submitted declarations."""
        from apps.personnel.models import CNSSMonthlyStatus

        return self.filter(status=CNSSMonthlyStatus.SUBMITTED)

    def entrant_declarations(self):
        """Get entrant declarations."""
        from apps.personnel.models import CNSSMonthlySituation

        return self.filter(situation=CNSSMonthlySituation.ENTRANT)

    def sortant_declarations(self):
        """Get sortant declarations."""
        from apps.personnel.models import CNSSMonthlySituation

        return self.filter(situation=CNSSMonthlySituation.SORTANT)


# NOTE (cycle 2 deduplication):
#
# A second, shadowing definition of `PayrollPaymentManager` used to live here at
# the end of the module. Python binds only the *last* class statement to a name,
# so that duplicate silently won and the earlier definition above was dead -
# which meant the `advances()` helper effectively did not exist, even though it
# was written and looked present on review.
#
# The duplicate was otherwise identical to the definition above (same
# `for_payroll_record` and `total_paid_for_record` behaviour), so removing it
# loses nothing and restores `advances()`.
#
# This mirrors the M1A-3 fix already applied to `apps/authentication/managers.py`,
# which is guarded by a test asserting exactly one definition per manager class.
# `apps/common/tests/test_module_hygiene.py` now extends that guard to this file.
