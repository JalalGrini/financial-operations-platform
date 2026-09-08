# apps/personnel/models.py
"""
Personnel Domain Models.

This module implements the Personnel domain for EFOP:
- PersonnelPerson: Real physical person
- Employment: Relationship between Person and Company
- EmploymentSalary: Salary history
- MonthlyPayrollRecord: Monthly payroll
- PayrollAdjustment: Supplements/deductions
- PayrollPayment: Payments and advances
- CNSSDeclaration: CNSS registration
- CNSSMonthlyDeclaration: Monthly CNSS declarations
- PersonnelDocumentReference: Document metadata
"""

from datetime import date
from decimal import Decimal
from typing import Optional

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import (
    ActiveManager,
    ReferenceTrackedModel,
    generate_sequential_reference,
)


class PersonnelStatus(models.TextChoices):
    """Status for PersonnelPerson."""

    ACTIVE = "active", _("Active")
    INACTIVE = "inactive", _("Inactive")
    SUSPENDED = "suspended", _("Suspended")
    TERMINATED = "terminated", _("Terminated")
    ARCHIVED = "archived", _("Archived")


class EmploymentPayoutMethod(models.TextChoices):
    """How this employment is paid. Independent of configuration.PaymentMethod."""

    CASH = "cash", _("Espèces")
    BANK = "bank", _("Virement bancaire")


class EmploymentStatus(models.TextChoices):
    """Status for Employment (a specific work contract)."""

    ACTIVE = "active", _("Active")
    ON_LEAVE = "on_leave", _("On Leave")
    SUSPENDED = "suspended", _("Suspended")
    TERMINATED = "terminated", _("Terminated")
    CNSS_ONLY = "cnss_only", _("CNSS Only")
    # Legacy values retained so existing rows keep validating.
    RESIGNED = "resigned", _("Resigned")
    RETIRED = "retired", _("Retired")
    FORMER = "former", _("Former")
    OTHER = "other", _("Other")


class ContractType(models.TextChoices):
    """Contract types."""

    PERMANENT = "permanent", _("Permanent (CDI)")
    FIXED_TERM = "fixed_term", _("Fixed Term (CDD)")
    TEMPORARY = "temporary", _("Temporary")
    INTERNSHIP = "internship", _("Internship")
    APPRENTICESHIP = "apprenticeship", _("Apprenticeship")
    SEASONAL = "seasonal", _("Seasonal")
    PART_TIME = "part_time", _("Part Time")
    OTHER = "other", _("Other")


class CNSSSituation(models.TextChoices):
    """CNSS situation classifications."""

    DECLARED_BY_THIS_COMPANY = "declared_by_this_company", _("Declared by this company")
    DECLARED_BY_ANOTHER_EMPLOYER = "declared_by_another_employer", _("Declared by another employer")
    PERSONALLY_INSURED = "personally_insured", _("Personally insured")
    NOT_DECLARED = "not_declared", _("Not declared")
    PENDING_REGISTRATION = "pending_registration", _("Pending registration")
    DECLARATION_SUSPENDED = "declaration_suspended", _("Declaration suspended")
    DECLARATION_STOPPED = "declaration_stopped", _("Declaration stopped")
    EXEMPT = "exempt", _("Exempt")
    UNKNOWN = "unknown", _("Unknown")
    OTHER = "other", _("Other")


class CNSSStopReason(models.TextChoices):
    """CNSS declaration stop reasons."""

    RESIGNATION = "resignation", _("Resignation")
    TERMINATION = "termination", _("Termination")
    RETIREMENT = "retirement", _("Retirement")
    DEATH = "death", _("Death")
    COMPANY_CLOSURE = "company_closure", _("Company closure")
    CONTRACT_END = "contract_end", _("Contract end")
    MUTUAL_AGREEMENT = "mutual_agreement", _("Mutual agreement")
    SUSPENSION = "suspension", _("Suspension")
    OTHER = "other", _("Other")


class EmploymentDepartureReason(models.TextChoices):
    """Employment departure reasons."""

    RESIGNATION = "resignation", _("Resignation")
    TERMINATION = "termination", _("Termination")
    RETIREMENT = "retirement", _("Retirement")
    DEATH = "death", _("Death")
    CONTRACT_END = "contract_end", _("Contract end")
    MUTUAL_AGREEMENT = "mutual_agreement", _("Mutual agreement")
    REDUNDANCY = "redundancy", _("Redundancy")
    MEDICAL = "medical", _("Medical reasons")
    OTHER = "other", _("Other")


class CNSSMonthlySituation(models.TextChoices):
    """Monthly CNSS situation."""

    ENTRANT = "entrant", _("Entrant")
    SORTANT = "sortant", _("Sortant")
    ACTIVE = "active", _("Active")
    SUSPENDED = "suspended", _("Suspended")
    CORRECTION = "correction", _("Correction")
    OTHER = "other", _("Other")


class PayrollAdjustmentType(models.TextChoices):
    """Payroll adjustment types."""

    SUPPLEMENT = "supplement", _("Supplement")
    BONUS = "bonus", _("Bonus")
    DEDUCTION = "deduction", _("Deduction")
    PENALTY = "penalty", _("Penalty")
    ADVANCE_RECOVERY = "advance_recovery", _("Advance Recovery")
    CORRECTION = "correction", _("Correction")
    OTHER = "other", _("Other")


class PayrollAdjustmentDirection(models.TextChoices):
    """Payroll adjustment direction."""

    ADDITION = "addition", _("Addition")
    DEDUCTION = "deduction", _("Deduction")


class PayrollPaymentKind(models.TextChoices):
    """Payroll payment kinds."""

    ADVANCE = "advance", _("Advance")
    PARTIAL_PAYMENT = "partial_payment", _("Partial Payment")
    FINAL_PAYMENT = "final_payment", _("Final Payment")
    ADJUSTMENT_PAYMENT = "adjustment_payment", _("Adjustment Payment")
    OTHER = "other", _("Other")


