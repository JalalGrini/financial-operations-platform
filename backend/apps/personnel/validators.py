# apps/personnel/validators.py
"""
Personnel Validators.

Validators encapsulate reusable validation rules for personnel operations.
"""
import re
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from apps.personnel.models import (
    ContractType,
    EmploymentStatus,
)


class PersonnelValidator:
    """
    Validators for personnel operations.

    Centralizes validation logic for personnel operations
    to ensure consistency across the application.
    """

    # Valid email regex pattern
    EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

    # Valid phone regex (flexible for international formats)
    PHONE_REGEX = re.compile(
        r"^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{4,6}$"
    )

    # CIN regex for Moroccan CIN (8 digits or 1-2 letters + 6 digits)
    CIN_REGEX = re.compile(r"^([A-Z]{1,2})?[0-9]{6}$")

    # Valid name regex (supports French, Arabic characters, spaces, hyphens, apostrophes)
    NAME_REGEX = re.compile(r"^[\w\s\-']+$", re.UNICODE)

    def validate_first_name(self, value: str) -> str:
        """
        Validate first name.

        Args:
            value: First name to validate

        Returns:
            Normalized first name

        Raises:
            ValidationError: If first name is invalid
        """
        if not value:
            raise ValidationError(_("First name is required."))

        value = value.strip()

        if len(value) < 1:
            raise ValidationError(_("First name is too short."))

        if len(value) > 100:
            raise ValidationError(_("First name is too long."))

        # Check for valid characters (allow letters, spaces, hyphens, apostrophes)
        if not re.match(r"^[\w\s\-']+$", value, re.UNICODE):
            raise ValidationError(_("First name contains invalid characters."))

        return value.capitalize()

    def validate_last_name(self, value: str) -> str:
        """
        Validate last name.

        Args:
            value: Last name to validate

        Returns:
            Normalized last name

        Raises:
            ValidationError: If last name is invalid
        """
        if not value:
            raise ValidationError(_("Last name is required."))

        value = value.strip()

        if len(value) < 1:
            raise ValidationError(_("Last name is too short."))

        if len(value) > 100:
            raise ValidationError(_("Last name is too long."))

        if not re.match(r"^[\w\s\-']+$", value, re.UNICODE):
            raise ValidationError(_("Last name contains invalid characters."))

        return value.upper()

    def validate_middle_name(self, value: str) -> str:
        """
        Validate middle name (optional).

        Args:
            value: Middle name to validate

        Returns:
            Normalized middle name
        """
        if not value:
            return ""

        value = value.strip()

        if len(value) > 100:
            raise ValidationError(_("Middle name is too long."))

        if not re.match(r"^[\w\s\-']+$", value, re.UNICODE):
            raise ValidationError(_("Middle name contains invalid characters."))

        return value.capitalize()

    def validate_cin(self, value: str) -> str:
        """
        Validate CIN (optional but validated if provided).

        Args:
            value: CIN to validate

        Returns:
            Normalized CIN

        Raises:
            ValidationError: If CIN format is invalid
        """
        if not value:
            return ""

        value = value.strip().upper()

        # Moroccan CIN: 1-2 letters followed by 6 digits, or just 8 digits
        if not self.CIN_REGEX.match(value):
            raise ValidationError(
                _("Invalid CIN format. Use format: 1-2 letters + 6 digits or 8 digits.")
            )

        return value

    def validate_phone(self, value: str) -> str:
        """
        Validate phone number (optional).

        Args:
            value: Phone number to validate

        Returns:
            Normalized phone number

        Raises:
            ValidationError: If phone format is invalid
        """
        if not value:
            return ""

        value = value.strip()

        # Basic validation - at least 8 digits
        digits = re.sub(r"[^\d]", "", value)
        if len(digits) < 8:
            raise ValidationError(_("Phone number must have at least 8 digits."))

        if len(digits) > 15:
            raise ValidationError(_("Phone number is too long."))

        return value

    def validate_email(self, value: str) -> str:
        """
        Validate email address (optional).

        Args:
            value: Email to validate

        Returns:
            Normalized email

        Raises:
            ValidationError: If email format is invalid
        """
        if not value:
            return ""

        value = value.strip().lower()

        try:
            validate_email(value)
        except ValidationError:
            raise ValidationError(_("Enter a valid email address.")) from None

        if len(value) > 254:
            raise ValidationError(_("Email address is too long."))

        return value

    def validate_phone_number(self, value: str) -> str:
        """Alias for validate_phone."""
        return self.validate_phone(value)

    def validate_email_address(self, value: str) -> str:
        """Alias for validate_email."""
        return self.validate_email(value)

    def validate_personnel_person(self, data: dict) -> dict:
        """
        Validate complete personnel person data.

        Args:
            data: Dictionary with personnel data

        Returns:
            Validated and normalized data

        Raises:
            ValidationError: If validation fails
        """
        validated = {}

        # Required fields
        validated["first_name"] = self.validate_first_name(data.get("first_name", ""))
        validated["last_name"] = self.validate_last_name(data.get("last_name", ""))

        # Optional fields
        if "middle_name" in data:
            validated["middle_name"] = self.validate_middle_name(data.get("middle_name", ""))

        if "cin" in data:
            validated["cin"] = self.validate_cin(data.get("cin", ""))

        if "phone" in data:
            validated["phone"] = self.validate_phone(data.get("phone", ""))

        if "email" in data:
            validated["email"] = self.validate_email(data.get("email", ""))

        # Pass through other fields
        optional_fields = [
            "middle_name",
            "address",
            "city",
            "province",
            "region",
            "date_of_birth",
            "nationality",
            "notes",
            "observations",
            "status",
        ]
        for field in optional_fields:
            if field in data:
                validated[field] = data[field]

        return validated


