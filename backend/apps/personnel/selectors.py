# apps/personnel/selectors.py
"""
Personnel Selectors.

Selectors encapsulate read/query logic and return querysets or model instances.
They should not modify state.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from django.db import models
from django.db.models import Count, Q, QuerySet, Sum

from .models import (
    CNSSDeclaration,
    CNSSMonthlyDeclaration,
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PersonnelDocumentReference,
    PersonnelPerson,
)


class PersonnelPersonSelector:
    """Selectors for PersonnelPerson queries."""

    @staticmethod
    def get_all() -> QuerySet:
        """Get all non-archived personnel persons."""
        return PersonnelPerson.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet:
        """Get all personnel persons including archived."""
        return PersonnelPerson.all_objects.all()

    @staticmethod
    def get_by_id(person_id) -> PersonnelPerson | None:
        """Get non-archived person by ID."""
        return PersonnelPerson.objects.filter(id=person_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> PersonnelPerson | None:
        """Get non-archived person by reference."""
        return PersonnelPerson.objects.filter(reference=reference).first()

    @staticmethod
    def get_by_cin(cin: str) -> PersonnelPerson | None:
        """Get non-archived person by CIN."""
        return PersonnelPerson.objects.filter(cin=cin).first()

    @staticmethod
    def get_by_email(email: str) -> PersonnelPerson | None:
        """Get non-archived person by email."""
        return PersonnelPerson.objects.filter(email__iexact=email).first()

    @staticmethod
    def search(query: str) -> QuerySet:
        """Search persons by name, CIN, phone, email."""
        return PersonnelPerson.objects.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(middle_name__icontains=query)
            | Q(cin__icontains=query)
            | Q(phone__icontains=query)
            | Q(email__icontains=query)
        )

    @staticmethod
    def get_by_company(company_id) -> QuerySet:
        """Get persons who have employment at a company."""
        from apps.personnel.models import Employment

        person_ids = (
            Employment.objects.filter(company_id=company_id, is_archived=False)
            .values_list("person_id", flat=True)
            .distinct()
        )
        return PersonnelPerson.objects.filter(id__in=person_ids)

    @staticmethod
    def get_active() -> QuerySet:
        """Get active (non-archived, active status) persons."""
        return PersonnelPerson.objects.filter(status="active")

    @staticmethod
    def get_with_active_employment() -> QuerySet:
        """Get persons with at least one active employment."""
        return PersonnelPerson.objects.filter(
            employments__is_active=True, employments__is_archived=False
        ).distinct()


class EmploymentSelector:
    """Selectors for Employment queries."""

    @staticmethod
    def get_all() -> QuerySet:
        """Get all non-archived employments."""
        return Employment.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet:
        """Get all employments including archived."""
        return Employment.all_objects.all()

    @staticmethod
    def get_by_id(employment_id) -> Employment | None:
        """Get non-archived employment by ID."""
        return Employment.objects.filter(id=employment_id).first()

    @staticmethod
    def get_by_key(employment_key: str) -> Employment | None:
        """Get non-archived employment by employee reference."""
        return Employment.objects.filter(employee_reference=employment_key).first()

    @staticmethod
    def get_by_person(person_id) -> QuerySet:
        """Get non-archived employments for a person."""
        return Employment.objects.filter(person_id=person_id)

    @staticmethod
    def get_by_company(company_id) -> QuerySet:
        """Get non-archived employments for a company."""
        return Employment.objects.filter(company_id=company_id)

    @staticmethod
    def get_active_for_person(person_id) -> QuerySet:
        """Get active employments for a person."""
        return Employment.objects.filter(person_id=person_id, is_active=True)

    @staticmethod
    def get_active_for_company(company_id) -> QuerySet:
        """Get active employments for a company."""
        return Employment.objects.filter(company_id=company_id, is_active=True)

    @staticmethod
    def get_active_for_person_and_company(person_id, company_id) -> QuerySet:
        """Get active employment for person at company."""
        return Employment.objects.filter(person_id=person_id, company_id=company_id, is_active=True)

    @staticmethod
    def get_multi_company_employees() -> QuerySet:
        """Get persons with employments at multiple companies."""
        return (
            Employment.objects.values("person")
            .annotate(company_count=Count("company", distinct=True))
            .filter(company_count__gt=1, is_archived=False)
            .order_by("person")
        )

    @staticmethod
    def get_overlapping_employments(
        person_id, company_id, start_date, end_date=None, exclude_id=None
    ) -> QuerySet:
        """Find overlapping employments for a person at a company."""
        from apps.personnel.models import Employment

        qs = Employment.objects.filter(
            person_id=person_id, company_id=company_id, is_archived=False
        )
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        qs = qs.filter(hire_date__lte=end_date or date.today())
        if end_date:
            qs = qs.filter(
                Q(employment_end_date__isnull=True) | Q(employment_end_date__gte=start_date)
            )
        else:
            qs = qs.filter(
                Q(employment_end_date__isnull=True) | Q(employment_end_date__gte=start_date)
            )
        return qs

    @staticmethod
    def get_active_employments_for_company(company_id) -> QuerySet:
        """Get all active employments for a company with person data."""
        return Employment.objects.active_for_company(company_id).select_related("person")


class EmploymentSalarySelector:
    """Selectors for EmploymentSalary queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return EmploymentSalary.objects.all()

    @staticmethod
    def get_by_id(salary_id) -> Optional:
        return EmploymentSalary.objects.filter(id=salary_id).first()

    @staticmethod
    def get_current_for_employment(employment_id) -> Optional:
        """Get current salary for an employment."""
        return EmploymentSalary.objects.filter(employment_id=employment_id, is_current=True).first()

    @staticmethod
    def get_valid_on_date(employment_id, check_date: date) -> Optional:
        """Get salary valid on a specific date."""
        return (
            EmploymentSalary.objects.filter(
                employment_id=employment_id,
                effective_from__lte=check_date,
            )
            .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=check_date))
            .first()
        )

    @staticmethod
    def get_history(employment_id) -> QuerySet:
        """Get salary history for an employment."""
        return EmploymentSalary.objects.filter(employment_id=employment_id).order_by(
            "-effective_from"
        )