class PayrollPaymentStatus(models.TextChoices):
    """Payroll payment lifecycle status.

    Added for Cycle 18 decision C-4: a voided payment must never disappear
    from the record. ``MonthlyPayrollService.void_payment`` marks a payment
    ``CANCELLED`` instead of deleting it; ``calculate_totals`` excludes
    cancelled payments from ``total_paid`` regardless of archive state.
    """

    RECORDED = "recorded", _("Recorded")
    CANCELLED = "cancelled", _("Cancelled")


class PayrollStatus(models.TextChoices):
    """Payroll record status."""

    DRAFT = "draft", _("Draft")
    CALCULATED = "calculated", _("Calculated")
    APPROVED = "approved", _("Approved")
    PAID = "paid", _("Paid")
    CANCELLED = "cancelled", _("Cancelled")


class CNSSMonthlyStatus(models.TextChoices):
    """Monthly CNSS declaration status."""

    DRAFT = "draft", _("Draft")
    SUBMITTED = "submitted", _("Submitted")
    ACCEPTED = "accepted", _("Accepted")
    REJECTED = "rejected", _("Rejected")
    CORRECTED = "corrected", _("Corrected")


class DocumentType(models.TextChoices):
    """Personnel document types."""

    CIN = "cin", _("CIN")
    CNSS_DOCUMENT = "cnss_document", _("CNSS Document")
    EMPLOYMENT_CONTRACT = "employment_contract", _("Employment Contract")
    RIB_DOCUMENT = "rib_document", _("RIB Document")
    OTHER = "other", _("Other")