class EmploymentValidator:
    """Authoritative Employment date and interval validation."""

    FIXED_DURATION_CONTRACT_TYPES = {
        ContractType.FIXED_TERM,
        ContractType.TEMPORARY,
        ContractType.INTERNSHIP,
        ContractType.APPRENTICESHIP,
        ContractType.SEASONAL,
    }

    def validate_hire_date(self, hire_date, employment_end_date=None) -> date:
        """Validate a real date range without rejecting planned contracts."""
        if not hire_date:
            return None
        if hire_date < date(1900, 1, 1):
            raise ValidationError({"hire_date": _("Hire date is too far in the past.")})
        if employment_end_date and employment_end_date <= hire_date:
            raise ValidationError(
                {"employment_end_date": _("Employment end date must be after hire date.")}
            )
        return hire_date

    def validate_employment_dates(
        self, hire_date, employment_end_date=None, contract_type=""
    ) -> tuple:
        """Validate interval ordering and fixed-duration end-date policy.

        Future end dates are valid and expected for CDD/temporary contracts.
        Future hire dates are also accepted so planned contracts can be entered.
        """
        validated_hire = self.validate_hire_date(hire_date, employment_end_date)
        if contract_type in self.FIXED_DURATION_CONTRACT_TYPES and not employment_end_date:
            raise ValidationError(
                {"employment_end_date": _("End date is required for fixed-duration contracts.")}
            )
        return validated_hire, employment_end_date

    def validate_employment_overlap(
        self,
        person_id,
        company_id,
        hire_date,
        end_date=None,
        exclude_id=None,
    ) -> None:
        """Reject an intersecting interval for the same person and company.

        Intervals use an open-ended NULL end date. Archived rows are excluded;
        historical non-archived rows remain relevant even when ``is_active`` is
        false. A different company is intentionally allowed.
        """
        if not person_id or not company_id or not hire_date:
            return

        from apps.personnel.models import Employment

        overlapping = Employment.all_objects.filter(
            person_id=person_id,
            company_id=company_id,
            is_archived=False,
        ).filter(Q(employment_end_date__isnull=True) | Q(employment_end_date__gte=hire_date))
        if end_date:
            overlapping = overlapping.filter(Q(hire_date__isnull=True) | Q(hire_date__lte=end_date))
        if exclude_id:
            overlapping = overlapping.exclude(pk=exclude_id)

        if overlapping.exists():
            raise ValidationError(
                _("Person already has an employment at this company with " "overlapping dates.")
            )

    def validate_employment_data(self, data: dict, *, require_relations: bool = False) -> dict:
        """Validate service-layer input without breaking partial updates."""
        if require_relations and not data.get("person"):
            raise ValidationError({"person": _("Person is required.")})
        if require_relations and not data.get("company"):
            raise ValidationError({"company": _("Company is required.")})

        allowed_fields = {
            "person",
            "company",
            "employee_reference",
            "job_title",
            "department",
            "work_domain",
            "work_city",
            "employment_status",
            "contract_type",
            "hire_date",
            "employment_end_date",
            "departure_reason",
            "resignation_date",
            "is_active",
            "payment_method",
            "rib",
            "bank_name",
            "bank_account_holder",
            "default_monthly_working_days",
            "default_cnss_declared_days",
            "observations",
        }
        validated = {key: value for key, value in data.items() if key in allowed_fields}

        if "employment_status" in validated:
            status_value = validated["employment_status"]
            if status_value not in [choice.value for choice in EmploymentStatus]:
                raise ValidationError({"employment_status": _("Invalid employment status.")})

        if validated.get("contract_type"):
            contract_value = validated["contract_type"]
            if contract_value not in [choice.value for choice in ContractType]:
                raise ValidationError({"contract_type": _("Invalid contract type.")})

        if "hire_date" in validated or "employment_end_date" in validated:
            self.validate_employment_dates(
                validated.get("hire_date"),
                validated.get("employment_end_date"),
                validated.get("contract_type", ""),
            )
        return validated