class MonthlyPayrollRecordSelector:
    """Selectors for MonthlyPayrollRecord queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return MonthlyPayrollRecord.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet:
        return MonthlyPayrollRecord.all_objects.all()

    @staticmethod
    def get_by_id(record_id) -> Optional:
        return MonthlyPayrollRecord.objects.filter(id=record_id).first()

    @staticmethod
    def get_by_employment(employment_id) -> QuerySet:
        return MonthlyPayrollRecord.objects.filter(employment_id=employment_id).order_by(
            "-year", "-month"
        )

    @staticmethod
    def get_for_period(year: int, month: int) -> QuerySet:
        return MonthlyPayrollRecord.objects.filter(year=year, month=month)

    @staticmethod
    def get_for_company_period(company_id, year: int, month: int) -> QuerySet:
        return MonthlyPayrollRecord.objects.filter(
            employment__company_id=company_id, year=year, month=month
        ).select_related("employment", "employment__person", "employment__company")

    @staticmethod
    def get_draft_records() -> QuerySet:
        return MonthlyPayrollRecord.objects.filter(status="draft")

    @staticmethod
    def get_approved_records() -> QuerySet:
        return MonthlyPayrollRecord.objects.filter(status="approved")

    @staticmethod
    def get_pending_payment() -> QuerySet:
        """Get records with remaining amount > 0."""
        return MonthlyPayrollRecord.objects.filter(remaining_amount__gt=0)

    @staticmethod
    def get_by_company_and_date_range(
        company_id, start_year, start_month, end_year, end_month
    ) -> QuerySet:
        """Get payroll records for company within date range."""
        return (
            MonthlyPayrollRecord.objects.filter(
                employment__company_id=company_id,
                year__gte=start_year,
                year__lte=end_year,
            )
            .filter(
                models.Q(year__gt=start_year) | models.Q(year=start_year, month__gte=start_month)
            )
            .filter(models.Q(year__lt=end_year) | models.Q(year=end_year, month__lte=end_month))
        )

    @staticmethod
    def get_payroll_total_paid_drift() -> list[dict]:
        """Payrolls whose stored ``total_paid`` disagrees with the live sum
        of their non-cancelled payments (Cycle 20, decision in
        state/IMPLEMENTATION_PLAN.md Section 14.9). An integrity probe,
        not a report - mirrors ``apps.treasury.selectors.
        accounts_with_balance_drift()``. In a correct system this returns
        an empty list forever; a returned row means ``total_paid`` was
        edited (or corrupted before Cycle 20's guards existed) outside the
        service layer, and the live sum of payments should be trusted over
        the stored field.

        Returns a list of dicts: ``payroll``, ``stored_total_paid``,
        ``computed_total_paid``, ``stored_remaining``, ``computed_remaining``.
        """
        from apps.personnel.models import PayrollPaymentStatus

        drifted = []
        for payroll in MonthlyPayrollRecord.objects.all():
            computed = payroll.payments.exclude(status=PayrollPaymentStatus.CANCELLED).aggregate(
                total=Sum("amount")
            )["total"] or Decimal("0")
            if computed != payroll.total_paid:
                computed_remaining = (payroll.calculated_net_salary - computed).quantize(
                    Decimal("0.0001")
                )
                drifted.append(
                    {
                        "payroll": payroll,
                        "stored_total_paid": payroll.total_paid,
                        "computed_total_paid": computed,
                        "stored_remaining": payroll.remaining_amount,
                        "computed_remaining": computed_remaining,
                    }
                )
        return drifted


class PayrollAdjustmentSelector:
    """Selectors for PayrollAdjustment queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return PayrollAdjustment.objects.all()

    @staticmethod
    def get_for_payroll_record(payroll_record_id) -> QuerySet:
        return PayrollAdjustment.objects.filter(payroll_record_id=payroll_record_id)

    @staticmethod
    def get_additions_for_record(payroll_record_id) -> QuerySet:
        from apps.personnel.models import PayrollAdjustmentDirection

        return PayrollAdjustment.objects.filter(
            payroll_record_id=payroll_record_id, direction=PayrollAdjustmentDirection.ADDITION
        )

    @staticmethod
    def get_deductions_for_record(payroll_record_id) -> QuerySet:
        from apps.personnel.models import PayrollAdjustmentDirection

        return PayrollAdjustment.objects.filter(
            payroll_record_id=payroll_record_id, direction=PayrollAdjustmentDirection.DEDUCTION
        )


class PayrollPaymentSelector:
    """Selectors for PayrollPayment queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return PayrollPayment.objects.all()

    @staticmethod
    def get_for_payroll_record(payroll_record_id) -> QuerySet:
        return PayrollPayment.objects.filter(payroll_record_id=payroll_record_id).order_by(
            "-payment_date"
        )

    @staticmethod
    def get_total_paid_for_record(payroll_record_id) -> Decimal:
        from django.db.models import Sum

        return PayrollPayment.objects.filter(payroll_record_id=payroll_record_id).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")

    @staticmethod
    def get_advances_for_record(payroll_record_id) -> QuerySet:
        return PayrollPayment.objects.filter(
            payroll_record_id=payroll_record_id, payment_kind="advance"
        )


class CNSSDeclarationSelector:
    """Selectors for CNSSDeclaration queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return CNSSDeclaration.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet:
        return CNSSDeclaration.all_objects.all()

    @staticmethod
    def get_by_id(declaration_id) -> Optional:
        return CNSSDeclaration.objects.filter(id=declaration_id).first()

    @staticmethod
    def get_by_person(person_id) -> QuerySet:
        return CNSSDeclaration.objects.filter(person_id=person_id)

    @staticmethod
    def get_by_company(company_id) -> QuerySet:
        return CNSSDeclaration.objects.filter(company_id=company_id)

    @staticmethod
    def get_active_declarations() -> QuerySet:
        return CNSSDeclaration.objects.filter(is_currently_declared=True)

    @staticmethod
    def get_employee_declared_by_company(company_id) -> QuerySet:
        return CNSSDeclaration.objects.filter(
            company_id=company_id, is_currently_declared=True
        ).select_related("person", "employment")

    @staticmethod
    def get_cnss_only_persons(company_id) -> QuerySet:
        """Get CNSS-only persons (no employment) for a company."""
        return CNSSDeclaration.objects.filter(
            company_id=company_id, is_currently_declared=True, employment__isnull=True
        ).select_related("person")

    @staticmethod
    def get_declared_by_another_employer() -> QuerySet:
        from apps.personnel.models import CNSSSituation

        return CNSSDeclaration.objects.filter(situation=CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER)

    @staticmethod
    def get_pending_registration() -> QuerySet:
        from apps.personnel.models import CNSSSituation

        return CNSSDeclaration.objects.filter(situation=CNSSSituation.PENDING_REGISTRATION)

    @staticmethod
    def get_suspended_declarations() -> QuerySet:
        from apps.personnel.models import CNSSSituation

        return CNSSDeclaration.objects.filter(situation=CNSSSituation.DECLARATION_SUSPENDED)

    @staticmethod
    def get_locked_employees(company_id) -> QuerySet:
        """Get employees locked due to pending CNSS declarations."""
        # This would depend on business logic for what "locked" means
        return CNSSDeclaration.objects.filter(
            company_id=company_id, is_currently_declared=True
        ).select_related("person", "employment")

    @staticmethod
    def get_for_person_and_company(person_id, company_id):
        return CNSSDeclaration.objects.filter(
            person_id=person_id, company_id=company_id, is_archived=False
        ).first()

    @staticmethod
    def get_active_declarations_for_company(company_id) -> QuerySet:
        """Get all active declarations for a company."""
        return CNSSDeclaration.objects.filter(
            company_id=company_id, is_currently_declared=True, is_archived=False
        ).select_related("person", "employment")


class CNSSMonthlyDeclarationSelector:
    """Selectors for CNSSMonthlyDeclaration queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return CNSSMonthlyDeclaration.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet:
        return CNSSMonthlyDeclaration.all_objects.all()

    @staticmethod
    def get_by_id(monthly_id) -> Optional:
        return CNSSMonthlyDeclaration.objects.filter(id=monthly_id).first()

    @staticmethod
    def get_for_declaration(declaration_id) -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(cnss_declaration_id=declaration_id).order_by(
            "-year", "-month"
        )

    @staticmethod
    def get_for_period(year: int, month: int) -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(year=year, month=month)

    @staticmethod
    def get_for_company_period(company_id, year: int, month: int) -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(
            cnss_declaration__company_id=company_id, year=year, month=month
        ).select_related("cnss_declaration", "cnss_declaration__person")

    @staticmethod
    def get_locked_declarations() -> QuerySet:
        from apps.personnel.models import CNSSMonthlyStatus

        return CNSSMonthlyDeclaration.objects.filter(
            status__in=[CNSSMonthlyStatus.SUBMITTED, CNSSMonthlyStatus.ACCEPTED]
        )

    @staticmethod
    def get_entrant_declarations(year: int, month: int) -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(year=year, month=month, situation="entrant")

    @staticmethod
    def get_sortant_declarations(year: int, month: int) -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(year=year, month=month, situation="sortant")

    @staticmethod
    def get_draft_declarations() -> QuerySet:
        return CNSSMonthlyDeclaration.objects.filter(status="draft")


class PersonnelDocumentSelector:
    """Selectors for PersonnelDocumentReference queries."""

    @staticmethod
    def get_all() -> QuerySet:
        return PersonnelDocumentReference.objects.all()

    @staticmethod
    def get_by_id(doc_id) -> Optional:
        return PersonnelDocumentReference.objects.filter(id=doc_id).first()

    @staticmethod
    def get_by_person(person_id) -> QuerySet:
        return PersonnelDocumentReference.objects.filter(person_id=person_id)

    @staticmethod
    def get_by_employment(employment_id) -> QuerySet:
        return PersonnelDocumentReference.objects.filter(employment_id=employment_id)

    @staticmethod
    def get_by_type(document_type: str) -> QuerySet:
        return PersonnelDocumentReference.objects.filter(document_type=document_type)


# Additional helpers for reports and classification
class PersonnelClassificationSelector:
    """Selectors for personnel classification logic."""

    @staticmethod
    def get_active_employees(company_id=None) -> QuerySet:
        """Get active employees (with active employment)."""
        qs = PersonnelPerson.objects.filter(
            employments__is_active=True, employments__is_archived=False
        ).distinct()
        if company_id:
            qs = qs.filter(employments__company_id=company_id)
        return qs

    @staticmethod
    def get_employees_declared_to_cnss(company_id) -> QuerySet:
        """Get employees with active CNSS declaration at a company."""
        return PersonnelPerson.objects.filter(
            employments__company_id=company_id,
            employments__is_active=True,
            cnss_declarations__company_id=company_id,
            cnss_declarations__is_currently_declared=True,
        ).distinct()

    @staticmethod
    def get_employees_not_declared(company_id) -> QuerySet:
        """Get active employees without CNSS declaration at a company."""
        declared_ids = CNSSDeclaration.objects.filter(
            company_id=company_id, is_currently_declared=True
        ).values_list("person_id", flat=True)
        return (
            PersonnelPerson.objects.filter(
                employments__company_id=company_id,
                employments__is_active=True,
                employments__is_archived=False,
            )
            .exclude(id__in=declared_ids)
            .distinct()
        )

    @staticmethod
    def get_cnss_only_persons(company_id) -> QuerySet:
        """Get persons with CNSS declaration but no employment at a company."""
        # People who have an active CNSS declaration at this company
        declared_ids = CNSSDeclaration.objects.filter(
            company_id=company_id,
            is_currently_declared=True,
            is_archived=False,
        ).values_list("person_id", flat=True)
        # Exclude those who also have an employment at this company
        employed_ids = Employment.objects.filter(
            company_id=company_id,
            is_archived=False,
        ).values_list("person_id", flat=True)
        return (
            PersonnelPerson.objects.filter(id__in=declared_ids)
            .exclude(id__in=employed_ids)
            .distinct()
        )

    @staticmethod
    def get_multi_company_employees() -> QuerySet:
        """Get persons working for multiple companies simultaneously."""
        from apps.personnel.models import Employment

        multi_company_ids = (
            Employment.objects.filter(is_active=True, is_archived=False)
            .values("person")
            .annotate(company_count=Count("company", distinct=True))
            .filter(company_count__gt=1)
            .values_list("person", flat=True)
        )
        return PersonnelPerson.objects.filter(id__in=multi_company_ids)

    @staticmethod
    def get_incomplete_records() -> QuerySet:
        """Get personnel with any missing important field."""
        from django.db.models import Q

        qs = PersonnelPerson.objects.filter(is_archived=False, status="active")
        # A person is incomplete if ANY important field is missing
        missing_condition = (
            Q(cin__isnull=True)
            | Q(cin__exact="")
            | Q(phone__isnull=True)
            | Q(phone__exact="")
            | Q(email__isnull=True)
            | Q(email__exact="")
            | Q(address__isnull=True)
            | Q(address__exact="")
            | Q(city__isnull=True)
            | Q(city__exact="")
            | Q(date_of_birth__isnull=True)
            | Q(nationality__isnull=True)
            | Q(nationality__exact="")
        )
        return qs.filter(missing_condition).distinct()

    @staticmethod
    def get_former_employees(company_id=None) -> QuerySet:
        """Get former employees (no active employment)."""
        qs = PersonnelPerson.objects.filter(is_archived=False)
        if company_id:
            qs = qs.filter(employments__company_id=company_id)
        qs = qs.exclude(employments__is_active=True, employments__is_archived=False).distinct()
        return qs

    @staticmethod
    def get_currently_undeclared(company_id) -> QuerySet:
        """Get personnel currently undeclared at a company."""
        return (
            PersonnelPerson.objects.filter(
                employments__company_id=company_id,
                employments__is_active=True,
                employments__is_archived=False,
            )
            .exclude(
                cnss_declarations__company_id=company_id,
                cnss_declarations__is_currently_declared=True,
            )
            .distinct()
        )
