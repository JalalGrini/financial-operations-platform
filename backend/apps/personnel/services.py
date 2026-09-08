from apps.common.security import safe_export_row

# apps/personnel/services.py
"""
Personnel Services.

Services encapsulate business logic for personnel operations.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.company_scope import company_display_name
from apps.companies.models import Company
from apps.personnel.models import (
    CNSSDeclaration,
    CNSSMonthlyDeclaration,
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PayrollPaymentStatus,
    PersonnelDocumentReference,
    PersonnelPerson,
)
from apps.personnel.selectors import (
    CNSSDeclarationSelector,
    CNSSMonthlyDeclarationSelector,
    EmploymentSalarySelector,
    EmploymentSelector,
    MonthlyPayrollRecordSelector,
    PersonnelPersonSelector,
)
from apps.personnel.validators import (
    CNSSValidator,
    EmploymentSalaryValidator,
    EmploymentValidator,
    MonthlyPayrollValidator,
    PayrollAdjustmentValidator,
    PayrollPaymentValidator,
    PersonnelDocumentValidator,
    PersonnelValidator,
)


class PersonnelService:
    """
    Service layer for personnel operations.

    Handles:
    - Personnel creation and updates
    - Search and duplicate detection
    - Completeness assessment
    """

    def __init__(self):
        self.validator = PersonnelValidator()
        self.selector = PersonnelPersonSelector()

    # ==================== PERSONNEL CREATION ====================

    def create_person(self, data: dict, user=None) -> PersonnelPerson:
        """
        Create a new personnel person.

        Args:
            data: Personnel data dictionary
            user: User creating the record

        Returns:
            Created PersonnelPerson instance

        Raises:
            ValidationError: If validation fails
        """
        # Validate data
        validated = self.validator.validate_personnel_person(data)

        # Check for duplicates
        duplicates = self._check_duplicates(validated)
        if duplicates:
            # Log warning but don't block creation
            pass

        with transaction.atomic():
            person = PersonnelPerson.objects.create(
                first_name=validated["first_name"],
                last_name=validated["last_name"],
                middle_name=validated.get("middle_name", ""),
                cin=validated.get("cin") or None,  # Store None for empty CIN (unique nullable)
                phone=validated.get("phone") or "",
                email=validated.get("email") or "",
                address=validated.get("address", ""),
                city=validated.get("city", ""),
                province=validated.get("province", ""),
                region=validated.get("region", ""),
                date_of_birth=validated.get("date_of_birth"),
                nationality=validated.get("nationality", ""),
                notes=validated.get("notes", ""),
                observations=validated.get("observations", ""),
                status=validated.get("status", "active"),
                created_by=user,
                updated_by=user,
            )

        return person

    def update_person(self, person: PersonnelPerson, data: dict, user=None) -> PersonnelPerson:
        """Update an existing personnel person."""
        validated = self.validator.validate_personnel_person(data)

        # Check CIN uniqueness if changed
        if "cin" in validated and validated["cin"] != person.cin:
            if PersonnelPerson.objects.filter(cin=validated["cin"]).exclude(pk=person.pk).exists():
                raise ValidationError(_("A person with this CIN already exists."))

        # Update fields
        for field, value in validated.items():
            setattr(person, field, value)

        person.updated_by = user
        person.save(update_fields=list(validated.keys()) + ["updated_by", "updated_at"])

        return person

    def archive_person(
        self, person: PersonnelPerson, user=None, reason: str = ""
    ) -> PersonnelPerson:
        """Archive (soft delete) a person."""
        person.archive(user=user)
        if reason:
            person.observations = (
                f"{person.observations}\n[Archived: {reason}]"
                if person.observations
                else f"[Archived: {reason}]"
            )
            person.save(update_fields=["observations"])
        return person

    def restore_person(self, person: PersonnelPerson) -> PersonnelPerson:
        """Restore an archived person."""
        person.restore()
        return person

    def _check_duplicates(self, data: dict) -> list[PersonnelPerson]:
        """Check for potential duplicates."""
        duplicates = []

        # Check CIN
        if data.get("cin"):
            duplicates.extend(PersonnelPerson.objects.filter(cin=data["cin"], is_archived=False))

        # Check name + phone
        if data.get("phone"):
            duplicates.extend(
                PersonnelPerson.objects.filter(
                    first_name__iexact=data.get("first_name", ""),
                    last_name__iexact=data.get("last_name", ""),
                    phone=data["phone"],
                    is_archived=False,
                ).exclude(cin=data.get("cin") if data.get("cin") else None)
            )

        # Check name + email
        if data.get("email"):
            duplicates.extend(
                PersonnelPerson.objects.filter(
                    first_name__iexact=data.get("first_name", ""),
                    last_name__iexact=data.get("last_name", ""),
                    email__iexact=data["email"],
                    is_archived=False,
                ).exclude(cin=data.get("cin") if data.get("cin") else None)
            )

        return list(set(duplicates))

    def search_persons(self, query: str, company=None, status=None) -> list:
        """Search personnel by name, CIN, phone, or email."""
        return (
            self.selector.get_all()
            .filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(cin__icontains=query)
                | Q(phone__icontains=query)
                | Q(email__icontains=query)
            )
            .filter(is_archived=False)
        )

    def get_person_with_relations(self, person_id) -> PersonnelPerson | None:
        """Get person with all related data."""
        try:
            person = (
                PersonnelPerson.objects.select_related("created_by", "updated_by", "archived_by")
                .prefetch_related(
                    "employments__company",
                    "employments__salaries",
                    "employments__payroll_records",
                    "employments__cnss_declarations__monthly_declarations",
                    "cnss_declarations__company",
                    "cnss_declarations__monthly_declarations",
                    "documents",
                )
                .get(id=person_id, is_archived=False)
            )
            return person
        except PersonnelPerson.DoesNotExist:
            return None

    def get_completeness_report(self, person: PersonnelPerson) -> dict:
        """Get completeness report for a person."""
        missing = person.get_missing_important_fields()
        percentage = person.get_completeness_percentage()

        return {
            "percentage": percentage,
            "missing_fields": missing,
            "is_complete": percentage >= 80,
        }


class EmploymentService:
    """
    Service layer for employment operations.

    Handles:
    - Employment lifecycle
    - Multi-company employment
    - Salary history
    """

    def __init__(self):
        self.validator = EmploymentValidator()
        self.salary_validator = EmploymentSalaryValidator()
        self.selector = EmploymentSelector()
        self.salary_selector = EmploymentSalarySelector()

    # ==================== EMPLOYMENT CREATION ====================

    @transaction.atomic
    def create_employment(self, data: dict, user=None) -> Employment:
        """Create a new employment record."""
        validated = self.validator.validate_employment_data(data, require_relations=True)

        # Check for overlapping employment
        self.validator.validate_employment_overlap(
            person_id=validated["person"].id,
            company_id=validated["company"].id,
            hire_date=validated.get("hire_date"),
            end_date=validated.get("employment_end_date"),
        )

        # Generate employee reference if not provided
        if "employee_reference" not in validated or not validated["employee_reference"]:
            validated["employee_reference"] = self._generate_employee_reference(
                validated["company"]
            )

        employment = Employment.objects.create(
            person=validated["person"],
            company=validated["company"],
            employee_reference=validated.get("employee_reference", ""),
            job_title=validated.get("job_title", ""),
            department=validated.get("department", ""),
            work_domain=validated.get("work_domain", ""),
            work_city=validated.get("work_city", ""),
            employment_status=validated.get("employment_status", "active"),
            contract_type=validated.get("contract_type", ""),
            hire_date=validated.get("hire_date"),
            employment_end_date=validated.get("employment_end_date"),
            departure_reason=validated.get("departure_reason", ""),
            resignation_date=validated.get("resignation_date"),
            is_active=validated.get("is_active", True),
            payment_method=validated.get("payment_method"),
            rib=validated.get("rib", ""),
            bank_name=validated.get("bank_name", ""),
            bank_account_holder=validated.get("bank_account_holder", ""),
            default_monthly_working_days=validated.get("default_monthly_working_days", 26),
            default_cnss_declared_days=validated.get("default_cnss_declared_days", 26),
            observations=validated.get("observations", ""),
            created_by=user,
            updated_by=user,
        )

        return employment

    def _generate_employee_reference(self, company: Company) -> str:
        """Generate unique employee reference for a company.

        Audit fix: the previous implementation used ``filter(...).count() + 1``,
        which races under concurrent creation (two requests can read the same
        count and allocate the same reference) and silently collides after an
        employment is archived (``objects`` excludes archived rows, but the
        reference must stay unique across all of them). Mirrors the
        retry-with-existence-check strategy used by
        ``Employment.generate_reference`` and
        ``apps.common.models.generate_sequential_reference``.
        """
        year = timezone.now().year
        prefix = f"EMP-{company.reference}-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    Employment.all_objects.select_for_update(nowait=False)
                    .filter(employee_reference__startswith=prefix)
                    .order_by("-employee_reference")
                    .first()
                )
                if last:
                    try:
                        num = int(last.employee_reference.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        num = 1
                else:
                    num = 1
                candidate = f"{prefix}{num:04d}"
                if not Employment.all_objects.filter(employee_reference=candidate).exists():
                    return candidate
        raise RuntimeError("Could not allocate a unique employee reference after 10 attempts.")

    def update_employment(self, employment: Employment, data: dict, user=None) -> Employment:
        """Update an existing employment record."""
        validated = self.validator.validate_employment_data(data)

        # Check for overlapping employment (excluding self)
        if "hire_date" in validated:
            self.validator.validate_employment_overlap(
                person_id=employment.person_id,
                company_id=employment.company_id,
                hire_date=validated["hire_date"],
                end_date=validated.get("employment_end_date"),
                exclude_id=employment.id,
            )

        # Update fields
        for field, value in validated.items():
            setattr(employment, field, value)

        employment.updated_by = user
        employment.save(update_fields=list(validated.keys()) + ["updated_by", "updated_at"])

        return employment

    @transaction.atomic
    def terminate_employment(
        self,
        employment: Employment,
        user=None,
        departure_reason: str = "",
        resignation_date: date = None,
    ) -> Employment:
        """Terminate an employment.

        Cycle 25 (state/IMPLEMENTATION_PLAN.md Section 19.3, finding A-3):
        this saves the employment then, separately, stops the linked CNSS
        declaration. A failure between the two used to leave a terminated
        employee still CNSS-declared. @transaction.atomic makes both writes
        commit or roll back together.
        """
        employment.employment_status = "resigned"  # or terminated
        employment.is_active = False
        employment.employment_end_date = resignation_date or date.today()
        employment.departure_reason = departure_reason
        employment.resignation_date = resignation_date or date.today()
        employment.updated_by = user
        employment.save(
            update_fields=[
                "employment_status",
                "is_active",
                "employment_end_date",
                "departure_reason",
                "resignation_date",
                "updated_by",
                "updated_at",
            ]
        )

        # Archive related CNSS declaration if exists
        if hasattr(employment, "cnss_declarations"):
            cnss = employment.cnss_declarations.filter(is_archived=False).first()
            if cnss:
                cnss.is_currently_declared = False
                cnss.declaration_stop_date = resignation_date or date.today()
                cnss.stop_reason = "employment_terminated"
                cnss.save(
                    update_fields=["is_currently_declared", "declaration_stop_date", "stop_reason"]
                )

        return employment

    def archive_employment(self, employment: Employment, user=None, reason: str = "") -> Employment:
        """Archive (soft delete) an employment."""
        employment.archive(user=user)
        if reason:
            employment.observations = (
                f"{employment.observations}\n[Archived: {reason}]"
                if employment.observations
                else f"[Archived: {reason}]"
            )
            employment.save(update_fields=["observations"])
        return employment

    def restore_employment(self, employment: Employment) -> Employment:
        """Restore an archived employment."""
        employment.restore()
        return employment

    # ==================== SALARY HISTORY ====================

    @transaction.atomic
    def set_salary(
        self,
        employment: Employment,
        amount: Decimal,
        effective_from: date,
        reason: str = "",
        notes: str = "",
        user=None,
    ) -> EmploymentSalary:
        """
        Set a new salary for an employment.

        Creates a new salary record and marks previous as not current.
        """
        # Validate
        validated = self.salary_validator.validate_salary_data(
            {
                "employment": employment,
                "fixed_monthly_gross_salary": amount,
                "effective_from": effective_from,
                "reason": reason,
                "notes": notes,
                "is_current": True,
            }
        )

        # Deactivate current salary
        current = self.salary_selector.get_current_for_employment(employment)
        if current and current.effective_from != effective_from:
            current.is_current = False
            if not current.effective_to:
                current.effective_to = effective_from - timedelta(days=1)
            current.save(update_fields=["is_current", "effective_to", "updated_at"])

        # Create new salary
        salary = EmploymentSalary.objects.create(
            employment=employment,
            fixed_monthly_gross_salary=validated["fixed_monthly_gross_salary"],
            effective_from=validated["effective_from"],
            effective_to=validated.get("effective_to"),
            reason=validated.get("reason", ""),
            notes=validated.get("notes", ""),
            is_current=True,
            created_by=user,
            updated_by=user,
        )

        return salary

    def get_salary_on_date(
        self, employment: Employment, check_date: date
    ) -> EmploymentSalary | None:
        """Get salary valid on a specific date."""
        return self.salary_selector.get_valid_on_date(employment, check_date)

    def get_salary_history(self, employment: Employment):
        """Get full salary history for an employment."""
        return self.salary_selector.get_history(employment)

    def end_current_salary(
        self, employment: Employment, end_date: date, user=None
    ) -> EmploymentSalary:
        """End the current salary period."""
        current = self.salary_selector.get_current_for_employment(employment)
        if current:
            current.effective_to = end_date
            current.is_current = False
            current.updated_by = user
            current.save(update_fields=["effective_to", "is_current", "updated_by", "updated_at"])
        return current


class MonthlyPayrollService:
    """
    Service layer for monthly payroll operations.

    Handles:
    - Monthly payroll record creation
    - Calculation
    - Approval workflow
    - Payment recording
    """

    def __init__(self):
        self.validator = MonthlyPayrollValidator()
        self.selector = MonthlyPayrollRecordSelector()
        self.payment_validator = PayrollPaymentValidator()
        self.adjustment_validator = PayrollAdjustmentValidator()

    # ==================== PAYROLL CREATION ====================

    @transaction.atomic
    def create_payroll_record(
        self, employment: Employment, year: int, month: int, user=None
    ) -> MonthlyPayrollRecord:
        """
        Create or get monthly payroll record for an employment.

        Args:
            employment: Employment instance
            year: Payroll year
            month: Payroll month (1-12)
            user: User creating the record

        Returns:
            MonthlyPayrollRecord instance
        """
        # Validate period
        self.validator.validate_period(year, month)

        # Check if already exists
        existing = MonthlyPayrollRecord.objects.filter(
            employment=employment, year=year, month=month, is_archived=False
        ).first()

        if existing:
            return existing

        # Get current salary
        salary = EmploymentSalarySelector().get_valid_on_date(employment.id, date(year, month, 1))
        if salary is None:
            raise ValidationError(
                _(
                    "Cannot create a payroll for {employee}: no salary is defined for {month}/{year}. "
                    "Set a salary first."
                ).format(
                    employee=employment.person.get_full_name(),
                    month=month,
                    year=year,
                )
            )
        gross_salary = salary.fixed_monthly_gross_salary

        # Calculate period dates
        period_start = date(year, month, 1)
        if month == 12:
            period_end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            period_end = date(year, month + 1, 1) - timedelta(days=1)

        # Default working days
        scheduled_days = employment.default_monthly_working_days or 26
        declared_days = employment.default_cnss_declared_days or 26

        payroll = MonthlyPayrollRecord.objects.create(
            employment=employment,
            year=year,
            month=month,
            period_start=period_start,
            period_end=period_end,
            scheduled_working_days=scheduled_days,
            worked_days=0,
            absence_days=0,
            authorized_leave_days=0,
            unpaid_leave_days=0,
            declared_days=declared_days,
            gross_salary_snapshot=gross_salary,
            daily_rate=Decimal("0"),
            absence_deduction=Decimal("0"),
            supplements_total=Decimal("0"),
            other_deductions_total=Decimal("0"),
            calculated_net_salary=Decimal("0"),
            total_paid=Decimal("0"),
            remaining_amount=Decimal("0"),
            payment_status="unpaid",
            status="draft",
            created_by=user,
            updated_by=user,
        )

        # Auto-calculate
        payroll.calculate_totals()
        payroll.save(
            update_fields=[
                "daily_rate",
                "absence_deduction",
                "calculated_net_salary",
                "total_paid",
                "remaining_amount",
                "payment_status",
            ]
        )

        return payroll

    def get_or_create_payroll(
        self, employment: Employment, year: int, month: int
    ) -> MonthlyPayrollRecord:
        """Get or create payroll record for employment and period."""
        return self.create_payroll_record(employment, year, month)

    # ==================== CALCULATION ====================

    @transaction.atomic
    def calculate_payroll(self, payroll: MonthlyPayrollRecord, user=None) -> MonthlyPayrollRecord:
        """
        Calculate payroll totals.

        Args:
            payroll: Payroll record to calculate
            user: User performing calculation (not used for approval)

        Returns:
            Updated payroll record
        """
        if payroll.status in ["approved", "paid"]:
            raise ValidationError(_("Cannot recalculate approved or paid payroll."))

        if not payroll.gross_salary_snapshot or payroll.gross_salary_snapshot <= Decimal("0"):
            raise ValidationError(
                _(
                    "Cannot calculate payroll: no gross salary snapshot. "
                    "Define a salary for the employment first, then recalculate."
                )
            )

        # Calculate totals and set status to 'calculated' (not 'approved')
        payroll.calculated_at = timezone.now()
        payroll.status = "calculated"
        payroll.calculate_totals()
        payroll.save(
            update_fields=[
                "daily_rate",
                "absence_deduction",
                "calculated_net_salary",
                "total_paid",
                "remaining_amount",
                "payment_status",
                "status",
                "calculated_at",
                "updated_at",
            ]
        )

        return payroll

    def recalculate_payroll(
        self,
        payroll: MonthlyPayrollRecord,
        daily_rate_override=None,
        absence_rate_override=None,
    ) -> MonthlyPayrollRecord:
        """Recalculate draft payroll.

        Args:
            payroll: The payroll record to recalculate.
            daily_rate_override: Optional Decimal. Per-day rate for worked days.
            absence_rate_override: Optional Decimal. Per-day deduction rate for
                unpaid leave days (defaults to daily_rate when not set).
        """
        if payroll.status not in ["draft", "calculated"]:
            raise ValidationError(_("Cannot recalculate approved or paid payroll."))

        payroll.recalculate(
            daily_rate_override=daily_rate_override,
            absence_rate_override=absence_rate_override,
        )
        return payroll

    # ==================== ADJUSTMENTS ====================

    @transaction.atomic
    def add_adjustment(
        self,
        payroll: MonthlyPayrollRecord,
        adjustment_type: str,
        direction: str,
        amount: Decimal,
        description: str,
        effective_date: date,
        reference: str = "",
        notes: str = "",
        user=None,
    ) -> PayrollAdjustment:
        """Add an adjustment to a payroll record."""
        if payroll.status not in ["draft", "calculated"]:
            raise ValidationError(_("Cannot add adjustment to approved or paid payroll."))

        validated = self.adjustment_validator.validate_adjustment_data(
            {
                "payroll_record": payroll,
                "adjustment_type": adjustment_type,
                "direction": direction,
                "amount": amount,
                "description": description,
                "effective_date": effective_date,
                "reference": reference,
                "notes": notes,
            }
        )

        adjustment = PayrollAdjustment.objects.create(
            payroll_record=payroll,
            adjustment_type=validated["adjustment_type"],
            direction=validated["direction"],
            amount=validated["amount"],
            description=validated["description"],
            effective_date=validated["effective_date"],
            reference=validated.get("reference", ""),
            notes=validated.get("notes", ""),
            created_by=user,
            updated_by=user,
        )

        # Recalculate payroll totals
        payroll.recalculate()

        return adjustment

    @transaction.atomic
    def remove_adjustment(self, adjustment: PayrollAdjustment) -> None:
        """Remove an adjustment and recalculate."""
        if adjustment.payroll_record.status not in ["draft", "calculated"]:
            raise ValidationError(_("Cannot remove adjustment from approved or paid payroll."))

        adjustment.delete()
        adjustment.payroll_record.recalculate()

    # ==================== PAYMENTS ====================

    def _resolve_payment_method(self, payment_method):
        """Resolve a payment method from a PK or name to a PaymentMethod instance.

        The frontend sends the payment method as either a UUID or a display name
        (e.g. "Bank Transfer", "cash"). A missing/unknown value maps to None so a
        recorded payment never crashes on an unresolvable method.
        """
        if payment_method in (None, ""):
            return None
        from apps.configuration.models import PaymentMethod

        try:
            return PaymentMethod.objects.get(id=payment_method)
        except (PaymentMethod.DoesNotExist, ValidationError):
            pass
        return PaymentMethod.objects.filter(name__iexact=str(payment_method)).first()

    @transaction.atomic
    def record_payment(
        self,
        payroll: MonthlyPayrollRecord,
        amount: Decimal,
        payment_date: date,
        payment_method=None,
        payment_kind: str = "partial_payment",
        reference: str = "",
        notes: str = "",
        observations: str = "",
        user=None,
    ) -> PayrollPayment:
        """Record a payment for a payroll record."""
        validated = self.payment_validator.validate_payment_data(
            {
                "payroll_record": payroll,
                "amount": amount,
                "payment_date": payment_date,
                "payment_method": payment_method,
                "payment_kind": payment_kind,
                "reference": reference,
                "notes": notes,
                "observations": observations,
            }
        )

        payment = PayrollPayment.objects.create(
            payroll_record=payroll,
            payment_date=validated["payment_date"],
            amount=validated["amount"],
            payment_method=self._resolve_payment_method(validated.get("payment_method")),
            payment_kind=validated["payment_kind"],
            reference=validated.get("reference", ""),
            notes=validated.get("notes", ""),
            observations=validated.get("observations", ""),
            created_by=user,
            updated_by=user,
        )

        # Update payroll totals
        payroll.calculate_totals()
        payroll.save(
            update_fields=["total_paid", "remaining_amount", "payment_status", "updated_at"]
        )

        return payment

    def record_advance(
        self,
        payroll: MonthlyPayrollRecord,
        amount: Decimal,
        payment_date: date,
        payment_method=None,
        reference: str = "",
        notes: str = "",
        user=None,
    ) -> PayrollPayment:
        """Record an advance payment."""
        return self.record_payment(
            payroll=payroll,
            amount=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            payment_kind="advance",
            reference=reference,
            notes=notes,
            user=user,
        )

    def record_final_payment(
        self,
        payroll: MonthlyPayrollRecord,
        amount: Decimal,
        payment_date: date,
        payment_method=None,
        reference: str = "",
        notes: str = "",
        user=None,
    ) -> PayrollPayment:
        """Record final payment for a payroll."""
        return self.record_payment(
            payroll=payroll,
            amount=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            payment_kind="final_payment",
            reference=reference,
            notes=notes,
            user=user,
        )

    @transaction.atomic
    def void_payment(self, payment: PayrollPayment, user=None) -> None:
        """Void a payment (decision C-4, Cycle 18: mark cancelled, never delete).

        Previously this deleted the row outright with no status guard at all,
        which both destroyed audit history and let a payment on an already
        approved/paid payroll be voided out from under it (D-1/C-4 in
        state/IMPLEMENTATION_PLAN.md Section 12). Now it mirrors the guard
        already enforced by calculate_payroll/add_adjustment, and marks the
        payment CANCELLED instead of deleting it so it remains visible for
        audit purposes; calculate_totals() excludes CANCELLED payments from
        total_paid.
        """
        payroll = payment.payroll_record
        if payroll.status in ["approved", "paid"]:
            raise ValidationError(_("Cannot void a payment on an approved or paid payroll."))
        if payment.status == PayrollPaymentStatus.CANCELLED:
            raise ValidationError(_("This payment is already cancelled."))

        payment.status = PayrollPaymentStatus.CANCELLED
        payment.cancelled_at = timezone.now()
        payment.cancelled_by = user
        payment.updated_by = user
        payment.save(
            update_fields=["status", "cancelled_at", "cancelled_by", "updated_by", "updated_at"]
        )

        payroll.calculate_totals()
        payroll.save(
            update_fields=["total_paid", "remaining_amount", "payment_status", "updated_at"]
        )

    # ==================== APPROVAL ====================

    @transaction.atomic
    def approve_payroll(self, payroll: MonthlyPayrollRecord, user) -> MonthlyPayrollRecord:
        """Approve a payroll record."""
        if payroll.status != "calculated":
            raise ValidationError(_("Only calculated payrolls can be approved."))

        payroll.status = "approved"
        payroll.approved_by = user
        payroll.approved_at = timezone.now()
        payroll.updated_by = user
        payroll.calculate_totals()
        payroll.save(
            update_fields=[
                "status",
                "approved_by",
                "approved_at",
                "updated_by",
                "updated_at",
                "total_paid",
                "remaining_amount",
                "payment_status",
            ]
        )

        return payroll

    @transaction.atomic
    def unapprove_payroll(self, payroll: MonthlyPayrollRecord, user) -> MonthlyPayrollRecord:
        """Unapprove a payroll (return to calculated)."""
        if payroll.status != "approved":
            raise ValidationError(_("Only approved payrolls can be unapproved."))

        payroll.status = "calculated"
        payroll.approved_by = None
        payroll.approved_at = None
        payroll.updated_by = user
        payroll.calculate_totals()
        payroll.save(
            update_fields=[
                "status",
                "approved_by",
                "approved_at",
                "updated_by",
                "updated_at",
                "total_paid",
                "remaining_amount",
                "payment_status",
            ]
        )

        return payroll

    # ==================== BATCH OPERATIONS ====================

    @transaction.atomic
    def bulk_create_payrolls(
        self, company, year: int, month: int, user=None
    ) -> list[MonthlyPayrollRecord]:
        """Create payroll records for all active employments in a company for a period.

        Employments without a salary defined for the period are skipped (their
        payroll would otherwise silently use a zero salary snapshot).

        Wrapped in one atomic block (Cycle 18, D-1) so a failure partway
        through the loop rolls back every payroll created earlier in this
        same call, rather than leaving a partially-created batch behind.
        """
        employments = EmploymentSelector().get_active_for_company(company)
        payrolls = []

        for emp in employments:
            try:
                payroll = self.get_or_create_payroll(emp, year, month)
            except ValidationError:
                # No salary defined for this period — skip, don't record a zero salary.
                continue
            if payroll.status == "draft":
                payroll.created_by = user
                payroll.updated_by = user
                payroll.save(update_fields=["created_by", "updated_by"])
            payrolls.append(payroll)

        return payrolls

    @transaction.atomic
    def bulk_calculate_payrolls(
        self, payrolls: list[MonthlyPayrollRecord], user
    ) -> list[MonthlyPayrollRecord]:
        """Calculate multiple payrolls.

        Wrapped in one atomic block (Cycle 18, D-1): see bulk_create_payrolls.
        """
        calculated = []
        for payroll in payrolls:
            if payroll.status in ["draft", "calculated"]:
                self.calculate_payroll(payroll, user)
                calculated.append(payroll)
        return calculated

    @transaction.atomic
    def bulk_approve_payrolls(
        self, payrolls: list[MonthlyPayrollRecord], user
    ) -> list[MonthlyPayrollRecord]:
        """Approve multiple payrolls.

        Wrapped in one atomic block (Cycle 18, D-1): see bulk_create_payrolls.
        """
        approved = []
        for payroll in payrolls:
            if payroll.status == "calculated":
                self.approve_payroll(payroll, user)
                approved.append(payroll)
        return approved


class CNSSService:
    """
    Service layer for CNSS operations.

    Handles:
    - CNSS declaration lifecycle
    - Monthly CNSS declarations
    - CNSS reporting
    """

    def __init__(self):
        self.validator = CNSSValidator()
        self.selector = CNSSDeclarationSelector()
        self.monthly_selector = CNSSMonthlyDeclarationSelector()

    # ==================== CNSS DECLARATION ====================

    @transaction.atomic
    def create_cnss_declaration(
        self,
        person: PersonnelPerson,
        company: Company,
        employment: Employment | None = None,
        cnss_number: str = "",
        cin_snapshot: str = "",
        situation: str = "declared_by_this_company",
        is_currently_declared: bool = True,
        first_declaration_date: date | None = None,
        declaration_start_date: date | None = None,
        notes: str = "",
        observations: str = "",
        user=None,
    ) -> CNSSDeclaration:
        """Create a new CNSS declaration."""
        validated = self.validator.validate_cnss_declaration_data(
            {
                "person": person,
                "company": company,
                "employment": employment,
                "cnss_registration_number": cnss_number,
                "cin_snapshot": cin_snapshot,
                "situation": situation,
                "is_currently_declared": is_currently_declared,
                "first_declaration_date": first_declaration_date,
                "declaration_start_date": declaration_start_date,
                "notes": notes,
                "observations": observations,
            }
        )

        # If setting as currently declared, deactivate others for same person/company
        if validated["is_currently_declared"]:
            CNSSDeclaration.objects.filter(
                person=person, company=company, is_currently_declared=True, is_archived=False
            ).update(is_currently_declared=False, updated_by=user, updated_at=timezone.now())

        cnss = CNSSDeclaration.objects.create(
            person=validated["person"],
            company=validated["company"],
            employment=validated.get("employment"),
            cnss_registration_number=validated.get("cnss_registration_number", ""),
            cin_snapshot=validated.get("cin_snapshot", ""),
            situation=validated.get("situation", "declared_by_this_company"),
            is_currently_declared=validated.get("is_currently_declared", True),
            first_declaration_date=validated.get("first_declaration_date"),
            declaration_start_date=validated.get("declaration_start_date"),
            declaration_end_date=validated.get("declaration_end_date"),
            resignation_date=validated.get("resignation_date"),
            stop_reason=validated.get("stop_reason", ""),
            notes=validated.get("notes", ""),
            observations=validated.get("observations", ""),
            created_by=user,
            updated_by=user,
        )

        return cnss

    @transaction.atomic
    def update_cnss_declaration(
        self, cnss: CNSSDeclaration, data: dict, user=None
    ) -> CNSSDeclaration:
        """Update a CNSS declaration."""
        validated = self.validator.validate_cnss_declaration_data(data)

        # Handle is_currently_declared change
        if (
            "is_currently_declared" in validated
            and validated["is_currently_declared"]
            and not cnss.is_currently_declared
        ):
            CNSSDeclaration.objects.filter(
                person=cnss.person,
                company=cnss.company,
                is_currently_declared=True,
                is_archived=False,
            ).exclude(pk=cnss.pk).update(
                is_currently_declared=False, updated_by=user, updated_at=timezone.now()
            )

        for field, value in validated.items():
            setattr(cnss, field, value)

        cnss.updated_by = user
        cnss.save(update_fields=list(validated.keys()) + ["updated_by", "updated_at"])

        return cnss

    def stop_cnss_declaration(
        self, cnss: CNSSDeclaration, stop_date: date, stop_reason: str, user=None
    ) -> CNSSDeclaration:
        """Stop a CNSS declaration."""
        if not cnss.is_currently_declared:
            raise ValidationError(_("Declaration is not currently active."))

        cnss.is_currently_declared = False
        cnss.declaration_stop_date = stop_date
        cnss.declaration_end_date = stop_date
        cnss.stop_reason = stop_reason
        cnss.updated_by = user
        cnss.save(
            update_fields=[
                "is_currently_declared",
                "declaration_stop_date",
                "declaration_end_date",
                "stop_reason",
                "updated_by",
                "updated_at",
            ]
        )

        return cnss

    @transaction.atomic
    def restart_cnss_declaration(
        self, cnss: CNSSDeclaration, restart_date: date, user=None
    ) -> CNSSDeclaration:
        """Restart a stopped CNSS declaration."""
        if cnss.is_currently_declared:
            raise ValidationError(_("Declaration is already active."))

        # Deactivate other active declarations for same person/company
        CNSSDeclaration.objects.filter(
            person=cnss.person, company=cnss.company, is_currently_declared=True, is_archived=False
        ).exclude(pk=cnss.pk).update(
            is_currently_declared=False, updated_by=user, updated_at=timezone.now()
        )

        cnss.is_currently_declared = True
        cnss.declaration_start_date = restart_date
        cnss.declaration_stop_date = None
        cnss.declaration_end_date = None
        cnss.stop_reason = ""
        cnss.updated_by = user
        cnss.save(
            update_fields=[
                "is_currently_declared",
                "declaration_start_date",
                "declaration_stop_date",
                "declaration_end_date",
                "stop_reason",
                "updated_by",
                "updated_at",
            ]
        )

        return cnss

    def archive_cnss_declaration(
        self, cnss: CNSSDeclaration, user=None, reason: str = ""
    ) -> CNSSDeclaration:
        """Archive a CNSS declaration."""
        cnss.archive(user=user)
        if reason:
            cnss.observations = (
                f"{cnss.observations}\n[Archived: {reason}]"
                if cnss.observations
                else f"[Archived: {reason}]"
            )
            cnss.save(update_fields=["observations"])
        return cnss

    # ==================== MONTHLY CNSS DECLARATION ====================

    def create_monthly_declaration(
        self,
        cnss_declaration: CNSSDeclaration,
        year: int,
        month: int,
        declared_days: int = 0,
        declared_salary: Decimal = Decimal("0"),
        situation: str = "active",
        status: str = "draft",
        reference: str = "",
        notes: str = "",
        observations: str = "",
        user=None,
    ) -> CNSSMonthlyDeclaration:
        """Create a monthly CNSS declaration."""
        validated = self.validator.validate_monthly_declaration_data(
            {
                "cnss_declaration": cnss_declaration,
                "year": year,
                "month": month,
                "declared_days": declared_days,
                "declared_salary": declared_salary,
                "situation": situation,
                "status": status,
                "reference": reference,
                "notes": notes,
                "observations": observations,
            }
        )

        monthly = CNSSMonthlyDeclaration.objects.create(
            cnss_declaration=validated["cnss_declaration"],
            year=validated["year"],
            month=validated["month"],
            declared_days=validated["declared_days"],
            declared_salary=validated["declared_salary"],
            situation=validated.get("situation", "active"),
            status=validated.get("status", "draft"),
            reference=validated.get("reference", ""),
            notes=validated.get("notes", ""),
            observations=validated.get("observations", ""),
            created_by=user,
            updated_by=user,
        )

        return monthly

    def get_or_create_monthly_declaration(
        self, cnss_declaration: CNSSDeclaration, year: int, month: int
    ) -> CNSSMonthlyDeclaration:
        """Get or create monthly declaration for a CNSS declaration."""
        existing = CNSSMonthlyDeclaration.objects.filter(
            cnss_declaration=cnss_declaration, year=year, month=month, is_archived=False
        ).first()

        if existing:
            return existing

        return self.create_monthly_declaration(cnss_declaration, year, month)

    def submit_monthly_declaration(
        self, monthly: CNSSMonthlyDeclaration, user
    ) -> CNSSMonthlyDeclaration:
        """Submit a monthly CNSS declaration."""
        if monthly.status != "draft":
            raise ValidationError(_("Only draft declarations can be submitted."))

        monthly.status = "submitted"
        monthly.submission_date = timezone.now()
        monthly.updated_by = user
        monthly.save(update_fields=["status", "submission_date", "updated_by", "updated_at"])

        return monthly

    def correct_monthly_declaration(
        self, monthly: CNSSMonthlyDeclaration, user
    ) -> CNSSMonthlyDeclaration:
        """Mark a monthly declaration as corrected."""
        if monthly.status not in ["submitted", "accepted", "rejected"]:
            raise ValidationError(
                _("Only submitted/accepted/rejected declarations can be corrected.")
            )

        monthly.status = "corrected"
        monthly.updated_by = user
        monthly.save(update_fields=["status", "updated_by", "updated_at"])

        return monthly

    # ==================== SELECTORS ====================

    def get_active_declarations_for_company(self, company) -> list:
        """Get active CNSS declarations for a company."""
        return self.selector.employee_declared_by_company(company)

    def get_cnss_only_persons(self, company) -> list:
        """Get CNSS-only persons (no employment) for a company."""
        return self.selector.cnss_only_persons(company)

    def get_employees_without_cnss(self, company) -> list:
        """Get active employees without CNSS declaration at a company."""
        return self.selector.not_declared(company)

    def get_pending_registrations(self) -> list:
        """Get pending CNSS registrations."""
        return self.selector.pending_registration()

    def get_suspended_declarations(self) -> list:
        """Get suspended CNSS declarations."""
        return self.selector.suspended_declarations()

    def get_monthly_declarations_for_period(self, company, year: int, month: int) -> list:
        """Get monthly CNSS declarations for a company and period."""
        return self.monthly_selector.get_for_company_period(company, year, month)

    def get_draft_monthly_declarations(self) -> list:
        """Get draft monthly declarations."""
        return self.monthly_selector.get_draft_declarations()

    def get_submitted_monthly_declarations(self) -> list:
        """Get submitted monthly declarations."""
        return self.monthly_selector.get_submitted_declarations()

    def get_entrant_declarations(self, year: int, month: int) -> list:
        """Get entrant declarations for a period."""
        return self.monthly_selector.get_for_period(year, month).filter(situation="entrant")

    def get_sortant_declarations(self, year: int, month: int) -> list:
        """Get sortant declarations for a period."""
        return self.monthly_selector.get_for_period(year, month).filter(situation="sortant")


class ReportService:
    """
    Service layer for personnel report generation.

    Handles:
    - Monthly CNSS report
    - Monthly Personnel/Payroll report
    - Export functionality
    """

    def __init__(self):
        self.selector = PersonnelPersonSelector()
        self.employment_selector = EmploymentSelector()
        self.payroll_selector = MonthlyPayrollRecordSelector()
        self.cnss_selector = CNSSMonthlyDeclarationSelector()

    # ==================== MONTHLY CNSS REPORT ====================

    def build_cnss_monthly_report(
        self, year: int, month: int, company_ids: list | None = None
    ) -> list[dict]:
        """
        Build dataset for monthly CNSS report.

        Args:
            year: Report year
            month: Report month (1-12)
            company_ids: Optional list of company IDs to filter

        Returns:
            List of report rows (dicts)
        """
        monthly_decls = self.cnss_selector.get_for_period(year, month)

        if company_ids:
            monthly_decls = monthly_decls.filter(cnss_declaration__company_id__in=company_ids)

        monthly_decls = monthly_decls.select_related(
            "cnss_declaration", "cnss_declaration__person", "cnss_declaration__company"
        ).order_by("cnss_declaration__company__name", "cnss_declaration__person__last_name")

        rows = []
        for md in monthly_decls:
            person = md.cnss_declaration.person
            company = md.cnss_declaration.company

            rows.append(
                {
                    "company": company.name,
                    "company_reference": company.reference,
                    "cnss_registration_number": md.cnss_declaration.cnss_registration_number,
                    "last_name": person.last_name,
                    "first_name": person.first_name,
                    "full_name": person.get_full_name(),
                    "declared_days": md.declared_days,
                    "cin": person.cin,
                    "situation": md.situation,
                    "situation_label": md.get_situation_display(),
                    "archived_label": (
                        "OUI" if getattr(md, "is_archived", False) else ""
                    ),
                    "first_declaration_date": md.cnss_declaration.first_declaration_date,
                    "declaration_start_date": md.cnss_declaration.declaration_start_date,
                    "declaration_stop_date": md.cnss_declaration.declaration_stop_date,
                    "resignation_date": md.cnss_declaration.resignation_date,
                    "current_declaration_state": md.cnss_declaration.situation,
                    "observation": md.observations,
                }
            )

        return rows

    # ==================== MONTHLY PERSONNEL/PAYROLL REPORT ====================

    def build_payroll_monthly_report(
        self,
        year: int,
        month: int,
        company_ids: list | None = None,
        personnel_ids: list | None = None,
        group_by: str | None = None,
    ) -> list[dict]:
        """
        Build dataset for monthly personnel/payroll report.

        Args:
            year: Report year
            month: Report month (1-12)
            company_ids: Optional list of company IDs to filter
            personnel_ids: Optional list of personnel IDs to filter
            group_by: Optional grouping field

        Returns:
            List of report rows (dicts)
        """
        payrolls = self.payroll_selector.get_for_period(year, month)

        if company_ids:
            payrolls = payrolls.filter(employment__company_id__in=company_ids)

        if personnel_ids:
            payrolls = payrolls.filter(employment__person_id__in=personnel_ids)

        payrolls = (
            payrolls.select_related("employment", "employment__person", "employment__company")
            .prefetch_related("adjustments", "payments")
            .order_by("employment__company__name", "employment__person__last_name")
        )

        rows = []
        for pr in payrolls:
            emp = pr.employment
            person = emp.person
            company = emp.company

            rows.append(
                {
                    "company": company.name,
                    "company_reference": company.reference,
                    "work_domain": emp.work_domain,
                    "work_city": emp.work_city,
                    "department": emp.department,
                    "employee_reference": emp.employee_reference,
                    "last_name": person.last_name,
                    "first_name": person.first_name,
                    "full_name": person.get_full_name(),
                    "cin": person.cin,
                    "phone": person.phone,
                    "hire_date": emp.hire_date,
                    "payroll_month": f"{month}/{year}",
                    "scheduled_days": pr.scheduled_working_days,
                    "worked_days": pr.worked_days,
                    "absence_days": pr.absence_days,
                    "declared_days": pr.declared_days,
                    "fixed_gross_salary": (
                        emp.get_current_salary().fixed_monthly_gross_salary
                        if emp.get_current_salary()
                        else Decimal("0")
                    ),
                    "gross_salary_snapshot": pr.gross_salary_snapshot,
                    "supplements": pr.supplements_total,
                    "deductions": pr.other_deductions_total,
                    "calculated_net_salary": pr.calculated_net_salary,
                    "total_paid": pr.total_paid,
                    "remaining_amount": pr.remaining_amount,
                    "rib": emp.rib,
                    "payment_method": emp.payment_method.name if emp.payment_method else "",
                    "payroll_status": pr.status,
                    "observation": pr.observations,
                }
            )

        return rows

    # ==================== EXPORT ====================

    # ---------- Printed-form templates (v17.25) ----------
    # These mirror the two paper forms the office actually files: the CNSS
    # monthly declaration and the monthly personnel payment list. They are
    # OPT-IN, selected with template=..., and deliberately do not replace the
    # default column sets: test_services.py pins "Net Salary" in the default
    # payroll export, and the wide exports remain the useful ones for
    # analysis. The printed forms are narrow on purpose.

    @staticmethod
    def cnss_declaration_template_columns() -> list[tuple[str, str]]:
        """Columns of the CNSS declaration form, in printed order."""
        return [
            ("company", "SOCIETE"),
            ("cnss_registration_number", "N° IMMATRICULATION"),
            ("full_name", "NOM ET PRENOM"),
            ("declared_days", "NBRE J"),
            ("cin", "CIN"),
            ("situation_label", "SITUATION"),
            ("first_declaration_date", "DATE 1ERE DECLARATION"),
            ("resignation_date", "DATE RESILIATION"),
            ("archived_label", "ARCHIVE"),
        ]

    @staticmethod
    def payroll_monthly_template_columns() -> list[tuple[str, str]]:
        """Columns of the monthly personnel payment list, in printed order."""
        return [
            ("company", "STE"),
            ("work_city", "LIEU"),
            ("last_name", "NOM"),
            ("first_name", "PRENOM"),
            ("cin", "N° CIN"),
            ("phone", "N° TELE"),
            ("hire_date", "DATE D'EM"),
            ("declared_days", "NJD"),
            ("gross_salary_snapshot", "S BRUT"),
            ("supplements", "SUP"),
            ("calculated_net_salary", "S NET"),
            ("rib", "RIB"),
            ("payment_method", "TYPE PAI"),
            ("observation", "OBSERVATION"),
        ]

    # Money columns a TOTAL row sums. Day counts are deliberately absent:
    # summing NJD across a company is meaningless on the printed form.
    _TEMPLATE_TOTAL_FIELDS = (
        "gross_salary_snapshot",
        "supplements",
        "calculated_net_salary",
    )

    @classmethod
    def _with_company_subtotals(cls, rows: list[dict]) -> list[dict]:
        """Insert a TOTAL STE <name> row after each company block.

        Rows arrive ordered by company name, so one pass over consecutive
        runs is enough.
        """
        if not rows:
            return []

        out: list[dict] = []
        block: list[dict] = []

        def flush(current: list[dict]) -> None:
            if not current:
                return
            out.extend(current)
            total = {"company": "TOTAL STE " + str(current[0].get("company") or "")}
            for field in cls._TEMPLATE_TOTAL_FIELDS:
                running = Decimal("0")
                for row in current:
                    value = row.get(field)
                    if value is not None:
                        running += Decimal(str(value))
                total[field] = running
            total["_is_total"] = True
            out.append(total)

        for row in rows:
            if block and row.get("company") != block[0].get("company"):
                flush(block)
                block = []
            block.append(row)
        flush(block)
        return out

    @staticmethod
    def _cnss_columns() -> list[tuple[str, str]]:
        return [
            ("company", "Company"),
            ("company_reference", "Company Ref"),
            ("cnss_registration_number", "CNSS Number"),
            ("last_name", "Last Name"),
            ("first_name", "First Name"),
            ("full_name", "Full Name"),
            ("declared_days", "Declared Days"),
            ("cin", "CIN"),
            ("situation", "Situation"),
            ("first_declaration_date", "First Declaration"),
            ("declaration_start_date", "Start Date"),
            ("declaration_stop_date", "Stop Date"),
            ("resignation_date", "Resignation Date"),
            ("current_declaration_state", "Current State"),
            ("observation", "Observation"),
        ]

    def export_cnss_report(
        self,
        year: int,
        month: int,
        company_ids: list | None = None,
        output_format: str = "xlsx",
        template: str | None = None,
        lang: str = "en",
    ) -> tuple[bytes, str, str]:
        """Export CNSS report. Supports xlsx and csv (audit fix: csv previously
        returned a 400 "Format not supported yet" even though the serializer
        and the frontend both offer it).

        `lang` translates the wide analytical export only. The printed
        declaration is an official CNSS form and keeps its French headers in
        every language - see apps/common/export_i18n.py."""
        from apps.common.export_i18n import translate_columns

        rows = self.build_cnss_monthly_report(year, month, company_ids)
        if template == "declaration":
            columns = self.cnss_declaration_template_columns()
        else:
            columns = translate_columns(self._cnss_columns(), lang)
        return self.export_rows(rows, columns, f"CNSS {month:02d} {year}", output_format)

    @staticmethod
    def _payroll_columns() -> list[tuple[str, str]]:
        return [
            ("company", "Company"),
            ("company_reference", "Company Ref"),
            ("work_domain", "Domain"),
            ("work_city", "City"),
            ("department", "Department"),
            ("employee_reference", "Emp Ref"),
            ("last_name", "Last Name"),
            ("first_name", "First Name"),
            ("full_name", "Full Name"),
            ("cin", "CIN"),
            ("phone", "Phone"),
            ("hire_date", "Hire Date"),
            ("payroll_month", "Period"),
            ("scheduled_days", "Scheduled Days"),
            ("worked_days", "Worked Days"),
            ("absence_days", "Absence Days"),
            ("declared_days", "Declared Days"),
            ("fixed_gross_salary", "Fixed Gross"),
            ("gross_salary_snapshot", "Gross Snapshot"),
            ("supplements", "Supplements"),
            ("deductions", "Deductions"),
            ("calculated_net_salary", "Net Salary"),
            ("total_paid", "Total Paid"),
            ("remaining_amount", "Remaining"),
            ("rib", "RIB"),
            ("payment_method", "Payment Method"),
            ("payroll_status", "Status"),
            ("observation", "Observation"),
        ]

    def export_payroll_report(
        self,
        year: int,
        month: int,
        company_ids: list | None = None,
        personnel_ids: list | None = None,
        output_format: str = "xlsx",
        template: str | None = None,
        lang: str = "en",
    ) -> tuple[bytes, str, str]:
        """Export payroll report. Supports xlsx and csv (see export_cnss_report).

        As with CNSS, the printed monthly list keeps its French headers."""
        from apps.common.export_i18n import translate_columns

        rows = self.build_payroll_monthly_report(year, month, company_ids, personnel_ids)
        if template == "monthly_list":
            columns = self.payroll_monthly_template_columns()
            rows = self._with_company_subtotals(rows)
        else:
            columns = translate_columns(self._payroll_columns(), lang)
        return self.export_rows(
            rows, columns, f"Payroll {month:02d} {year}", output_format
        )

    # ---------- List exports (persons / employments / salaries) ----------
    # These back the list-page export buttons. They previously did not exist:
    # the frontend called POST /personnel/{persons,salaries}/export/ and got
    # 404s (audit finding). Rows are built flat from the ViewSet's already-
    # filtered queryset so the export matches what the user sees on screen.

    @staticmethod
    def persons_export(rows_qs) -> tuple[list[dict], list[tuple[str, str]]]:
        columns = [
            ("reference", "Reference"),
            ("full_name", "Full Name"),
            ("cin", "CIN"),
            ("phone", "Phone"),
            ("email", "Email"),
            ("city", "City"),
            ("province", "Province"),
            ("region", "Region"),
            ("nationality", "Nationality"),
            ("date_of_birth", "Date of Birth"),
            ("status", "Status"),
        ]
        rows = [
            {
                "reference": p.reference,
                "full_name": p.get_full_name(),
                "cin": p.cin or "",
                "phone": p.phone,
                "email": p.email,
                "city": p.city,
                "province": p.province,
                "region": p.region,
                "nationality": p.nationality,
                "date_of_birth": p.date_of_birth,
                "status": (
                    "on_leave" if getattr(p, "is_on_leave", False) else p.status
                ),
            }
            for p in rows_qs
        ]
        return rows, columns

    @staticmethod
    def employments_export(rows_qs) -> tuple[list[dict], list[tuple[str, str]]]:
        columns = [
            ("reference", "Reference"),
            ("employee_reference", "Employee Ref"),
            ("person_name", "Employee"),
            ("company_name", "Company"),
            ("job_title", "Job Title"),
            ("department", "Department"),
            ("work_city", "Work City"),
            ("employment_status", "Status"),
            ("payout_method", "Payment Method"),
            ("rib", "RIB"),
            ("contract_type", "Contract"),
            ("hire_date", "Hire Date"),
            ("employment_end_date", "End Date"),
            ("is_active", "Active"),
        ]
        rows = [
            {
                "reference": e.reference,
                "employee_reference": e.employee_reference,
                "person_name": e.person.get_full_name(),
                "company_name": company_display_name(e.company),
                "job_title": e.job_title,
                "department": e.department,
                "work_city": e.work_city,
                "employment_status": (
                    "on_leave" if getattr(e, "is_on_leave", False) else e.employment_status
                ),
                "payout_method": e.payout_method,
                "rib": e.rib,
                "contract_type": e.contract_type,
                "hire_date": e.hire_date,
                "employment_end_date": e.employment_end_date,
                "is_active": "Yes" if e.is_active else "No",
            }
            for e in rows_qs
        ]
        return rows, columns

    @staticmethod
    def salaries_export(rows_qs) -> tuple[list[dict], list[tuple[str, str]]]:
        columns = [
            ("reference", "Reference"),
            ("employment_reference", "Employment Ref"),
            ("person_name", "Employee"),
            ("company_name", "Company"),
            ("fixed_monthly_gross_salary", "Gross Salary"),
            ("effective_from", "Effective From"),
            ("effective_to", "Effective To"),
            ("is_current", "Current"),
            ("reason", "Reason"),
        ]
        rows = [
            {
                "reference": s.reference,
                "employment_reference": s.employment.employee_reference,
                "person_name": s.employment.person.get_full_name(),
                "company_name": company_display_name(s.employment.company),
                "fixed_monthly_gross_salary": s.fixed_monthly_gross_salary,
                "effective_from": s.effective_from,
                "effective_to": s.effective_to,
                "is_current": "Yes" if s.is_current else "No",
                "reason": s.reason,
            }
            for s in rows_qs
        ]
        return rows, columns

    @staticmethod
    def cnss_declarations_export(rows_qs) -> tuple[list[dict], list[tuple[str, str]]]:
        columns = [
            ("reference", "Reference"),
            ("person_name", "Employee"),
            ("company_name", "Company"),
            ("cnss_registration_number", "CNSS Number"),
            ("situation", "Situation"),
            ("is_currently_declared", "Currently declared"),
            ("first_declaration_date", "First Declaration"),
            ("declaration_start_date", "Start Date"),
            ("declaration_stop_date", "Stop Date"),
        ]
        rows = [
            {
                "reference": row.reference,
                "person_name": row.person.get_full_name(),
                "company_name": company_display_name(row.company),
                "cnss_registration_number": row.cnss_registration_number,
                "situation": row.situation,
                "is_currently_declared": "Yes" if row.is_currently_declared else "No",
                "first_declaration_date": row.first_declaration_date,
                "declaration_start_date": row.declaration_start_date,
                "declaration_stop_date": row.declaration_stop_date,
            }
            for row in rows_qs
        ]
        return rows, columns

    def _build_xlsx(
        self, rows: list[dict], columns: list[tuple[str, str]], sheet_name: str
    ) -> bytes:
        """Build XLSX file from rows and columns."""
        from io import BytesIO

        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        wb.active.title = sheet_name

        # Header style
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
        header_alignment = Alignment(horizontal="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )

        # Write headers
        for col_idx, (_field, header) in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border

        # Write data
        for row_idx, row in enumerate(rows, 2):
            for col_idx, (field, _unused) in enumerate(columns, 1):
                value = row.get(field, "")
                if isinstance(value, Decimal):
                    value = float(value)
                elif isinstance(value, date):
                    value = value.strftime("%Y-%m-%d")
                elif value is None:
                    value = ""

                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.border = thin_border
                cell.alignment = Alignment(wrap_text=True)

                # Prevent spreadsheet formula/csv injection (D-109).
                if isinstance(value, str) and value:
                    if value[0] in ("=", "+", "-", "@") or value.lstrip().startswith(
                        ("=", "+", "-", "@")
                    ):
                        cell.value = "'" + value

        # Auto-fit columns
        for col_idx, (auto_field, header) in enumerate(columns, 1):
            max_length = max(
                len(str(header)),
                max((len(str(row.get(auto_field, ""))) for row in rows), default=0),
            )
            ws.column_dimensions[get_column_letter(col_idx)].width = min(max_length + 2, 50)

        # Save to bytes
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return output.read()

    def _build_csv(self, rows: list[dict], columns: list[tuple[str, str]]) -> bytes:
        """Build CSV bytes from rows and columns.

        Applies the same spreadsheet formula-injection guard as _build_xlsx
        (D-109): any text cell starting with =, +, - or @ is quote-prefixed so
        opening the file in Excel cannot execute it. utf-8-sig so Excel
        detects UTF-8 and renders accented names correctly.
        """
        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(safe_export_row([header for _field, header in columns]))
        for row in rows:
            line = []
            for field, _header in columns:
                value = row.get(field, "")
                if isinstance(value, Decimal):
                    value = str(value)
                elif isinstance(value, date):
                    value = value.strftime("%Y-%m-%d")
                elif value is None:
                    value = ""
                value = str(value)
                if value and (
                    value[0] in ("=", "+", "-", "@")
                    or value.lstrip().startswith(("=", "+", "-", "@"))
                ):
                    value = "'" + value
                line.append(value)
            writer.writerow(safe_export_row(line))
        return output.getvalue().encode("utf-8-sig")

    def export_rows(
        self, rows: list[dict], columns: list[tuple[str, str]], sheet_name: str, output_format: str
    ) -> tuple[bytes, str, str]:
        """Export rows in the requested format. Returns (content, content_type, extension).

        Delegates to apps.common.exporting, which is now the single
        implementation of the CSV/XLSX/PDF writers for the whole platform. The
        builders that used to live in this class were the most complete of four
        near-identical copies (the others being in audit_log, inventory and
        reports/xlsx.py, the last of which documents itself as mirroring these
        exactly), so they were the ones promoted.

        Raises ValueError for an unsupported format so the view can answer 400
        instead of crashing.
        """
        from apps.common.exporting import export_bytes

        return export_bytes(rows, columns, sheet_name, output_format)

    def _build_pdf(
        self, rows: list[dict], columns: list[tuple[str, str]], sheet_name: str
    ) -> bytes:
        """Build a PDF table report from rows and columns.

        Added in the limitations pass: the export serializer has always
        advertised pdf as a choice but every PDF request 400'd. Landscape A4
        with a repeated header row so multi-page tables stay readable. The
        formula-injection guard from _build_xlsx/_build_csv is kept here too:
        a PDF cell never executes, but its text can still be copy-pasted into
        a spreadsheet.
        """
        from io import BytesIO

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            title=sheet_name,
            leftMargin=10 * mm,
            rightMargin=10 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        styles = getSampleStyleSheet()

        data = [[str(header) for _field, header in columns]]
        for row in rows:
            line = []
            for field, _header in columns:
                value = row.get(field, "")
                if isinstance(value, Decimal):
                    value = str(value)
                elif isinstance(value, date):
                    value = value.strftime("%Y-%m-%d")
                elif value is None:
                    value = ""
                value = str(value)
                if value and (
                    value[0] in ("=", "+", "-", "@")
                    or value.lstrip().startswith(("=", "+", "-", "@"))
                ):
                    value = "'" + value
                # Keep cells short enough that the table cannot overflow the
                # page width no matter what the data contains.
                line.append(value[:120])
            data.append(line)

        table = Table(data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2F5496")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#F2F2F2")],
                    ),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )

        doc.build(
            [
                Paragraph(sheet_name, styles["Title"]),
                Spacer(1, 6 * mm),
                Paragraph(
                    f"Generated {timezone.now().strftime('%Y-%m-%d %H:%M')} — {len(rows)} row(s)",
                    styles["Normal"],
                ),
                Spacer(1, 4 * mm),
                table,
            ]
        )
        return buffer.getvalue()


class PersonnelDocumentService:
    """Service for personnel document metadata."""

    def create_document(
        self,
        person: PersonnelPerson,
        document_type: str,
        external_reference: str = "",
        employment=None,
        cnss_declaration=None,
        issue_date: date | None = None,
        expiry_date: date | None = None,
        notes: str = "",
        user=None,
    ) -> PersonnelDocumentReference:
        """Create a document reference."""
        validated = PersonnelDocumentValidator().validate_document_data(
            {
                "person": person,
                "document_type": document_type,
                "external_reference": external_reference,
                "employment": employment,
                "cnss_declaration": cnss_declaration,
                "issue_date": issue_date,
                "expiry_date": expiry_date,
                "notes": notes,
            }
        )

        doc = PersonnelDocumentReference.objects.create(
            person=validated["person"],
            employment=validated.get("employment"),
            cnss_declaration=validated.get("cnss_declaration"),
            document_type=validated["document_type"],
            external_reference=validated.get("external_reference", ""),
            issue_date=validated.get("issue_date"),
            expiry_date=validated.get("expiry_date"),
            notes=validated.get("notes", ""),
            created_by=user,
            updated_by=user,
        )

        return doc