class EmploymentSalaryValidator:
    """Validators for EmploymentSalary operations."""

    def validate_salary_amount(self, amount: Decimal) -> Decimal:
        """
        Validate salary amount.

        Args:
            amount: Salary amount

        Returns:
            Validated amount

        Raises:
            ValidationError: If amount is invalid
        """
        if amount is None:
            return Decimal("0")

        if amount < 0:
            raise ValidationError(_("Salary cannot be negative."))

        if amount > Decimal("999999999.9999"):
            raise ValidationError(_("Salary amount is too large."))

        # Ensure proper decimal places
        return amount.quantize(Decimal("0.0001"))

    def validate_salary_period(self, effective_from: date, effective_to=None) -> tuple:
        """
        Validate salary period.

        Args:
            effective_from: Start date
            effective_to: Optional end date

        Returns:
            Tuple of (effective_from, effective_to)

        Raises:
            ValidationError: If dates are invalid
        """
        if not effective_from:
            raise ValidationError(_("Effective from date is required."))

        if effective_from > date.today():
            raise ValidationError(_("Effective from date cannot be in the future."))

        if effective_to and effective_to <= effective_from:
            raise ValidationError(_("End date must be after start date."))

        return (effective_from, effective_to)

    def validate_salary_data(self, data: dict) -> dict:
        """Validate salary data."""
        validated = {}

        if "employment" not in data:
            raise ValidationError(_("Employment is required."))
        validated["employment"] = data["employment"]

        if "fixed_monthly_gross_salary" in data:
            validated["fixed_monthly_gross_salary"] = self.validate_salary_amount(
                data["fixed_monthly_gross_salary"]
            )

        if "effective_from" in data:
            validated["effective_from"] = data["effective_from"]

        if "effective_to" in data:
            validated["effective_to"] = data["effective_to"]
            self.validate_salary_period(
                validated.get("effective_from", data.get("effective_from")),
                validated["effective_to"],
            )

        if "reason" in data:
            validated["reason"] = data["reason"]

        if "notes" in data:
            validated["notes"] = data["notes"]

        if "is_current" in data:
            validated["is_current"] = data["is_current"]

        return validated