class PersonnelPerson(ReferenceTrackedModel):
    """
    PersonnelPerson - Represents a real physical person.

    This is the root entity for all personnel records.
    A person may have multiple employments, CNSS declarations, etc.
    """

    # Identification
    first_name = models.CharField(
        _("first name"),
        max_length=100,
        help_text=_("First name"),
    )
    last_name = models.CharField(
        _("last name"),
        max_length=100,
        help_text=_("Last name"),
    )
    middle_name = models.CharField(
        _("middle name"),
        max_length=100,
        blank=True,
        help_text=_("Middle name"),
    )

    # CIN - optional
    cin = models.CharField(
        _("CIN"),
        max_length=20,
        blank=True,
        null=True,
        unique=True,
        help_text=_("National Identity Card number"),
    )

    # Contact
    phone = models.CharField(
        _("phone"),
        max_length=50,
        blank=True,
        help_text=_("Phone number"),
    )
    email = models.EmailField(
        _("email"),
        blank=True,
        help_text=_("Email address"),
    )

    # Location
    address = models.TextField(
        _("address"),
        blank=True,
        help_text=_("Physical address"),
    )
    city = models.CharField(
        _("city"),
        max_length=100,
        blank=True,
        help_text=_("City"),
    )
    province = models.CharField(
        _("province"),
        max_length=100,
        blank=True,
        help_text=_("Province"),
    )
    region = models.CharField(
        _("region"),
        max_length=100,
        blank=True,
        help_text=_("Region"),
    )

    # Optional personal information
    date_of_birth = models.DateField(
        _("date of birth"),
        null=True,
        blank=True,
        help_text=_("Date of birth"),
    )
    nationality = models.CharField(
        _("nationality"),
        max_length=100,
        blank=True,
        help_text=_("Nationality"),
    )

    # Notes
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Internal notes"),
    )
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )

    # Profile photo
    photo = models.ImageField(
        _("profile photo"),
        upload_to="personnel/photos/",
        blank=True,
        null=True,
        help_text=_("Profile photo (optional)"),
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PersonnelStatus.choices,
        default=PersonnelStatus.ACTIVE,
        help_text=_("Current status"),
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("personnel person")
        verbose_name_plural = _("personnel persons")
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["last_name", "first_name"], name="pp_name_idx"),
            models.Index(fields=["cin"], name="pp_cin_idx"),
            models.Index(fields=["email"], name="pp_email_idx"),
            models.Index(fields=["status"], name="pp_status_idx"),
            models.Index(fields=["is_archived", "status"], name="pp_archive_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_personnel_person_reference",
            ),
            models.UniqueConstraint(
                fields=["cin"],
                condition=models.Q(cin__gt=""),
                name="unique_personnel_cin",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.get_full_name()}"

    def get_full_name(self):
        """Return full name."""
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(p for p in parts if p)

    def generate_reference(self) -> str:
        """Generate unique reference: PP-YYYY-NNNNN"""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"PP-{year}-"
        # Use a loop with retry to handle concurrency
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                # Lock the relevant rows for this year
                last = (
                    PersonnelPerson.all_objects.select_for_update(nowait=False)
                    .filter(reference__startswith=prefix)
                    .order_by("-reference")
                    .first()
                )
                if last:
                    try:
                        num = int(last.reference.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        num = 1
                else:
                    num = 1
                reference = f"{prefix}{num:05d}"
                # Check if reference already exists (use all_objects to include archived)
                if not PersonnelPerson.all_objects.filter(reference=reference).exists():
                    return reference
        # Fallback: use timestamp + random
        import random

        return f"{prefix}{random.randint(10000, 99999)}"

    def get_active_employments(self):
        """Get active employments for this person."""
        return self.employments.filter(is_active=True, is_archived=False)

    def get_current_employment(self, company=None):
        """Get current active employment, optionally filtered by company."""
        qs = self.get_active_employments()
        if company:
            qs = qs.filter(company=company)
        return qs.first()

    def has_active_cnss_declaration(self, company=None):
        """Check if person has active CNSS declaration."""
        qs = self.cnss_declarations.filter(is_currently_declared=True, is_archived=False)
        if company:
            qs = qs.filter(company=company)
        return qs.exists()

    def get_completeness_percentage(self) -> int:
        """Calculate profile completeness percentage."""
        important_fields = [
            "cin",
            "phone",
            "email",
            "address",
            "city",
            "date_of_birth",
            "nationality",
        ]
        total = len(important_fields)
        filled = sum(1 for field in important_fields if getattr(self, field, None))
        return int((filled / total) * 100) if total > 0 else 0

    def get_missing_important_fields(self) -> list:
        """Return list of missing important fields."""
        important_fields = {
            "cin": "CIN",
            "phone": "Phone",
            "email": "Email",
            "address": "Address",
            "city": "City",
            "date_of_birth": "Date of Birth",
            "nationality": "Nationality",
        }
        missing = []
        for field, label in important_fields.items():
            if not getattr(self, field, None):
                missing.append(label)
        return missing


class Employment(ReferenceTrackedModel):
    """
    Employment - Represents one relationship between a Person and a Company.

    A person may have multiple active employments for different companies.
    """

    # Relations
    person = models.ForeignKey(
        PersonnelPerson,
        on_delete=models.CASCADE,
        related_name="employments",
        verbose_name=_("person"),
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="employments",
        verbose_name=_("company"),
        null=True,
        blank=True,
        help_text=_("Leave empty to connect this employment to the whole group."),
    )

    # Identity and organization
    employee_reference = models.CharField(
        _("employee reference"),
        max_length=50,
        blank=True,
        help_text=_("Internal employee reference number"),
    )
    job_title = models.CharField(
        _("job title"),
        max_length=200,
        blank=True,
        help_text=_("Job title/position"),
    )
    department = models.CharField(
        _("department"),
        max_length=100,
        blank=True,
        help_text=_("Department"),
    )
    work_domain = models.CharField(
        _("work domain"),
        max_length=100,
        blank=True,
        help_text=_("Work domain/field"),
    )
    work_city = models.CharField(
        _("work city"),
        max_length=100,
        blank=True,
        help_text=_("Work city/location"),
    )

    # Employment details
    employment_status = models.CharField(
        _("employment status"),
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
        help_text=_("Current employment status"),
    )
    contract_type = models.CharField(
        _("contract type"),
        max_length=20,
        choices=ContractType.choices,
        blank=True,
        help_text=_("Contract type"),
    )
    hire_date = models.DateField(
        _("hire date"),
        null=True,
        blank=True,
        help_text=_("Date of hiring"),
    )
    employment_end_date = models.DateField(
        _("employment end date"),
        null=True,
        blank=True,
        help_text=_("Contract end date (for fixed-term contracts)"),
    )
    departure_reason = models.CharField(
        _("departure reason"),
        max_length=20,
        choices=EmploymentDepartureReason.choices,
        blank=True,
        help_text=_("Reason for departure"),
    )
    resignation_date = models.DateField(
        _("resignation date"),
        null=True,
        blank=True,
        help_text=_("Date of resignation"),
    )

    # Active flag
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_("Whether this employment is currently active"),
    )

    # Payment details
    payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("payment method"),
    )
    payout_method = models.CharField(
        _("payout method"),
        max_length=16,
        choices=EmploymentPayoutMethod.choices,
        default=EmploymentPayoutMethod.CASH,
        blank=True,
        help_text=_("Espèces or bank transfer. Independent of the PaymentMethod catalog."),
    )
    rib = models.CharField(
        _("RIB"),
        max_length=50,
        blank=True,
        help_text=_("Bank account RIB"),
    )
    bank_name = models.CharField(
        _("bank name"),
        max_length=100,
        blank=True,
        help_text=_("Bank name"),
    )
    bank_account_holder = models.CharField(
        _("bank account holder"),
        max_length=200,
        blank=True,
        help_text=_("Account holder name"),
    )

    # Work and CNSS defaults
    default_monthly_working_days = models.PositiveIntegerField(
        _("default monthly working days"),
        default=26,
        help_text=_("Default working days per month"),
    )
    default_cnss_declared_days = models.PositiveIntegerField(
        _("default CNSS declared days"),
        default=26,
        help_text=_("Default CNSS declared days per month"),
    )

    # Per-employee day pricing.
    #
    # Payroll used to price every employee the same way - gross salary divided
    # by scheduled working days - with a per-calculation override as the only
    # escape. That is wrong for a workforce whose day rates genuinely differ per
    # contract, because the correct figure had to be re-entered on every single
    # payroll run and was never recorded against the employee.
    #
    # Both stay nullable on purpose: empty means "keep deriving it", so existing
    # employments and their historical payroll maths are untouched until someone
    # deliberately sets a rate.
    worked_day_rate = models.DecimalField(
        _("worked-day rate"),
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=_(
            "Amount earned per worked day for this employee. Leave empty to derive it "
            "from gross salary / scheduled working days."
        ),
    )
    absence_day_rate = models.DecimalField(
        _("absence-day rate"),
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=_(
            "Amount deducted per unpaid absence day for this employee. Leave empty to "
            "deduct at the worked-day rate."
        ),
    )

    # Notes
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("employment")
        verbose_name_plural = _("employments")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["person", "company"], name="emp_person_company_idx"),
            models.Index(fields=["is_active", "employment_status"], name="emp_active_status_idx"),
            models.Index(fields=["employee_reference"], name="emp_ref_idx"),
            models.Index(fields=["hire_date"], name="emp_hire_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_employment_reference",
            ),
        ]

    def __str__(self):
        company_name = self.company.name if self.company_id else str(_("Tout le groupe"))
        return f"{self.reference} - {self.person.get_full_name()} @ {company_name}"

    def generate_reference(self) -> str:
        """Generate unique reference: EMP-YYYY-NNNNN"""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"EMP-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    Employment.all_objects.select_for_update(nowait=False)
                    .filter(reference__startswith=prefix)
                    .order_by("-reference")
                    .first()
                )
                if last:
                    try:
                        num = int(last.reference.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        num = 1
                else:
                    num = 1
                reference = f"{prefix}{num:05d}"
                if not Employment.all_objects.filter(reference=reference).exists():
                    return reference
        import random

        return f"{prefix}{random.randint(10000, 99999)}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.hire_date and self.employment_end_date:
            if self.employment_end_date < self.hire_date:
                raise ValidationError(_("End date cannot be before hire date."))
        if self.employment_status == EmploymentStatus.ACTIVE and self.employment_end_date:
            if self.employment_end_date <= date.today():
                raise ValidationError(_("Active employment cannot have a past end date."))

    def get_current_salary(self) -> Optional["EmploymentSalary"]:
        """Get current salary for this employment."""
        return self.salaries.filter(is_current=True).first()

    def get_salary_history(self):
        """Get salary history ordered by effective date."""
        return self.salaries.order_by("-effective_from")

    def has_overlapping_employment(self, company=None) -> bool:
        """Check if person has overlapping employment at same company."""
        qs = Employment.objects.filter(person=self.person, is_archived=False)
        if company:
            qs = qs.filter(company=company)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        return qs.filter(is_active=True).exists()


class EmploymentSalary(ReferenceTrackedModel):
    """
    EmploymentSalary - Salary history for an Employment.

    Preserves salary history with effective date ranges.
    """

    employment = models.ForeignKey(
        Employment,
        on_delete=models.PROTECT,
        related_name="salaries",
        verbose_name=_("employment"),
    )

    fixed_monthly_gross_salary = models.DecimalField(
        _("fixed monthly gross salary"),
        max_digits=18,
        decimal_places=4,
        help_text=_("Full expected gross salary for a normal complete month"),
    )
    effective_from = models.DateField(
        _("effective from"),
        help_text=_("Date from which this salary is effective"),
    )
    effective_to = models.DateField(
        _("effective to"),
        null=True,
        blank=True,
        help_text=_("Date until which this salary is effective (exclusive)"),
    )
    reason = models.CharField(
        _("reason"),
        max_length=200,
        blank=True,
        help_text=_("Reason for salary change"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Additional notes"),
    )
    is_current = models.BooleanField(
        _("is current"),
        default=True,
        help_text=_("Whether this is the current salary"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("employment salary")
        verbose_name_plural = _("employment salaries")
        ordering = ["-effective_from"]
        indexes = [
            models.Index(fields=["employment", "is_current"], name="es_emp_current_idx"),
            models.Index(fields=["effective_from"], name="es_eff_from_idx"),
            models.Index(fields=["effective_to"], name="es_eff_to_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_employment_salary_reference",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.fixed_monthly_gross_salary}"

    def generate_reference(self) -> str:
        """Generate unique reference: ESL-YYYY-NNNNN"""
        from django.db import transaction

        year = timezone.now().year
        prefix = f"ESL-{year}-"
        max_retries = 10
        for _attempt in range(max_retries):
            with transaction.atomic():
                last = (
                    EmploymentSalary.all_objects.select_for_update(nowait=False)
                    .filter(reference__startswith=prefix)
                    .order_by("-reference")
                    .first()
                )
                if last:
                    try:
                        num = int(last.reference.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        num = 1
                else:
                    num = 1
                reference = f"{prefix}{num:05d}"
                if not EmploymentSalary.all_objects.filter(reference=reference).exists():
                    return reference
        import random

        return f"{prefix}{random.randint(10000, 99999)}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.effective_to and self.effective_from:
            if self.effective_to <= self.effective_from:
                raise ValidationError(_("End date must be after start date."))

    def save(self, *args, **kwargs):
        """Ensure only one current salary per employment.

        Cycle 25 (state/IMPLEMENTATION_PLAN.md Section 19.1, finding A-1):
        the demote-others-then-save-self pair used to run without a shared
        transaction, so a failure in super().save() (e.g. a validation or
        integrity error) committed the demote but not the promotion, leaving
        the employment with zero current salaries. Wrapping in
        transaction.atomic() makes the pair all-or-nothing.
        """
        with transaction.atomic():
            if self.is_current:
                EmploymentSalary.objects.filter(
                    employment=self.employment, is_current=True
                ).exclude(pk=self.pk).update(is_current=False)
            super().save(*args, **kwargs)

    def is_valid_on(self, check_date: date) -> bool:
        """Check if this salary is valid on a given date."""
        if check_date < self.effective_from:
            return False
        if self.effective_to and check_date > self.effective_to:
            return False
        return True


class MonthlyPayrollRecord(ReferenceTrackedModel):
    """
    MonthlyPayrollRecord - One payroll record per Employment per month.

    Unique constraint: Employment + Year + Month
    """

    employment = models.ForeignKey(
        Employment,
        on_delete=models.PROTECT,
        related_name="payroll_records",
        verbose_name=_("employment"),
    )

    # Period
    year = models.PositiveIntegerField(
        _("year"),
        help_text=_("Payroll year"),
    )
    month = models.PositiveIntegerField(
        _("month"),
        help_text=_("Payroll month (1-12)"),
    )
    period_start = models.DateField(
        _("period start"),
        help_text=_("Payroll period start date"),
    )
    period_end = models.DateField(
        _("period end"),
        help_text=_("Payroll period end date"),
    )

    # Attendance summary
    scheduled_working_days = models.PositiveIntegerField(
        _("scheduled working days"),
        default=26,
        help_text=_("Scheduled working days in the period"),
    )
    worked_days = models.PositiveIntegerField(
        _("worked days"),
        default=0,
        help_text=_("Days actually worked"),
    )
    absence_days = models.PositiveIntegerField(
        _("absence days"),
        default=0,
        help_text=_("Total absence days"),
    )
    authorized_leave_days = models.PositiveIntegerField(
        _("authorized leave days"),
        default=0,
        help_text=_("Authorized leave days"),
    )
    unpaid_leave_days = models.PositiveIntegerField(
        _("unpaid leave days"),
        default=0,
        help_text=_("Unpaid leave days"),
    )
    declared_days = models.PositiveIntegerField(
        _("declared days"),
        default=0,
        help_text=_("Days declared for CNSS"),
    )

    # Salary snapshot
    gross_salary_snapshot = models.DecimalField(
        _("gross salary snapshot"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Gross salary at time of calculation"),
    )
    daily_rate = models.DecimalField(
        _("daily rate"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Daily rate (gross / scheduled days)"),
    )
    absence_deduction = models.DecimalField(
        _("absence deduction"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Total deduction for unpaid absences"),
    )
    supplements_total = models.DecimalField(
        _("supplements total"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Total supplements/bonuses"),
    )
    other_deductions_total = models.DecimalField(
        _("other deductions total"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Total other deductions"),
    )
    calculated_net_salary = models.DecimalField(
        _("calculated net salary"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Calculated net salary"),
    )

    # Payment summary
    total_paid = models.DecimalField(
        _("total paid"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Total amount paid"),
    )
    remaining_amount = models.DecimalField(
        _("remaining amount"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Remaining amount to be paid"),
    )
    payment_status = models.CharField(
        _("payment status"),
        max_length=20,
        blank=True,
        help_text=_("Overall payment status"),
    )

    # Lifecycle
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PayrollStatus.choices,
        default=PayrollStatus.DRAFT,
        help_text=_("Payroll record status"),
    )
    calculated_at = models.DateTimeField(
        _("calculated at"),
        null=True,
        blank=True,
        help_text=_("When the payroll was calculated"),
    )
    approved_at = models.DateTimeField(
        _("approved at"),
        null=True,
        blank=True,
        help_text=_("When the payroll was approved"),
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_payrolls",
        verbose_name=_("approved by"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )

    # Managers
    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("monthly payroll record")
        verbose_name_plural = _("monthly payroll records")
        ordering = ["-year", "-month", "employment__person__last_name"]
        indexes = [
            models.Index(fields=["employment", "year", "month"], name="mpr_emp_ym_idx"),
            models.Index(fields=["year", "month"], name="mpr_ym_idx"),
            models.Index(fields=["status"], name="mpr_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_monthly_payroll_reference",
            ),
            models.UniqueConstraint(
                fields=["employment", "year", "month"],
                name="unique_payroll_per_employment_per_month",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.employment.person.get_full_name()} - {self.month}/{self.year}"

    def generate_reference(self) -> str:
        """Generate unique reference: MPR-YYYY-MM-NNNNN (Cycle 24: routed through
        the shared archive-safe helper; previously queried `objects`, which
        regressed after archiving the latest record of a given month)."""
        prefix = f"MPR-{self.year}-{self.month:02d}-"
        return generate_sequential_reference(MonthlyPayrollRecord, prefix)

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.month < 1 or self.month > 12:
            raise ValidationError(_("Month must be between 1 and 12."))
        if self.year < 1900 or self.year > 2100:
            raise ValidationError(_("Invalid year."))

    def calculate_totals(self, daily_rate_override=None, absence_rate_override=None):
        """Recalculate all derived amounts.

        RATE RESOLUTION (highest priority first)
        ---------------------------------------
        1. the explicit argument - a one-off correction for this run only;
        2. the employment's own ``worked_day_rate`` / ``absence_day_rate`` - the
           per-employee contract price, so it no longer has to be retyped every
           month;
        3. the derived default - gross salary / scheduled working days, with the
           absence rate falling back to the worked-day rate.

        Step 2 is the addition. Steps 1 and 3 behave exactly as before, and an
        employment that leaves both rates empty produces byte-identical figures
        to the previous implementation.

        Args:
            daily_rate_override: Optional Decimal. One-off per-day rate for
                worked days, overriding both the employment rate and the
                derivation.
            absence_rate_override: Optional Decimal. One-off per-day deduction
                rate for unpaid leave days.
        """
        employment = self.employment

        # Daily rate (for worked days)
        if daily_rate_override is not None:
            self.daily_rate = Decimal(str(daily_rate_override)).quantize(Decimal("0.0001"))
        elif employment is not None and employment.worked_day_rate is not None:
            self.daily_rate = Decimal(str(employment.worked_day_rate)).quantize(Decimal("0.0001"))
        elif self.scheduled_working_days > 0:
            self.daily_rate = (self.gross_salary_snapshot / self.scheduled_working_days).quantize(
                Decimal("0.0001")
            )
        else:
            self.daily_rate = Decimal("0")

        # Absence deduction rate (per unpaid-leave day)
        if absence_rate_override is not None:
            effective_absence_rate = Decimal(str(absence_rate_override)).quantize(
                Decimal("0.0001")
            )
        elif employment is not None and employment.absence_day_rate is not None:
            effective_absence_rate = Decimal(str(employment.absence_day_rate)).quantize(
                Decimal("0.0001")
            )
        else:
            effective_absence_rate = self.daily_rate
        self.absence_deduction = (effective_absence_rate * self.unpaid_leave_days).quantize(
            Decimal("0.0001")
        )

        # Calculate supplements and deductions from adjustments
        from apps.personnel.models import PayrollAdjustmentDirection

        additions = self.adjustments.filter(
            direction=PayrollAdjustmentDirection.ADDITION
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0")
        deductions = self.adjustments.filter(
            direction=PayrollAdjustmentDirection.DEDUCTION
        ).aggregate(total=models.Sum("amount"))["total"] or Decimal("0")

        # Update stored fields for reference
        self.supplements_total = additions
        self.other_deductions_total = deductions

        # Net salary calculation
        self.calculated_net_salary = (
            self.gross_salary_snapshot
            + self.supplements_total
            - self.absence_deduction
            - self.other_deductions_total
        ).quantize(Decimal("0.0001"))

        # Total paid and remaining
        # Cycle 18 decision C-4: cancelled payments (voided via void_payment())
        # stay in the table for audit purposes but must never count toward
        # total_paid, or a voided payment would still make the payroll look
        # settled.
        from apps.personnel.models import PayrollPaymentStatus

        self.total_paid = self.payments.exclude(status=PayrollPaymentStatus.CANCELLED).aggregate(
            total=models.Sum("amount")
        )["total"] or Decimal("0")
        self.remaining_amount = (self.calculated_net_salary - self.total_paid).quantize(
            Decimal("0.0001")
        )

        # Payment status. Audit fix: the previous check was simply
        # ``total_paid >= calculated_net_salary``, which is trivially true when
        # both are zero, so a freshly created draft (net 0, nothing paid) and a
        # fully-deducted payroll (net 0 by full absence) both reported
        # "paid" before a single centime moved. "paid" now requires an actual
        # payment or an actual amount owed.
        if self.total_paid > 0 and self.total_paid >= self.calculated_net_salary:
            self.payment_status = "paid"
        elif self.total_paid == 0 and self.calculated_net_salary <= 0:
            # Nothing is owed (e.g. a month fully deducted for unpaid
            # absence): settled by construction, not by payment.
            self.payment_status = "paid"
        elif self.total_paid > 0:
            self.payment_status = "partial"
        else:
            self.payment_status = "unpaid"

    def calculate(self, user=None):
        """Full calculation and approval workflow."""
        if self.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            raise ValueError(_("Cannot calculate approved or paid payroll."))
        self.calculated_at = timezone.now()
        if user:
            self.approved_by = user
            self.approved_at = timezone.now()
            self.status = PayrollStatus.APPROVED
        else:
            self.status = PayrollStatus.CALCULATED
        self.calculated_at = timezone.now()
        self.calculate_totals()
        self.save(
            update_fields=[
                "daily_rate",
                "absence_deduction",
                "calculated_net_salary",
                "total_paid",
                "remaining_amount",
                "payment_status",
                "status",
                "calculated_at",
                "approved_at",
                "approved_by",
            ]
        )

    def recalculate(self, daily_rate_override=None, absence_rate_override=None):
        """Recalculate totals (for draft records).

        Args:
            daily_rate_override: Optional Decimal. Per-day rate for worked days.
            absence_rate_override: Optional Decimal. Per-day deduction rate for
                unpaid leave days. Defaults to daily_rate when not provided.
        """
        if self.status in [PayrollStatus.APPROVED, PayrollStatus.PAID]:
            raise ValueError(_("Cannot recalculate approved or paid payroll."))
        self.calculate_totals(
            daily_rate_override=daily_rate_override,
            absence_rate_override=absence_rate_override,
        )
        self.save(
            update_fields=[
                "daily_rate",
                "absence_deduction",
                "calculated_net_salary",
                "total_paid",
                "remaining_amount",
                "payment_status",
                "supplements_total",
                "other_deductions_total",
            ]
        )

    def approve(self, user):
        """Approve the payroll record."""
        if self.status != PayrollStatus.CALCULATED:
            raise ValueError(_("Only calculated payrolls can be approved."))
        self.approved_by = user
        self.approved_at = timezone.now()
        self.status = PayrollStatus.APPROVED
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])


class PayrollAdjustment(ReferenceTrackedModel):
    """
    PayrollAdjustment - Supplements and deductions for a payroll record.
    """

    payroll_record = models.ForeignKey(
        MonthlyPayrollRecord,
        on_delete=models.PROTECT,
        related_name="adjustments",
        verbose_name=_("payroll record"),
    )

    adjustment_type = models.CharField(
        _("adjustment type"),
        max_length=20,
        choices=PayrollAdjustmentType.choices,
        help_text=_("Type of adjustment"),
    )
    direction = models.CharField(
        _("direction"),
        max_length=10,
        choices=PayrollAdjustmentDirection.choices,
        help_text=_("Addition or deduction"),
    )
    amount = models.DecimalField(
        _("amount"),
        max_digits=18,
        decimal_places=4,
        help_text=_("Adjustment amount"),
    )
    description = models.CharField(
        _("description"),
        max_length=200,
        blank=True,
        help_text=_("Description of adjustment"),
    )
    effective_date = models.DateField(
        _("effective date"),
        help_text=_("Date the adjustment applies"),
    )
    reference = models.CharField(
        _("reference"),
        max_length=100,
        blank=True,
        help_text=_("External reference"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("payroll adjustment")
        verbose_name_plural = _("payroll adjustments")
        ordering = ["-effective_date", "-created_at"]
        indexes = [
            models.Index(fields=["payroll_record"], name="padj_pr_idx"),
            models.Index(fields=["adjustment_type"], name="padj_type_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_payroll_adjustment_reference",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.adjustment_type} ({self.amount})"

    def generate_reference(self) -> str:
        """Generate unique reference: PAD-YYYY-NNNNN (Cycle 24: routed through the
        shared archive-safe helper; previously queried `objects`)."""
        year = timezone.now().year
        return generate_sequential_reference(PayrollAdjustment, f"PAD-{year}-")

    def get_signed_amount(self) -> Decimal:
        """Return amount with sign based on direction."""
        if self.direction == PayrollAdjustmentDirection.ADDITION:
            return self.amount
        return -self.amount


class PayrollPayment(ReferenceTrackedModel):
    """
    PayrollPayment - Payments and advances for a payroll record.
    """

    payroll_record = models.ForeignKey(
        MonthlyPayrollRecord,
        on_delete=models.PROTECT,
        related_name="payments",
        verbose_name=_("payroll record"),
    )

    payment_date = models.DateField(
        _("payment date"),
        help_text=_("Date of payment"),
    )
    amount = models.DecimalField(
        _("amount"),
        max_digits=18,
        decimal_places=4,
        help_text=_("Payment amount"),
    )
    payment_method = models.ForeignKey(
        "configuration.PaymentMethod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("payment method"),
    )
    payment_kind = models.CharField(
        _("payment kind"),
        max_length=20,
        choices=PayrollPaymentKind.choices,
        default=PayrollPaymentKind.PARTIAL_PAYMENT,
        help_text=_("Type of payment"),
    )
    reference = models.CharField(
        _("reference"),
        max_length=100,
        blank=True,
        help_text=_("Payment reference"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=PayrollPaymentStatus.choices,
        default=PayrollPaymentStatus.RECORDED,
        help_text=_(
            "Cycle 18 decision C-4: a cancelled payment stays in the record for audit purposes."
        ),
    )
    cancelled_at = models.DateTimeField(
        _("cancelled at"),
        null=True,
        blank=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("cancelled by"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("payroll payment")
        verbose_name_plural = _("payroll payments")
        ordering = ["-payment_date", "-created_at"]
        indexes = [
            models.Index(fields=["payroll_record"], name="pp_pr_idx"),
            models.Index(fields=["payment_date"], name="pp_date_idx"),
            models.Index(fields=["payment_kind"], name="pp_kind_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_payroll_payment_reference",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.amount} ({self.payment_kind})"

    def generate_reference(self) -> str:
        """Generate unique reference: PPT-YYYY-NNNNN (Cycle 24: routed through the
        shared archive-safe helper; previously queried `objects`)."""
        year = timezone.now().year
        return generate_sequential_reference(PayrollPayment, f"PPT-{year}-")


# NOTE (cycle 2 deduplication):
#
# A second definition of `CNSSSituation` used to sit here, immediately above
# `CNSSDeclaration`. It was member-for-member identical to the definition near
# the top of this module (only the docstring differed), so this duplicate was
# harmless in behaviour - but Python keeps only the last definition, meaning the
# `situation` field below silently resolved to this copy rather than the one
# every other module imports.
#
# That is a latent hazard rather than a live bug: had either copy been edited -
# a new CNSS situation added, a value renamed - the two would have diverged, and
# the field's choices would have disagreed with the constants used by
# `apps/personnel/selectors.py` and `apps/personnel/managers.py`, producing
# filters that silently match nothing.
#
# Guarded by `apps/common/tests/test_module_hygiene.py`.


class CNSSDeclaration(ReferenceTrackedModel):
    """
    CNSSDeclaration - CNSS registration for a person at a company.

    May optionally reference an Employment.
    Supports CNSS-only persons (no employment).
    Multiple archived declarations per person/company are allowed for history.
    """

    person = models.ForeignKey(
        PersonnelPerson,
        on_delete=models.CASCADE,
        related_name="cnss_declarations",
        verbose_name=_("person"),
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="cnss_declarations",
        verbose_name=_("company"),
    )
    employment = models.ForeignKey(
        Employment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cnss_declarations",
        verbose_name=_("employment"),
        help_text=_("Optional link to employment"),
    )

    # Registration
    cnss_registration_number = models.CharField(
        _("CNSS registration number"),
        max_length=50,
        blank=True,
        help_text=_("CNSS registration number"),
    )
    cin_snapshot = models.CharField(
        _("CIN snapshot"),
        max_length=20,
        blank=True,
        help_text=_("CIN at time of declaration"),
    )

    # Situation
    situation = models.CharField(
        _("situation"),
        max_length=30,
        choices=CNSSSituation.choices,
        default=CNSSSituation.NOT_DECLARED,
        help_text=_("CNSS situation"),
    )
    is_currently_declared = models.BooleanField(
        _("currently declared"),
        default=False,
        help_text=_("Whether currently declared to CNSS"),
    )

    # Dates
    first_declaration_date = models.DateField(
        _("first declaration date"),
        null=True,
        blank=True,
        help_text=_("First CNSS declaration date"),
    )
    declaration_start_date = models.DateField(
        _("declaration start date"),
        null=True,
        blank=True,
        help_text=_("Date declaration became effective"),
    )
    declaration_end_date = models.DateField(
        _("declaration end date"),
        null=True,
        blank=True,
        help_text=_("Date declaration ends"),
    )
    declaration_stop_date = models.DateField(
        _("declaration stop date"),
        null=True,
        blank=True,
        help_text=_("Date declaration was stopped"),
    )
    resignation_date = models.DateField(
        _("resignation date"),
        null=True,
        blank=True,
        help_text=_("Resignation date if applicable"),
    )

    # Status and reason
    stop_reason = models.CharField(
        _("stop reason"),
        max_length=20,
        choices=CNSSStopReason.choices,
        blank=True,
        help_text=_("Reason for stopping declaration"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("CNSS declaration")
        verbose_name_plural = _("CNSS declarations")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["person", "company"], name="cnd_person_company_idx"),
            models.Index(fields=["is_currently_declared"], name="cnd_current_idx"),
            models.Index(fields=["situation"], name="cnd_situation_idx"),
            models.Index(fields=["cnss_registration_number"], name="cnd_reg_num_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_cnss_declaration_reference",
            ),
            models.UniqueConstraint(
                fields=["person", "company"],
                condition=models.Q(is_archived=False, is_currently_declared=True),
                name="unique_active_cnss_declared_per_person_company",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.person.get_full_name()} @ {self.company.name}"

    def generate_reference(self) -> str:
        """Generate unique reference: CNSS-YYYY-NNNNN (Cycle 24: routed through the
        shared helper, which adds `select_for_update` locking; this method was
        already archive-safe via `all_objects` but had no row lock - see
        state/IMPLEMENTATION_PLAN.md Section 18.3, F-3)."""
        year = timezone.now().year
        return generate_sequential_reference(CNSSDeclaration, f"CNSS-{year}-")

    def is_currently_active(self) -> bool:
        """Check if declaration is currently active based on dates."""
        if not self.is_currently_declared:
            return False
        if self.declaration_start_date and self.declaration_start_date > date.today():
            return False
        if self.declaration_end_date and self.declaration_end_date <= date.today():
            return False
        return True

    def get_current_monthly_declaration(self, year=None, month=None):
        """Get monthly declaration for current or specified month."""
        qs = self.monthly_declarations.all()
        if year is not None:
            qs = qs.filter(year=year)
        if month is not None:
            qs = qs.filter(month=month)
        return qs.first()


class CNSSMonthlyDeclaration(ReferenceTrackedModel):
    """
    CNSSMonthlyDeclaration - Monthly CNSS declaration.

    Unique constraint: CNSSDeclaration + Year + Month
    """

    cnss_declaration = models.ForeignKey(
        CNSSDeclaration,
        on_delete=models.PROTECT,
        related_name="monthly_declarations",
        verbose_name=_("CNSS declaration"),
    )

    year = models.PositiveIntegerField(
        _("year"),
        help_text=_("Declaration year"),
    )
    month = models.PositiveIntegerField(
        _("month"),
        help_text=_("Declaration month (1-12)"),
    )

    declared_days = models.PositiveIntegerField(
        _("declared days"),
        default=0,
        help_text=_("Number of days declared"),
    )
    declared_salary = models.DecimalField(
        _("declared salary"),
        max_digits=18,
        decimal_places=4,
        default=Decimal("0"),
        help_text=_("Declared salary for CNSS"),
    )
    situation = models.CharField(
        _("situation"),
        max_length=20,
        choices=CNSSMonthlySituation.choices,
        default=CNSSMonthlySituation.ACTIVE,
        help_text=_("Monthly situation"),
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=CNSSMonthlyStatus.choices,
        default=CNSSMonthlyStatus.DRAFT,
    )
    submission_date = models.DateTimeField(
        _("submission date"),
        null=True,
        blank=True,
        help_text=_("Date submitted to CNSS"),
    )
    reference = models.CharField(
        _("reference"),
        max_length=100,
        blank=True,
        help_text=_("CNSS submission reference"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )
    observations = models.TextField(
        _("observations"),
        blank=True,
        help_text=_("Observations"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("CNSS monthly declaration")
        verbose_name_plural = _("CNSS monthly declarations")
        ordering = ["-year", "-month"]
        indexes = [
            models.Index(fields=["cnss_declaration", "year", "month"], name="cmd_cnd_ym_idx"),
            models.Index(fields=["year", "month"], name="cmd_ym_idx"),
            models.Index(fields=["status"], name="cmd_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_cnss_monthly_reference",
            ),
            models.UniqueConstraint(
                fields=["cnss_declaration", "year", "month"],
                name="unique_monthly_cnss_per_declaration",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.cnss_declaration.person.get_full_name()} - {self.month}/{self.year}"

    def generate_reference(self) -> str:
        """Generate unique reference: CMD-YYYY-MM-NNNNN (Cycle 24: routed through
        the shared archive-safe helper; previously queried `objects`)."""
        prefix = f"CMD-{self.year}-{self.month:02d}-"
        return generate_sequential_reference(CNSSMonthlyDeclaration, prefix)

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.month < 1 or self.month > 12:
            raise ValidationError(_("Month must be between 1 and 12."))
        if self.year < 1900 or self.year > 2100:
            raise ValidationError(_("Invalid year."))


class PersonnelDocumentReference(ReferenceTrackedModel):
    """
    PersonnelDocumentReference - Metadata for personnel documents.

    Metadata plus an optional privately stored ready file.  The file is
    never exposed through MEDIA_URL; authenticated downloads use the
    permission-checked API action on the document ViewSet.
    """

    person = models.ForeignKey(
        PersonnelPerson,
        on_delete=models.CASCADE,
        related_name="documents",
        verbose_name=_("person"),
    )
    employment = models.ForeignKey(
        Employment,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
        verbose_name=_("employment"),
    )
    cnss_declaration = models.ForeignKey(
        CNSSDeclaration,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
        verbose_name=_("CNSS declaration"),
    )

    document_type = models.CharField(
        _("document type"),
        max_length=20,
        choices=DocumentType.choices,
        help_text=_("Type of document"),
    )
    external_reference = models.CharField(
        _("external reference"),
        max_length=255,
        blank=True,
        help_text=_("External/storage reference (path, URL, ID)"),
    )
    file = models.FileField(
        _("ready file"),
        upload_to="private/personnel-documents/%Y/%m/",
        max_length=500,
        blank=True,
    )
    file_name = models.CharField(_("original file name"), max_length=255, blank=True)
    content_type = models.CharField(_("content type"), max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(_("file size"), default=0)
    issue_date = models.DateField(
        _("issue date"),
        null=True,
        blank=True,
        help_text=_("Document issue date"),
    )
    expiry_date = models.DateField(
        _("expiry date"),
        null=True,
        blank=True,
        help_text=_("Document expiry date"),
    )
    notes = models.TextField(
        _("notes"),
        blank=True,
        help_text=_("Notes"),
    )

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("personnel document reference")
        verbose_name_plural = _("personnel document references")
        ordering = ["-issue_date", "-created_at"]
        indexes = [
            models.Index(fields=["person", "document_type"], name="pdoc_person_type_idx"),
            models.Index(fields=["document_type"], name="pdoc_type_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference"],
                name="unique_personnel_document_reference",
            ),
        ]

    def __str__(self):
        return f"{self.reference} - {self.document_type} - {self.person.get_full_name()}"

    def generate_reference(self) -> str:
        """Generate unique reference: PDOC-YYYY-NNNNN (Cycle 24: routed through
        the shared archive-safe helper; previously queried `objects`)."""
        year = timezone.now().year
        return generate_sequential_reference(PersonnelDocumentReference, f"PDOC-{year}-")


# Signals for automatic reference generation and validation
from django.db.models.signals import pre_save
from django.dispatch import receiver


@receiver(pre_save, sender=PersonnelPerson)
@receiver(pre_save, sender=Employment)
@receiver(pre_save, sender=EmploymentSalary)
@receiver(pre_save, sender=MonthlyPayrollRecord)
@receiver(pre_save, sender=PayrollAdjustment)
@receiver(pre_save, sender=PayrollPayment)
@receiver(pre_save, sender=CNSSDeclaration)
@receiver(pre_save, sender=CNSSMonthlyDeclaration)
@receiver(pre_save, sender=PersonnelDocumentReference)
def generate_reference_if_missing(sender, instance, **kwargs):
    """Auto-generate reference if missing before save."""
    if not instance.reference and hasattr(instance, "generate_reference"):
        instance.reference = instance.generate_reference()
