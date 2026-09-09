# apps/personnel/tests/factories.py
"""
Test factories for Personnel app.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from apps.accounts.models import User
from apps.companies.models import Company
from apps.personnel.models import (
    CNSSDeclaration,
    CNSSMonthlyDeclaration,
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PersonnelPerson,
)


def create_test_user(email="test@example.com", password="testpass123"):
    """Create a test user."""
    return User.objects.create_user(email=email, password=password)


def create_test_company(name="Test Company", user=None):
    """Create a test company."""
    registration_number = f"REG{uuid.uuid4().hex[:8]}"
    tax_id = f"TAX{uuid.uuid4().hex[:8]}"
    return Company.objects.create(
        name=name,
        registration_number=registration_number,
        tax_id=tax_id,
        created_by=user,
        updated_by=user,
    )


def create_test_person(
    first_name="John",
    last_name="Doe",
    middle_name="",
    cin=None,  # None = auto-generate unique CIN; pass a string to use it directly
    email="",
    phone="+212600000000",
    address="123 Main St",
    city="Casablanca",
    province="Casablanca",
    region="Casablanca-Settat",
    date_of_birth=None,
    nationality="Moroccan",
    notes="",
    observations="",
    company=None,
    user=None,
):
    """Create a test personnel person."""
    import uuid

    if date_of_birth is None:
        date_of_birth = date(1990, 1, 15)

    # Generate a unique CIN only when cin=None (not provided)
    if cin is None:
        cin_suffix = uuid.uuid4().hex[:6].upper()
        cin = f"AB{cin_suffix}"
    elif cin == "":
        cin = None  # Explicitly no CIN -> store as NULL to avoid unique constraint

    # Generate unique email based on name if not provided
    if not email:
        uid = uuid.uuid4().hex[:6]
        email = f"{first_name.lower()}.{last_name.lower()}.{uid}@example.com"

    return PersonnelPerson.objects.create(
        first_name=first_name,
        last_name=last_name,
        middle_name=middle_name,
        cin=cin,
        email=email,
        phone=phone,
        address=address,
        city=city,
        province=province,
        region=region,
        date_of_birth=date_of_birth,
        nationality=nationality,
        notes=notes,
        observations=observations,
        company=company,
        created_by=user,
        updated_by=user,
    )


def create_test_employment(
    person=None,
    company=None,
    job_title="Developer",
    department="IT",
    hire_date=None,
    employment_end_date=None,
    user=None,
):
    """Create a test employment."""
    if person is None:
        person = create_test_person(user=user)
    if company is None:
        company = create_test_company(user=user)
    if hire_date is None:
        hire_date = date.today() - timedelta(days=365)

    employment = Employment.objects.create(
        person=person,
        company=company,
        job_title=job_title,
        department=department,
        hire_date=hire_date,
        employment_end_date=employment_end_date,
        employment_status="active",
        contract_type="permanent",
        default_monthly_working_days=26,
        default_cnss_declared_days=26,
        created_by=user,
        updated_by=user,
    )
    if person.company_id is None and company is not None:
        person.company = company
        person.save(update_fields=["company"])
    return employment


def create_test_salary(
    employment=None,
    amount=Decimal("50000.0000"),
    effective_from=None,
    effective_to=None,
    is_current=True,
    reason="Initial salary",
    user=None,
):
    """Create a test salary."""
    if employment is None:
        employment = create_test_employment(user=user)
    if effective_from is None:
        # Use a fixed date that works for tests (Jan 1, 2024)
        effective_from = date(2024, 1, 1)

    # If creating a current salary, deactivate the previous current salary
    if is_current:
        current = EmploymentSalary.objects.filter(employment=employment, is_current=True).first()
        if current:
            current.is_current = False
            if not current.effective_to:
                current.effective_to = effective_from - timedelta(days=1)
            current.save(update_fields=["is_current", "effective_to", "updated_at"])

    return EmploymentSalary.objects.create(
        employment=employment,
        fixed_monthly_gross_salary=amount,
        effective_from=effective_from,
        effective_to=effective_to,
        is_current=is_current,
        reason=reason,
        created_by=user,
        updated_by=user,
    )


def create_test_payroll(
    employment=None,
    year=None,
    month=None,
    status="draft",
    user=None,
):
    """Create a test monthly payroll record."""
    if employment is None:
        employment = create_test_employment(user=user)
    if year is None:
        year = date.today().year
    if month is None:
        month = date.today().month

    salary = create_test_salary(employment=employment, user=user)

    period_start = date(year, month, 1)
    if month == 12:
        period_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        period_end = date(year, month + 1, 1) - timedelta(days=1)

    return MonthlyPayrollRecord.objects.create(
        employment=employment,
        year=year,
        month=month,
        period_start=period_start,
        period_end=period_end,
        scheduled_working_days=26,
        worked_days=26,
        gross_salary_snapshot=salary.fixed_monthly_gross_salary,
        status=status,
        created_by=user,
        updated_by=user,
    )


def create_test_adjustment(
    payroll=None,
    adjustment_type="supplement",
    direction="addition",
    amount=Decimal("1000.0000"),
    user=None,
):
    """Create a test payroll adjustment."""
    if payroll is None:
        payroll = create_test_payroll(user=user)

    return PayrollAdjustment.objects.create(
        payroll_record=payroll,
        adjustment_type=adjustment_type,
        direction=direction,
        amount=amount,
        description=f"Test {adjustment_type}",
        effective_date=payroll.period_start,
        created_by=user,
        updated_by=user,
    )


def create_test_payment(
    payroll=None,
    amount=Decimal("10000.0000"),
    payment_kind="partial_payment",
    user=None,
):
    """Create a test payroll payment."""
    if payroll is None:
        payroll = create_test_payroll(user=user)

    return PayrollPayment.objects.create(
        payroll_record=payroll,
        payment_date=payroll.period_start,
        amount=amount,
        payment_kind=payment_kind,
        created_by=user,
        updated_by=user,
    )


def create_test_cnss_declaration(
    person=None,
    company=None,
    employment=None,
    is_currently_declared=True,
    situation="declared_by_this_company",
    user=None,
):
    """Create a test CNSS declaration."""
    if person is None:
        person = create_test_person(user=user)
    if company is None:
        company = create_test_company(user=user)

    return CNSSDeclaration.objects.create(
        person=person,
        company=company,
        employment=employment,
        cnss_registration_number="12345678",
        situation=situation,
        is_currently_declared=is_currently_declared,
        declaration_start_date=date.today(),
        created_by=user,
        updated_by=user,
    )


def create_test_cnss_monthly(
    cnss_declaration=None,
    year=None,
    month=None,
    declared_days=26,
    declared_salary=Decimal("50000.0000"),
    situation="active",
    status="draft",
    user=None,
):
    """Create a test monthly CNSS declaration."""
    if cnss_declaration is None:
        cnss_declaration = create_test_cnss_declaration(user=user)
    if year is None:
        year = date.today().year
    if month is None:
        month = date.today().month

    return CNSSMonthlyDeclaration.objects.create(
        cnss_declaration=cnss_declaration,
        year=year,
        month=month,
        declared_days=declared_days,
        declared_salary=declared_salary,
        situation=situation,
        status=status,
        created_by=user,
        updated_by=user,
    )