class MonthlyPayrollValidator:
    """Validators for MonthlyPayrollRecord operations."""

    def validate_period(self, year: int, month: int) -> tuple:
        """
        Validate payroll period.

        Args:
            year: Year
            month: Month

        Returns:
            Tuple of (year, month)

        Raises:
            ValidationError: If period is invalid
        """
        if not year or year < 1900 or year > 2100:
            raise ValidationError(_("Invalid year."))

        if not month or month < 1 or month > 12:
            raise ValidationError(_("Month must be between 1 and 12."))

        return (year, month)

    def validate_working_days(
        self,
        scheduled: int,
        worked: int = 0,
        absence: int = 0,
        authorized: int = 0,
        unpaid: int = 0,
        declared: int = 0,
    ) -> dict:
        """
        Validate attendance days.

        Args:
            Various day counts

        Returns:
            Validated day counts

        Raises:
            ValidationError: If counts are invalid
        """
        validated = {}

        # Scheduled days
        if scheduled is not None:
            if scheduled < 0 or scheduled > 31:
                raise ValidationError(_("Scheduled days must be between 0 and 31."))
            validated["scheduled_working_days"] = scheduled

        # Other days
        for field, value in [
            ("worked_days", worked),
            ("absence_days", absence),
            ("authorized_leave_days", authorized),
            ("unpaid_leave_days", unpaid),
            ("declared_days", declared),
        ]:
            if value is not None:
                if value < 0 or value > 31:
                    raise ValidationError(f"{field} must be between 0 and 31.")
                validated[field] = value

        # Consistency checks
        total_specific = sum(v for k, v in validated.items() if k != "scheduled_working_days")
        if "scheduled_working_days" in validated:
            if total_specific > validated["scheduled_working_days"]:
                # This is a warning, not an error - could be overtime
                pass

        return validated

    def validate_salary_snapshot(self, gross_salary: Decimal) -> Decimal:
        """Validate gross salary snapshot."""
        if gross_salary is None:
            return Decimal("0")
        if gross_salary < 0:
            raise ValidationError(_("Gross salary cannot be negative."))
        return gross_salary.quantize(Decimal("0.0001"))

    def validate_monetary_amount(self, amount: Decimal, field_name: str) -> Decimal:
        """Validate monetary amount."""
        if amount is None:
            return Decimal("0")
        if amount < 0:
            raise ValidationError(f"{field_name} cannot be negative.")
        return amount.quantize(Decimal("0.0001"))

    def validate_payroll_data(self, data: dict) -> dict:
        """Validate complete payroll data."""
        validated = {}

        # Required
        if "employment" not in data:
            raise ValidationError(_("Employment is required."))
        validated["employment"] = data["employment"]

        # Period
        if "year" in data and "month" in data:
            year, month = self.validate_period(data["year"], data["month"])
            validated["year"] = year
            validated["month"] = month

        # Days
        day_fields = [
            "scheduled_working_days",
            "worked_days",
            "absence_days",
            "authorized_leave_days",
            "unpaid_leave_days",
            "declared_days",
        ]
        day_data = {f: data.get(f) for f in day_fields if f in data}
        if day_data:
            validated.update(self.validate_working_days(**day_data))

        # Salary snapshot
        if "gross_salary_snapshot" in data:
            validated["gross_salary_snapshot"] = self.validate_salary_snapshot(
                data["gross_salary_snapshot"]
            )

        # Monetary fields
        monetary_fields = [
            "daily_rate",
            "absence_deduction",
            "supplements_total",
            "other_deductions_total",
            "calculated_net_salary",
            "total_paid",
            "remaining_amount",
        ]
        for field in monetary_fields:
            if field in data:
                validated[field] = self.validate_monetary_amount(data[field], field)

        # Status
        if "status" in data:
            if data["status"] not in ["draft", "calculated", "approved", "paid", "cancelled"]:
                raise ValidationError(_("Invalid payroll status."))
            validated["status"] = data["status"]

        # Notes
        if "notes" in data:
            validated["notes"] = data["notes"]
        if "observations" in data:
            validated["observations"] = data["observations"]

        return validated


