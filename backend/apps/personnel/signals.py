# apps/personnel/signals.py
"""
Personnel Signals.

Django signals for automatic reference generation and local validation only.
Cross-model business logic has been moved to explicit Services.
"""
import logging

from django.core.exceptions import ValidationError
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.personnel.models import (
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

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=PersonnelPerson)
def personnel_person_pre_save(sender, instance, **kwargs):
    """Auto-generate reference if missing and normalize fields."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Normalize name casing
    if instance.first_name:
        instance.first_name = instance.first_name.strip().capitalize()
    if instance.last_name:
        instance.last_name = instance.last_name.strip().upper()
    if instance.middle_name:
        instance.middle_name = instance.middle_name.strip().capitalize()

    # Normalize CIN
    if instance.cin:
        instance.cin = instance.cin.strip().upper()

    # Normalize phone
    if instance.phone:
        instance.phone = instance.phone.strip()

    # Normalize email
    if instance.email:
        instance.email = instance.email.strip().lower()


@receiver(post_save, sender=PersonnelPerson)
def personnel_person_post_save(sender, instance, created, **kwargs):
    """Post-save actions for PersonnelPerson - logging only."""
    if created:
        logger.info(f"Created PersonnelPerson: {instance.reference} - {instance.get_full_name()}")
    else:
        logger.info(f"Updated PersonnelPerson: {instance.reference}")


@receiver(pre_save, sender=Employment)
def employment_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and validate dates locally."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Validate dates
    if instance.hire_date and instance.employment_end_date:
        if instance.employment_end_date <= instance.hire_date:
            raise ValidationError(_("End date must be after hire date."))

    # Normalize employee reference
    if instance.employee_reference:
        instance.employee_reference = instance.employee_reference.strip().upper()


@receiver(post_save, sender=Employment)
def employment_post_save(sender, instance, created, **kwargs):
    """Post-save actions for Employment - logging only."""
    if created:
        logger.info(
            f"Created Employment: {instance.reference} - {instance.person} @ {instance.company}"
        )


@receiver(pre_save, sender=EmploymentSalary)
def employment_salary_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and validate periods locally."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Validate dates - only for current salary (not historical ones being ended)
    if instance.effective_to and instance.effective_from and instance.is_current:
        if instance.effective_to <= instance.effective_from:
            raise ValidationError(_("End date must be after start date."))

    # Auto-derive is_current from the dates ONLY when the record is first
    # created. On updates the service layer owns this flag explicitly
    # (EmploymentService.set_salary deactivates the previous salary,
    # end_current_salary ends one early); recomputing it here on every save
    # silently undoes those explicit writes whenever the dates still span
    # today - e.g. end_current_salary(end_date=tomorrow) would flip straight
    # back to is_current=True. _state.adding distinguishes create from update
    # without a database round-trip.
    if instance._state.adding and instance.effective_from:
        today = timezone.now().date()
        if instance.effective_from <= today:
            if not instance.effective_to or instance.effective_to >= today:
                instance.is_current = True
            else:
                instance.is_current = False


@receiver(post_save, sender=EmploymentSalary)
def employment_salary_post_save(sender, instance, created, **kwargs):
    """Post-save actions for EmploymentSalary - logging only."""
    if created:
        logger.info(f"Created EmploymentSalary: {instance.reference} - {instance.employment}")
    else:
        logger.info(f"Updated EmploymentSalary: {instance.reference}")


@receiver(pre_save, sender=MonthlyPayrollRecord)
def monthly_payroll_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and validate period locally."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Validate period
    if instance.month < 1 or instance.month > 12:
        raise ValidationError(_("Month must be between 1 and 12."))

    if instance.year < 1900 or instance.year > 2100:
        raise ValidationError(_("Invalid year."))


@receiver(post_save, sender=MonthlyPayrollRecord)
def monthly_payroll_post_save(sender, instance, created, **kwargs):
    """Post-save actions for MonthlyPayrollRecord - logging only."""
    if created:
        logger.info(f"Created MonthlyPayrollRecord: {instance.reference}")


@receiver(pre_save, sender=PayrollAdjustment)
def payroll_adjustment_pre_save(sender, instance, **kwargs):
    """Auto-generate reference."""
    if not instance.reference:
        instance.reference = instance.generate_reference()


@receiver(post_save, sender=PayrollAdjustment)
def payroll_adjustment_post_save(sender, instance, created, **kwargs):
    """Post-save actions for PayrollAdjustment - logging only.

    Payroll recalculation is handled explicitly by MonthlyPayrollService.add_adjustment()
    and MonthlyPayrollService.remove_adjustment() to avoid hidden side effects.
    """
    if created:
        logger.info(f"Created PayrollAdjustment: {instance.reference} - {instance.adjustment_type}")
    else:
        logger.info(f"Updated PayrollAdjustment: {instance.reference}")


@receiver(pre_save, sender=PayrollPayment)
def payroll_payment_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and validate payment date and amount locally."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Validate payment date
    if instance.payment_date > timezone.now().date():
        raise ValidationError(_("Payment date cannot be in the future."))

    # Validate payment amount is positive
    if instance.amount is not None and instance.amount <= 0:
        raise ValidationError(_("Payment amount must be positive."))


@receiver(post_save, sender=PayrollPayment)
def payroll_payment_post_save(sender, instance, created, **kwargs):
    """Post-save actions for PayrollPayment - logging only.

    Payroll totals synchronization is handled explicitly by MonthlyPayrollService.record_payment()
    and MonthlyPayrollService.void_payment() to avoid hidden side effects.
    """
    if created:
        logger.info(f"Created PayrollPayment: {instance.reference} - {instance.amount}")
    else:
        logger.info(f"Updated PayrollPayment: {instance.reference}")


@receiver(pre_save, sender=CNSSDeclaration)
def cnss_declaration_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and normalize fields."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Normalize CNSS number
    if instance.cnss_registration_number:
        instance.cnss_registration_number = instance.cnss_registration_number.strip().upper()

    # Normalize CIN snapshot
    if instance.cin_snapshot:
        instance.cin_snapshot = instance.cin_snapshot.strip().upper()


@receiver(post_save, sender=CNSSDeclaration)
def cnss_declaration_post_save(sender, instance, created, **kwargs):
    """Post-save actions for CNSSDeclaration - logging only.

    Mutual exclusion of active CNSS declarations is handled explicitly by CNSSService
    to avoid hidden side effects during bulk operations or migrations.
    """
    if created:
        logger.info(
            f"Created CNSSDeclaration: {instance.reference} - {instance.person} @ {instance.company}"
        )


@receiver(pre_save, sender=CNSSMonthlyDeclaration)
def cnss_monthly_pre_save(sender, instance, **kwargs):
    """Auto-generate reference and validate period locally."""
    if not instance.reference:
        instance.reference = instance.generate_reference()

    # Validate period
    if instance.month < 1 or instance.month > 12:
        raise ValidationError(_("Month must be between 1 and 12."))

    if instance.year < 1900 or instance.year > 2100:
        raise ValidationError(_("Invalid year."))


@receiver(post_save, sender=CNSSMonthlyDeclaration)
def cnss_monthly_post_save(sender, instance, created, **kwargs):
    """Post-save actions for CNSSMonthlyDeclaration - logging only."""
    if created:
        logger.info(f"Created CNSSMonthlyDeclaration: {instance.reference}")


@receiver(pre_save, sender=PersonnelDocumentReference)
def personnel_document_pre_save(sender, instance, **kwargs):
    """Auto-generate reference."""
    if not instance.reference:
        instance.reference = instance.generate_reference()


# Custom validation signals - these remain as they enforce local model invariants
# that cannot be expressed as database constraints alone


@receiver(pre_save, sender=Employment)
def validate_employment_overlap(sender, instance, **kwargs):
    """Enforce the same interval rule for API, service, and direct writes."""
    if not instance.hire_date:
        return
    from apps.personnel.validators import EmploymentValidator

    EmploymentValidator().validate_employment_overlap(
        person_id=instance.person_id,
        company_id=instance.company_id,
        hire_date=instance.hire_date,
        end_date=instance.employment_end_date,
        exclude_id=instance.pk,
    )


@receiver(pre_save, sender=MonthlyPayrollRecord)
def validate_unique_payroll(sender, instance, **kwargs):
    """Ensure unique payroll per employment per month.

    This is a safety net in addition to the database unique constraint,
    providing a clearer error message before hitting the database.
    """
    if instance.pk is None:  # Only on create
        from apps.personnel.models import MonthlyPayrollRecord

        existing = MonthlyPayrollRecord.objects.filter(
            employment=instance.employment,
            year=instance.year,
            month=instance.month,
            is_archived=False,
        ).exists()
        if existing:
            raise ValidationError(
                _("A payroll record already exists for this employment in this month.")
            )


@receiver(pre_save, sender=PersonnelDocumentReference)
def validate_document_expiry(sender, instance, **kwargs):
    """Validate document expiry date is after issue date."""
    if instance.expiry_date and instance.issue_date:
        if instance.expiry_date <= instance.issue_date:
            raise ValidationError(_("Expiry date must be after issue date."))
