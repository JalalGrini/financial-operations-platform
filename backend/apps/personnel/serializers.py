# apps/personnel/serializers.py
"""
Personnel Serializers.

Serializers for Personnel domain API endpoints.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.common.security import PHOTO_ALLOWED_EXTENSIONS, validate_private_upload
from apps.companies.models import Company
from apps.configuration.models import PaymentMethod
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


class EmptyStringToNullMixin:
    """Convert empty-string values to None for a declared set of nullable fields.

    Frontend forms submit empty strings ("") for optional date / FK / unique
    fields. DRF passes these through to the DB, where empty strings behave
    differently from NULL (e.g. unique-constrained columns reject a second ""
    instead of allowing many NULLs, and nullable DateFields reject "").
    """

    empty_to_null_fields = ()

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            for field in self.empty_to_null_fields:
                if field in data and data[field] == "":
                    data[field] = None
        return super().to_internal_value(data)


class PersonnelPersonSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for PersonnelPerson list view."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    completeness_percentage = serializers.SerializerMethodField()
    active_employments_count = serializers.SerializerMethodField()
    has_active_cnss = serializers.SerializerMethodField()

    empty_to_null_fields = ("cin", "date_of_birth")

    class Meta:
        model = PersonnelPerson
        fields = [
            "is_archived",
            "id",
            "reference",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "cin",
            "phone",
            "email",
            "address",
            "city",
            "province",
            "region",
            "date_of_birth",
            "nationality",
            "status",
            "photo",
            "completeness_percentage",
            "active_employments_count",
            "has_active_cnss",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "completeness_percentage",
            "active_employments_count",
            "has_active_cnss",
        ]

    def validate_photo(self, upload):
        if not upload:
            return upload
        return validate_private_upload(
            upload, max_bytes=5 * 1024 * 1024, allowed=PHOTO_ALLOWED_EXTENSIONS
        )

    def get_completeness_percentage(self, obj):
        return obj.get_completeness_percentage()

    def get_active_employments_count(self, obj):
        # PersonnelPersonViewSet.get_queryset() annotates this so the list
        # endpoint does not run a .count() query per row (Cycle 23, N-1).
        # Fall back to the model helper for instances built outside that
        # queryset (e.g. serializer used directly in a test or script).
        annotated = getattr(obj, "active_employments_count_annotated", None)
        if annotated is not None:
            return annotated
        return obj.get_active_employments().count()

    def get_has_active_cnss(self, obj):
        # Same annotation-with-fallback pattern as get_active_employments_count.
        annotated = getattr(obj, "has_active_cnss_annotated", None)
        if annotated is not None:
            return bool(annotated)
        return obj.has_active_cnss_declaration()


class PersonnelPersonDetailSerializer(PersonnelPersonSerializer):
    """Detailed serializer for PersonnelPerson with related data."""

    employments = serializers.SerializerMethodField()
    cnss_declarations = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    missing_important_fields = serializers.SerializerMethodField()

    class Meta(PersonnelPersonSerializer.Meta):
        fields = PersonnelPersonSerializer.Meta.fields + [
            "employments",
            "cnss_declarations",
            "documents",
            "missing_important_fields",
            "notes",
            "observations",
        ]

    def get_employments(self, obj):
        employments = obj.employments.filter(is_archived=False).select_related("company")
        return EmploymentSerializer(employments, many=True).data

    def get_cnss_declarations(self, obj):
        cnss = obj.cnss_declarations.filter(is_archived=False).select_related("company")
        return CNSSDeclarationListSerializer(cnss, many=True).data

    def get_documents(self, obj):
        docs = obj.documents.filter(is_archived=False)
        return PersonnelDocumentReferenceSerializer(docs, many=True).data

    def get_missing_important_fields(self, obj):
        return obj.get_missing_important_fields()


class PersonnelPersonCreateSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for creating PersonnelPerson."""

    empty_to_null_fields = ("cin", "date_of_birth")

    class Meta:
        model = PersonnelPerson
        fields = [
            "id",
            "first_name",
            "last_name",
            "middle_name",
            "cin",
            "phone",
            "email",
            "address",
            "city",
            "province",
            "region",
            "date_of_birth",
            "nationality",
            "notes",
            "observations",
            "status",
            "photo",
        ]
        read_only_fields = ["id"]

    def validate_photo(self, upload):
        if not upload:
            return upload
        return validate_private_upload(
            upload, max_bytes=5 * 1024 * 1024, allowed=PHOTO_ALLOWED_EXTENSIONS
        )

    def validate_cin(self, value):
        return self._normalize_unique(value)

    def _normalize_unique(self, value):
        if value:
            # Check ALL records including archived ones: the database unique
            # constraint on cin applies to archived rows too, so checking only
            # the active manager lets an archived duplicate through and the DB
            # then raises a raw IntegrityError (500). Cycle 32 fix.
            if PersonnelPerson.all_objects.filter(cin__iexact=value).exists():
                raise serializers.ValidationError(
                    _(
                        "A person with this CIN already exists (possibly on an archived record — restore it from 'Show Archived' instead)."
                    )
                )
        return value

    def validate_email(self, value):
        if value and PersonnelPerson.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(_("A person with this email already exists."))
        return value


class EmploymentSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for Employment list view."""

    person_name = serializers.CharField(source="person.get_full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    current_salary = serializers.SerializerMethodField()
    is_multi_company = serializers.SerializerMethodField()

    empty_to_null_fields = (
        "employment_end_date",
        "resignation_date",
        "payment_method",
    )

    class Meta:
        model = Employment
        fields = [
            "is_archived",
            "id",
            "reference",
            "person",
            "person_name",
            "company",
            "company_name",
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
            "worked_day_rate",
            "absence_day_rate",
            "observations",
            "current_salary",
            "is_multi_company",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "current_salary",
            "is_multi_company",
        ]

    def get_current_salary(self, obj):
        salary = obj.get_current_salary()
        if salary:
            return EmploymentSalarySerializer(salary).data
        return None

    def get_is_multi_company(self, obj):
        return (
            obj.person.employments.filter(is_active=True, is_archived=False)
            .values("company")
            .distinct()
            .count()
            > 1
        )


class EmploymentDetailSerializer(EmploymentSerializer):
    """Detailed serializer for Employment with related data."""

    salaries = serializers.SerializerMethodField()
    payroll_records = serializers.SerializerMethodField()
    cnss_declarations = serializers.SerializerMethodField()
    current_salary_detail = serializers.SerializerMethodField()

    class Meta(EmploymentSerializer.Meta):
        fields = EmploymentSerializer.Meta.fields + [
            "salaries",
            "payroll_records",
            "cnss_declarations",
            "current_salary_detail",
        ]

    def get_salaries(self, obj):
        salaries = obj.salaries.filter(is_archived=False).order_by("-effective_from")
        return EmploymentSalarySerializer(salaries, many=True).data

    def get_payroll_records(self, obj):
        records = obj.payroll_records.filter(is_archived=False).order_by("-year", "-month")
        return MonthlyPayrollRecordListSerializer(records, many=True).data

    def get_cnss_declarations(self, obj):
        cnss = obj.cnss_declarations.filter(is_archived=False)
        return CNSSDeclarationListSerializer(cnss, many=True).data

    def get_current_salary_detail(self, obj):
        salary = obj.get_current_salary()
        if salary:
            return EmploymentSalarySerializer(salary).data
        return None


class EmploymentCreateSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Authoritative create/update contract used by the browser form."""

    person = serializers.PrimaryKeyRelatedField(
        queryset=PersonnelPerson.objects.filter(status="active", is_archived=False)
    )
    company = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.filter(status="active", is_archived=False)
    )
    payment_method = serializers.PrimaryKeyRelatedField(
        queryset=PaymentMethod.objects.filter(status="active", is_archived=False),
        required=False,
        allow_null=True,
    )

    empty_to_null_fields = (
        "employment_end_date",
        "resignation_date",
        "payment_method",
    )

    class Meta:
        model = Employment
        fields = [
            "id",
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
            "payment_method",
            "rib",
            "bank_name",
            "bank_account_holder",
            "default_monthly_working_days",
            "default_cnss_declared_days",
            "worked_day_rate",
            "absence_day_rate",
            "observations",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {
            "employee_reference": {"required": True, "allow_blank": False},
            "contract_type": {"required": True, "allow_blank": False},
            "hire_date": {"required": True, "allow_null": False},
            "employment_status": {"required": True, "allow_blank": False},
            "default_monthly_working_days": {
                "required": True,
                "min_value": 1,
                "max_value": 31,
            },
            "default_cnss_declared_days": {"min_value": 0, "max_value": 31},
            # Both day rates stay optional: empty means "derive it", which is the
            # behaviour every existing employment relies on. Negative money is
            # refused outright rather than silently inverting a deduction.
            "worked_day_rate": {"required": False, "allow_null": True, "min_value": 0},
            "absence_day_rate": {"required": False, "allow_null": True, "min_value": 0},
        }

    @staticmethod
    def _django_error_detail(exc: DjangoValidationError, default_field: str):
        if hasattr(exc, "message_dict"):
            return exc.message_dict
        return {default_field: list(exc.messages)}

    def validate(self, attrs):
        from apps.personnel.validators import EmploymentValidator

        instance = self.instance
        person = attrs.get("person", getattr(instance, "person", None))
        company = attrs.get("company", getattr(instance, "company", None))
        payment_method = attrs.get("payment_method", getattr(instance, "payment_method", None))
        hire_date = attrs.get("hire_date", getattr(instance, "hire_date", None))
        end_date = attrs.get(
            "employment_end_date",
            getattr(instance, "employment_end_date", None),
        )
        contract_type = attrs.get("contract_type", getattr(instance, "contract_type", ""))
        employment_status = attrs.get(
            "employment_status", getattr(instance, "employment_status", "active")
        )

        errors = {}
        if person and (person.is_archived or person.status != "active"):
            errors["person"] = [_("Select an active, non-archived person.")]
        if company and (company.is_archived or company.status != "active"):
            errors["company"] = [_("Select an active, non-archived company.")]
        if payment_method and (payment_method.is_archived or payment_method.status != "active"):
            errors["payment_method"] = [_("Select an active, non-archived payment method.")]

        validator = EmploymentValidator()
        try:
            validator.validate_employment_dates(hire_date, end_date, contract_type)
        except DjangoValidationError as exc:
            errors.update(self._django_error_detail(exc, "employment_end_date"))

        if not errors and person and company and hire_date:
            try:
                validator.validate_employment_overlap(
                    person_id=person.id,
                    company_id=company.id,
                    hire_date=hire_date,
                    end_date=end_date,
                    exclude_id=getattr(instance, "id", None),
                )
            except DjangoValidationError as exc:
                errors["non_field_errors"] = list(exc.messages)

        inactive_statuses = {"resigned", "terminated", "retired", "former"}
        attrs["is_active"] = employment_status not in inactive_statuses
        if employment_status in inactive_statuses:
            departure_reason = attrs.get(
                "departure_reason", getattr(instance, "departure_reason", "")
            )
            resignation_date = attrs.get(
                "resignation_date", getattr(instance, "resignation_date", None)
            )
            if not departure_reason:
                errors["departure_reason"] = [_("Departure reason is required.")]
            if not resignation_date:
                errors["resignation_date"] = [_("Departure date is required.")]

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def to_representation(self, instance):
        # Mutations return the same complete shape as list/detail consumers.
        return EmploymentSerializer(instance, context=self.context).data


class EmploymentSalarySerializer(serializers.ModelSerializer):
    """Serializer for EmploymentSalary.

    UPDATE LOCKDOWN (Cycle 20, state/IMPLEMENTATION_PLAN.md Section 14,
    finding G-3b's salary analogue). ``employment`` becomes read-only on
    update so a salary history row can never be reassigned to a different
    employment through a generic PATCH, which would retroactively rewrite
    what a past payroll's ``calculate_payroll`` snapshot was based on.
    """

    is_valid_now = serializers.SerializerMethodField()
    person = serializers.CharField(source="employment.person_id", read_only=True)
    employment_reference = serializers.CharField(
        source="employment.employee_reference", read_only=True
    )
    person_name = serializers.CharField(source="employment.person.get_full_name", read_only=True)
    company_name = serializers.CharField(source="employment.company.name", read_only=True)
    fixed_monthly_gross_salary = serializers.DecimalField(
        max_digits=18,
        decimal_places=4,
        min_value=Decimal("0.00"),
    )

    class Meta:
        model = EmploymentSalary
        fields = [
            "is_archived",
            "id",
            "reference",
            "employment",
            "person",
            "employment_reference",
            "person_name",
            "company_name",
            "fixed_monthly_gross_salary",
            "effective_from",
            "effective_to",
            "reason",
            "notes",
            "is_current",
            "is_valid_now",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "is_valid_now",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None and "employment" in self.fields:
            self.fields["employment"].read_only = True
            self.fields["employment"].required = False

    def get_is_valid_now(self, obj):
        return obj.is_valid_on(timezone.now().date())


class MonthlyPayrollRecordSerializer(serializers.ModelSerializer):
    """Serializer for MonthlyPayrollRecord list view.

    UPDATE LOCKDOWN (Cycle 20, state/IMPLEMENTATION_PLAN.md Section 14,
    findings G-3/G-3b). On update (not create), ``employment`` and every
    calculation input (``year``, ``month``, ``worked_days``, ``absence_days``,
    ``authorized_leave_days``, ``unpaid_leave_days``, ``declared_days``,
    ``scheduled_working_days``) become read-only. Before this, a generic
    PATCH could reassign a paid payroll to a different employee (G-3b), or
    rewrite its worked/absence days after the net salary had already been
    calculated from the old values (G-3) - the derived money fields were
    already read-only, but the inputs that justify them were not. These
    inputs may only change through ``MonthlyPayrollService.recalculate_payroll``
    (the ``recalculate`` action), which recomputes the derived fields to match.
    """

    employee_name = serializers.CharField(source="employment.person.get_full_name", read_only=True)
    employee_reference = serializers.CharField(
        source="employment.employee_reference", read_only=True
    )
    company_name = serializers.CharField(source="employment.company.name", read_only=True)

    UPDATE_ONLY_READ_ONLY_FIELDS = (
        "employment",
        "year",
        "month",
        "worked_days",
        "absence_days",
        "authorized_leave_days",
        "unpaid_leave_days",
        "declared_days",
        "scheduled_working_days",
    )

    class Meta:
        model = MonthlyPayrollRecord
        fields = [
            "is_archived",
            "id",
            "reference",
            "employment",
            "employee_name",
            "employee_reference",
            "company_name",
            "year",
            "month",
            "period_start",
            "period_end",
            "scheduled_working_days",
            "worked_days",
            "absence_days",
            "authorized_leave_days",
            "unpaid_leave_days",
            "declared_days",
            "gross_salary_snapshot",
            "daily_rate",
            "absence_deduction",
            "supplements_total",
            "other_deductions_total",
            "calculated_net_salary",
            "total_paid",
            "remaining_amount",
            "payment_status",
            "status",
            "calculated_at",
            "approved_at",
            "approved_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "period_start",
            "period_end",
            "gross_salary_snapshot",
            "daily_rate",
            "absence_deduction",
            "supplements_total",
            "other_deductions_total",
            "calculated_net_salary",
            "total_paid",
            "remaining_amount",
            "payment_status",
            "status",
            "calculated_at",
            "approved_at",
            "approved_by",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            for field_name in self.UPDATE_ONLY_READ_ONLY_FIELDS:
                if field_name in self.fields:
                    self.fields[field_name].read_only = True
                    self.fields[field_name].required = False


class MonthlyPayrollRecordDetailSerializer(MonthlyPayrollRecordSerializer):
    """Detailed serializer with adjustments and payments."""

    adjustments = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    adjustments_total = serializers.SerializerMethodField()

    class Meta(MonthlyPayrollRecordSerializer.Meta):
        fields = MonthlyPayrollRecordSerializer.Meta.fields + [
            "adjustments",
            "payments",
            "adjustments_total",
            "notes",
            "observations",
        ]

    def get_adjustments(self, obj):
        adjustments = obj.adjustments.filter(is_archived=False)
        return PayrollAdjustmentSerializer(adjustments, many=True).data

    def get_payments(self, obj):
        payments = obj.payments.filter(is_archived=False).order_by("-payment_date")
        return PayrollPaymentSerializer(payments, many=True).data

    def get_adjustments_total(self, obj):
        additions = obj.adjustments.filter(direction="addition").aggregate(total=Sum("amount"))[
            "total"
        ] or Decimal("0")
        deductions = obj.adjustments.filter(direction="deduction").aggregate(total=Sum("amount"))[
            "total"
        ] or Decimal("0")
        return {"additions": additions, "deductions": deductions, "net": additions - deductions}


class MonthlyPayrollRecordListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists."""

    employee_name = serializers.CharField(source="employment.person.get_full_name", read_only=True)

    class Meta:
        model = MonthlyPayrollRecord
        fields = [
            "id",
            "reference",
            "year",
            "month",
            "gross_salary_snapshot",
            "calculated_net_salary",
            "total_paid",
            "remaining_amount",
            "payment_status",
            "status",
            "employee_name",
        ]


class PayrollAdjustmentSerializer(serializers.ModelSerializer):
    """Serializer for PayrollAdjustment.

    UPDATE LOCKDOWN (Cycle 20, state/IMPLEMENTATION_PLAN.md Section 14,
    finding G-1b's adjustment analogue). ``payroll_record`` becomes read-only
    on update so an adjustment can never be reparented onto a different
    payroll through a generic PATCH; reparenting was never a legitimate
    correction (void and re-create is the correct workflow, preserving the
    audit trail).
    """

    signed_amount = serializers.SerializerMethodField()
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=4,
        min_value=Decimal("0.00"),
    )

    class Meta:
        model = PayrollAdjustment
        fields = [
            "is_archived",
            "id",
            "reference",
            "payroll_record",
            "adjustment_type",
            "direction",
            "amount",
            "signed_amount",
            "description",
            "effective_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "signed_amount",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None and "payroll_record" in self.fields:
            self.fields["payroll_record"].read_only = True
            self.fields["payroll_record"].required = False

    def get_signed_amount(self, obj):
        return obj.get_signed_amount()


class PaymentMethodField(serializers.Field):
    """Accept a payment method by PK or by (case-insensitive) name."""

    default_error_messages = {
        "invalid": _("Invalid payment method."),
    }

    def to_internal_value(self, data):
        from django.core.exceptions import ValidationError as DjangoValidationError

        from apps.configuration.models import PaymentMethod

        if data in (None, ""):
            return None
        try:
            return PaymentMethod.objects.get(id=data)
        except (PaymentMethod.DoesNotExist, DjangoValidationError):
            method = PaymentMethod.objects.filter(name__iexact=str(data)).first()
            if method is None:
                self.fail("invalid")
            return method

    def to_representation(self, value):
        return value.id if value else None


class PayrollPaymentSerializer(serializers.ModelSerializer):
    """Serializer for PayrollPayment.

    UPDATE LOCKDOWN (Cycle 20, state/IMPLEMENTATION_PLAN.md Section 14,
    findings G-1/G-1b). ``payroll_record`` becomes read-only on update so a
    payment can never be moved between payrolls through a generic PATCH
    (G-1b) - void and re-record is the correct correction workflow. Note
    that ``amount`` is deliberately left writable here: refusing edits on a
    settled payroll is handled by ``get_update_block_reason`` (returns 409
    once the parent payroll is approved/paid, matching the same policy
    already applied to archive/purge), and an unsettled payroll's own
    ``total_paid``/``remaining_amount`` are recomputed on save (see
    ``PayrollPaymentViewSet.perform_update``) so amount edits before
    settlement stay consistent rather than being blocked outright.
    """

    payment_method = PaymentMethodField(required=False, allow_null=True)
    payment_method_name = serializers.CharField(source="payment_method.name", read_only=True)
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=4,
        required=True,
        min_value=Decimal("0.00"),
    )

    class Meta:
        model = PayrollPayment
        fields = [
            "is_archived",
            "id",
            "reference",
            "payroll_record",
            "payment_date",
            "amount",
            "payment_method",
            "payment_method_name",
            "payment_kind",
            "notes",
            "observations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["is_archived", "id", "reference", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None and "payroll_record" in self.fields:
            self.fields["payroll_record"].read_only = True
            self.fields["payroll_record"].required = False


class CNSSDeclarationSerializer(EmptyStringToNullMixin, serializers.ModelSerializer):
    """Serializer for CNSSDeclaration list view."""

    person_name = serializers.CharField(source="person.get_full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    employment_ref = serializers.CharField(source="employment.employee_reference", read_only=True)
    is_active_now = serializers.SerializerMethodField()

    empty_to_null_fields = (
        "employment",
        "first_declaration_date",
        "declaration_start_date",
        "declaration_end_date",
        "declaration_stop_date",
        "resignation_date",
    )

    class Meta:
        model = CNSSDeclaration
        fields = [
            "is_archived",
            "id",
            "reference",
            "person",
            "person_name",
            "company",
            "company_name",
            "employment",
            "employment_ref",
            "cnss_registration_number",
            "cin_snapshot",
            "situation",
            "is_currently_declared",
            "is_active_now",
            "first_declaration_date",
            "declaration_start_date",
            "declaration_end_date",
            "declaration_stop_date",
            "resignation_date",
            "stop_reason",
            "notes",
            "observations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "is_active_now",
        ]

    def run_validators(self, value):
        # UniqueConstraint condition_fields (is_currently_declared, is_archived)
        # are omitted on partial PATCH. Copy them from the instance so DRF's
        # UniqueTogetherValidator does not KeyError.
        if self.instance is not None:
            value = dict(value)
            for field in ["person", "company", "is_currently_declared", "is_archived"]:
                if field not in value:
                    value[field] = getattr(self.instance, field)
        super().run_validators(value)

    def get_is_active_now(self, obj):
        return obj.is_currently_active()


class CNSSDeclarationDetailSerializer(CNSSDeclarationSerializer):
    """Detailed serializer with monthly declarations."""

    monthly_declarations = serializers.SerializerMethodField()

    class Meta(CNSSDeclarationSerializer.Meta):
        fields = CNSSDeclarationSerializer.Meta.fields + [
            "monthly_declarations",
            "notes",
            "observations",
        ]

    def get_monthly_declarations(self, obj):
        monthly = obj.monthly_declarations.filter(is_archived=False).order_by("-year", "-month")
        return CNSSMonthlyDeclarationSerializer(monthly, many=True).data


class CNSSDeclarationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for lists."""

    person_name = serializers.CharField(source="person.get_full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = CNSSDeclaration
        fields = [
            "id",
            "reference",
            "person_name",
            "company_name",
            "cnss_registration_number",
            "situation",
            "is_currently_declared",
        ]


class CNSSMonthlyDeclarationSerializer(serializers.ModelSerializer):
    """Serializer for CNSSMonthlyDeclaration."""

    person_name = serializers.CharField(
        source="cnss_declaration.person.get_full_name", read_only=True
    )
    company_name = serializers.CharField(source="cnss_declaration.company.name", read_only=True)
    situation_label = serializers.SerializerMethodField()

    class Meta:
        model = CNSSMonthlyDeclaration
        fields = [
            "is_archived",
            "id",
            "reference",
            "cnss_declaration",
            "person_name",
            "company_name",
            "year",
            "month",
            "declared_days",
            "declared_salary",
            "situation",
            "situation_label",
            "status",
            "submission_date",
            "notes",
            "observations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "situation_label",
        ]
        extra_kwargs = {
            "declared_salary": {"min_value": Decimal("0.00")},
        }

    def get_situation_label(self, obj):
        labels = {
            "entrant": _("Entrant"),
            "sortant": _("Sortant"),
            "active": _("Active"),
            "suspended": _("Suspended"),
            "correction": _("Correction"),
            "other": _("Other"),
        }
        return labels.get(obj.situation, obj.situation)


class PersonnelDocumentReferenceSerializer(serializers.ModelSerializer):
    """Serializer for PersonnelDocumentReference."""

    person_name = serializers.CharField(source="person.get_full_name", read_only=True)
    document_type_label = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True, required=False)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = PersonnelDocumentReference
        fields = [
            "is_archived",
            "id",
            "reference",
            "person",
            "person_name",
            "employment",
            "cnss_declaration",
            "document_type",
            "document_type_label",
            "external_reference",
            "file",
            "file_name",
            "content_type",
            "size_bytes",
            "download_url",
            "issue_date",
            "expiry_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_archived",
            "id",
            "reference",
            "created_at",
            "updated_at",
            "document_type_label",
            "file_name",
            "content_type",
            "size_bytes",
            "download_url",
        ]

    def validate_file(self, upload):
        allowed = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"}
        validate_private_upload(upload, max_bytes=10 * 1024 * 1024, allowed=allowed)
        return upload

    def create(self, validated_data):
        upload = validated_data.get("file")
        if upload:
            validated_data["file_name"] = upload.name
            validated_data["content_type"] = getattr(upload, "content_type", "") or ""
            validated_data["size_bytes"] = upload.size
        return super().create(validated_data)

    def update(self, instance, validated_data):
        upload = validated_data.get("file")
        if upload:
            validated_data["file_name"] = upload.name
            validated_data["content_type"] = getattr(upload, "content_type", "") or ""
            validated_data["size_bytes"] = upload.size
        return super().update(instance, validated_data)

    def get_download_url(self, obj):
        if not obj.file:
            return None
        return f"/api/v1/personnel/documents/{obj.pk}/download/"

    def get_document_type_label(self, obj):
        labels = {
            "cin": _("CIN"),
            "cnss_document": _("CNSS Document"),
            "employment_contractor": _("Employment Contract"),
            "rib_document": _("RIB Document"),
            "other": _("Other"),
        }
        return labels.get(obj.document_type, obj.document_type)


# Report serializers
class CNSSReportRowSerializer(serializers.Serializer):
    """Serializer for CNSS report row."""

    company = serializers.CharField()
    company_reference = serializers.CharField()
    cnss_registration_number = serializers.CharField()
    last_name = serializers.CharField()
    first_name = serializers.CharField()
    full_name = serializers.CharField()
    declared_days = serializers.IntegerField()
    cin = serializers.CharField()
    situation = serializers.CharField()
    first_declaration_date = serializers.DateField(allow_null=True)
    declaration_start_date = serializers.DateField(allow_null=True)
    declaration_stop_date = serializers.DateField(allow_null=True)
    resignation_date = serializers.DateField(allow_null=True)
    current_declaration_state = serializers.CharField()
    observation = serializers.CharField()


class PayrollReportRowSerializer(serializers.Serializer):
    """Serializer for Payroll report row."""

    company = serializers.CharField()
    company_reference = serializers.CharField()
    work_domain = serializers.CharField()
    work_city = serializers.CharField()
    department = serializers.CharField()
    employee_reference = serializers.CharField()
    last_name = serializers.CharField()
    first_name = serializers.CharField()
    full_name = serializers.CharField()
    cin = serializers.CharField()
    phone = serializers.CharField()
    hire_date = serializers.DateField(allow_null=True)
    payroll_month = serializers.CharField()
    scheduled_days = serializers.IntegerField()
    worked_days = serializers.IntegerField()
    absence_days = serializers.IntegerField()
    declared_days = serializers.IntegerField()
    fixed_gross_salary = serializers.DecimalField(max_digits=18, decimal_places=4)
    gross_salary_snapshot = serializers.DecimalField(max_digits=18, decimal_places=4)
    supplements = serializers.DecimalField(max_digits=18, decimal_places=4)
    deductions = serializers.DecimalField(max_digits=18, decimal_places=4)
    calculated_net_salary = serializers.DecimalField(max_digits=18, decimal_places=4)
    total_paid = serializers.DecimalField(max_digits=18, decimal_places=4)
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=4)
    rib = serializers.CharField()
    payment_method = serializers.CharField()
    payroll_status = serializers.CharField()
    observation = serializers.CharField()


class ReportPreviewSerializer(serializers.Serializer):
    """Serializer for report preview request."""

    year = serializers.IntegerField(min_value=1900, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    personnel_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    output_format = serializers.ChoiceField(
        choices=[("xlsx", "XLSX"), ("pdf", "PDF"), ("csv", "CSV")], default="xlsx"
    )
    template_id = serializers.UUIDField(required=False, allow_null=True)
    template = serializers.ChoiceField(
        choices=[("declaration", "Declaration"), ("monthly_list", "Monthly List")],
        required=False,
        allow_null=True,
    )


class ReportExportSerializer(serializers.Serializer):
    """Serializer for report export request."""

    report_type = serializers.ChoiceField(
        choices=[
            ("cnss_monthly", "CNSS Monthly"),
            ("payroll_monthly", "Payroll Monthly"),
        ]
    )
    year = serializers.IntegerField(min_value=1900, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    personnel_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    output_format = serializers.ChoiceField(
        choices=[("xlsx", "XLSX"), ("pdf", "PDF"), ("csv", "CSV")], default="xlsx"
    )
    template_id = serializers.UUIDField(required=False, allow_null=True)
    template = serializers.ChoiceField(
        choices=[("declaration", "Declaration"), ("monthly_list", "Monthly List")],
        required=False,
        allow_null=True,
    )