class CNSSValidator:
    """Validators for CNSS operations."""

    def validate_cnss_number(self, number: str) -> str:
        """
        Validate CNSS registration number.

        Args:
            number: CNSS registration number

        Returns:
            Normalized number

        Raises:
            ValidationError: If format is invalid
        """
        if not number:
            return ""

        number = number.strip().upper()

        # CNSS number format: typically 8-10 digits, may have prefix
        if not re.match(r"^[A-Z0-9]{5,15}$", number):
            raise ValidationError(_("Invalid CNSS registration number format."))

        return number

    def validate_cin(self, cin: str) -> str:
        """Validate CIN for CNSS."""
        if not cin:
            return ""
        cin = cin.strip().upper()
        if not re.match(r"^([A-Z]{1,2})?[0-9]{6}$", cin):
            raise ValidationError(_("Invalid CIN format."))
        return cin

    def validate_declared_days(self, days: int) -> int:
        """Validate declared days for CNSS."""
        if days is None:
            return 0
        if days < 0 or days > 31:
            raise ValidationError(_("Declared days must be between 0 and 31."))
        return days

    def validate_declared_salary(self, salary: Decimal) -> Decimal:
        """Validate declared salary for CNSS."""
        if salary is None:
            return Decimal("0")
        if salary < 0:
            raise ValidationError(_("Declared salary cannot be negative."))
        return salary.quantize(Decimal("0.0001"))

    def validate_month(self, month: int) -> int:
        """Validate month."""
        if month < 1 or month > 12:
            raise ValidationError(_("Month must be between 1 and 12."))
        return month

    def validate_year(self, year: int) -> int:
        """Validate year."""
        if year < 1900 or year > 2100:
            raise ValidationError(_("Invalid year."))
        return year

    def validate_cnss_declaration_data(self, data: dict) -> dict:
        """Validate CNSS declaration data."""
        validated = {}

        if "person" not in data:
            raise ValidationError(_("Person is required."))
        validated["person"] = data["person"]

        if "company" not in data:
            raise ValidationError(_("Company is required."))
        validated["company"] = data["company"]

        if "employment" in data:
            validated["employment"] = data["employment"]

        if "cnss_registration_number" in data:
            validated["cnss_registration_number"] = self.validate_cnss_number(
                data["cnss_registration_number"]
            )

        if "cin_snapshot" in data:
            validated["cin_snapshot"] = self.validate_cin(data["cin_snapshot"])

        if "situation" in data:
            if data["situation"] not in [
                "declared_by_this_company",
                "declared_by_another_employer",
                "personally_insured",
                "not_declared",
                "pending_registration",
                "declaration_suspended",
                "declaration_stopped",
                "exempt",
                "unknown",
                "other",
            ]:
                raise ValidationError(_("Invalid CNSS situation."))
            validated["situation"] = data["situation"]

        if "is_currently_declared" in data:
            validated["is_currently_declared"] = data["is_currently_declared"]

        # Date fields
        date_fields = [
            "first_declaration_date",
            "declaration_start_date",
            "declaration_end_date",
            "declaration_stop_date",
            "resignation_date",
        ]
        for field in date_fields:
            if field in data and data[field]:
                validated[field] = data[field]

        if "stop_reason" in data:
            if data["stop_reason"] not in [
                "resignation",
                "termination",
                "retirement",
                "death",
                "company_closure",
                "contract_end",
                "mutual_agreement",
                "suspension",
                "other",
            ]:
                raise ValidationError(_("Invalid stop reason."))
            validated["stop_reason"] = data["stop_reason"]

        if "notes" in data:
            validated["notes"] = data["notes"]
        if "observations" in data:
            validated["observations"] = data["observations"]

        return validated

    def validate_monthly_declaration_data(self, data: dict) -> dict:
        """Validate monthly CNSS declaration data."""
        validated = {}

        if "cnss_declaration" not in data:
            raise ValidationError(_("CNSS declaration is required."))
        validated["cnss_declaration"] = data["cnss_declaration"]

        validated["year"] = self.validate_year(data.get("year"))
        validated["month"] = self.validate_month(data.get("month"))

        validated["declared_days"] = self.validate_declared_days(data.get("declared_days"))

        if "declared_salary" in data:
            validated["declared_salary"] = self.validate_declared_salary(data["declared_salary"])

        if "situation" in data:
            if data["situation"] not in [
                "entrant",
                "sortant",
                "active",
                "suspended",
                "correction",
                "other",
            ]:
                raise ValidationError(_("Invalid monthly situation."))
            validated["situation"] = data["situation"]

        if "status" in data:
            if data["status"] not in ["draft", "submitted", "accepted", "rejected", "corrected"]:
                raise ValidationError(_("Invalid monthly declaration status."))
            validated["status"] = data["status"]

        if "submission_date" in data:
            validated["submission_date"] = data["submission_date"]

        if "reference" in data:
            validated["reference"] = data["reference"]

        if "notes" in data:
            validated["notes"] = data["notes"]
        if "observations" in data:
            validated["observations"] = data["observations"]

        return validated


class PayrollPaymentValidator:
    """Validators for PayrollPayment operations."""

    def validate_payment_amount(self, amount) -> Decimal:
        """Validate payment amount."""
        from decimal import Decimal

        if amount is None:
            raise ValidationError(_("Payment amount is required."))
        if isinstance(amount, int):
            amount = Decimal(str(amount))
        elif not isinstance(amount, Decimal):
            amount = Decimal(str(amount))
        if amount <= 0:
            raise ValidationError(_("Payment amount must be positive."))
        return amount.quantize(Decimal("0.0001"))

    def validate_payment_date(self, payment_date: date) -> date:
        """Validate payment date."""
        if not payment_date:
            raise ValidationError(_("Payment date is required."))
        if payment_date > date.today():
            raise ValidationError(_("Payment date cannot be in the future."))
        return payment_date

    def validate_payment_kind(self, kind: str) -> str:
        """Validate payment kind."""
        if kind not in [
            "advance",
            "partial_payment",
            "final_payment",
            "adjustment_payment",
            "other",
        ]:
            raise ValidationError(_("Invalid payment kind."))
        return kind

    def validate_payment_data(self, data: dict) -> dict:
        """Validate payment data."""
        validated = {}

        if "payroll_record" not in data:
            raise ValidationError(_("Payroll record is required."))
        validated["payroll_record"] = data["payroll_record"]

        validated["payment_date"] = self.validate_payment_date(data.get("payment_date"))

        validated["amount"] = self.validate_payment_amount(data.get("amount"))

        if "payment_method" in data:
            validated["payment_method"] = data["payment_method"]

        validated["payment_kind"] = self.validate_payment_kind(
            data.get("payment_kind", "partial_payment")
        )

        if "reference" in data:
            validated["reference"] = data["reference"]

        if "notes" in data:
            validated["notes"] = data["notes"]
        if "observations" in data:
            validated["observations"] = data["observations"]

        return validated


class PayrollAdjustmentValidator:
    """Validators for PayrollAdjustment operations."""

    def validate_adjustment_amount(self, amount: Decimal) -> Decimal:
        """Validate adjustment amount."""
        from decimal import Decimal as _Decimal

        if amount is None:
            raise ValidationError(_("Adjustment amount is required."))
        if isinstance(amount, int):
            amount = _Decimal(str(amount))
        elif not isinstance(amount, _Decimal):
            amount = _Decimal(str(amount))
        if amount <= 0:
            raise ValidationError(_("Adjustment amount must be positive."))
        return amount.quantize(_Decimal("0.0001"))

    def validate_adjustment_type(self, adj_type: str) -> str:
        """Validate adjustment type."""
        if adj_type not in [
            "supplement",
            "bonus",
            "deduction",
            "penalty",
            "advance_recovery",
            "correction",
            "other",
        ]:
            raise ValidationError(_("Invalid adjustment type."))
        return adj_type

    def validate_direction(self, direction: str) -> str:
        """Validate direction."""
        if direction not in ["addition", "deduction"]:
            raise ValidationError(_("Invalid direction."))
        return direction

    def validate_adjustment_data(self, data: dict) -> dict:
        """Validate adjustment data."""
        validated = {}

        if "payroll_record" not in data:
            raise ValidationError(_("Payroll record is required."))
        validated["payroll_record"] = data["payroll_record"]

        validated["adjustment_type"] = self.validate_adjustment_type(data.get("adjustment_type"))
        validated["direction"] = self.validate_direction(data.get("direction"))
        validated["amount"] = self.validate_adjustment_amount(data.get("amount"))

        if "description" in data:
            validated["description"] = data["description"]

        if "effective_date" in data:
            if not data["effective_date"]:
                raise ValidationError(_("Effective date is required."))
            validated["effective_date"] = data["effective_date"]

        if "reference" in data:
            validated["reference"] = data["reference"]
        if "notes" in data:
            validated["notes"] = data["notes"]

        return validated


class PersonnelDocumentValidator:
    """Validators for PersonnelDocumentReference operations."""

    def validate_document_type(self, doc_type: str) -> str:
        """Validate document type."""
        if doc_type not in ["cin", "cnss_document", "employment_contract", "rib_document", "other"]:
            raise ValidationError(_("Invalid document type."))
        return doc_type

    def validate_document_data(self, data: dict) -> dict:
        """Validate document data."""
        validated = {}

        if "person" not in data:
            raise ValidationError(_("Person is required."))
        validated["person"] = data["person"]

        if "document_type" in data:
            validated["document_type"] = self.validate_document_type(data["document_type"])

        if "employment" in data:
            validated["employment"] = data["employment"]

        if "cnss_declaration" in data:
            validated["cnss_declaration"] = data["cnss_declaration"]

        if "external_reference" in data:
            validated["external_reference"] = data["external_reference"]

        if "issue_date" in data:
            validated["issue_date"] = data["issue_date"]

        if "expiry_date" in data:
            validated["expiry_date"] = data["expiry_date"]
            if validated.get("issue_date") and validated["expiry_date"] <= validated["issue_date"]:
                raise ValidationError(_("Expiry date must be after issue date."))

        if "notes" in data:
            validated["notes"] = data["notes"]

        return validated
