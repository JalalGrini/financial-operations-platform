# apps/personnel/admin.py
"""
Personnel Admin Configuration.

Registers all Personnel domain models in Django Admin
with appropriate display, search, and filter options.
"""
from django.contrib import admin
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


@admin.register(PersonnelPerson)
class PersonnelPersonAdmin(admin.ModelAdmin):
    """Admin for PersonnelPerson."""

    list_display = [
        "reference",
        "get_full_name",
        "cin",
        "phone",
        "email",
        "city",
        "status",
        "is_archived",
        "created_at",
    ]
    list_filter = ["status", "is_archived", "city", "province", "region", "created_at"]
    search_fields = ["reference", "first_name", "last_name", "cin", "phone", "email"]
    readonly_fields = [
        "id",
        "reference",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_by",
        "archived_at",
    ]
    ordering = ["-created_at"]

    fieldsets = (
        (
            _("Identification"),
            {"fields": ("reference", "first_name", "last_name", "middle_name", "cin")},
        ),
        (_("Contact"), {"fields": ("phone", "email", "address", "city", "province", "region")}),
        (_("Personal Info"), {"fields": ("date_of_birth", "nationality")}),
        (_("Status"), {"fields": ("status", "notes", "observations")}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def get_full_name(self, obj):
        return obj.get_full_name()

    get_full_name.short_description = _("Full Name")

    def get_queryset(self, request):
        return PersonnelPerson.all_objects.select_related("created_by", "updated_by", "archived_by")


class EmploymentSalaryInline(admin.TabularInline):
    """Inline for EmploymentSalary."""

    model = EmploymentSalary
    extra = 0
    readonly_fields = [
        "reference",
        "fixed_monthly_gross_salary",
        "effective_from",
        "effective_to",
        "is_current",
        "created_at",
        "updated_at",
    ]
    can_delete = False
    ordering = ["-effective_from"]


@admin.register(Employment)
class EmploymentAdmin(admin.ModelAdmin):
    """Admin for Employment."""

    list_display = [
        "reference",
        "person",
        "company",
        "employee_reference",
        "job_title",
        "department",
        "employment_status",
        "is_active",
        "hire_date",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "employment_status",
        "contract_type",
        "is_active",
        "is_archived",
        "company",
        "work_city",
        "created_at",
    ]
    search_fields = [
        "reference",
        "employee_reference",
        "person__first_name",
        "person__last_name",
        "person__cin",
        "company__name",
    ]
    readonly_fields = [
        "id",
        "reference",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_by",
        "archived_at",
    ]
    ordering = ["-created_at"]

    fieldsets = (
        (_("Relations"), {"fields": ("person", "company", "employee_reference")}),
        (_("Organization"), {"fields": ("job_title", "department", "work_domain", "work_city")}),
        (
            _("Employment Details"),
            {
                "fields": (
                    "employment_status",
                    "contract_type",
                    "hire_date",
                    "employment_end_date",
                    "departure_reason",
                    "resignation_date",
                    "is_active",
                )
            },
        ),
        (_("Payment"), {"fields": ("payment_method", "rib", "bank_name", "bank_account_holder")}),
        (_("Defaults"), {"fields": ("default_monthly_working_days", "default_cnss_declared_days")}),
        (_("Notes"), {"fields": ("observations",)}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    inlines = [EmploymentSalaryInline]

    def get_queryset(self, request):
        return Employment.all_objects.select_related("person", "company", "payment_method")


@admin.register(EmploymentSalary)
class EmploymentSalaryAdmin(admin.ModelAdmin):
    """Admin for EmploymentSalary."""

    list_display = [
        "reference",
        "employment",
        "fixed_monthly_gross_salary",
        "effective_from",
        "effective_to",
        "is_current",
        "is_archived",
    ]
    list_filter = ["is_current", "is_archived", "effective_from"]
    search_fields = ["reference", "employment__person__first_name", "employment__person__last_name"]
    readonly_fields = ["id", "reference", "created_at", "updated_at", "created_by", "updated_by"]
    ordering = ["-effective_from"]

    fieldsets = (
        (_("Employment"), {"fields": ("employment",)}),
        (
            _("Salary Details"),
            {
                "fields": (
                    "fixed_monthly_gross_salary",
                    "effective_from",
                    "effective_to",
                    "is_current",
                )
            },
        ),
        (_("Details"), {"fields": ("reason", "notes")}),
        (
            _("Audit"),
            {
                "fields": ("created_at", "updated_at", "created_by", "updated_by"),
                "classes": ("collapse",),
            },
        ),
    )

    def get_queryset(self, request):
        return EmploymentSalary.all_objects.select_related("employment", "employment__person")


class PayrollAdjustmentInline(admin.TabularInline):
    """Inline for PayrollAdjustment."""

    model = PayrollAdjustment
    extra = 0
    readonly_fields = [
        "reference",
        "adjustment_type",
        "direction",
        "amount",
        "description",
        "effective_date",
        "created_at",
    ]
    can_delete = False
    ordering = ["-effective_date"]


class PayrollPaymentInline(admin.TabularInline):
    """Inline for PayrollPayment."""

    model = PayrollPayment
    extra = 0
    readonly_fields = [
        "reference",
        "payment_date",
        "amount",
        "payment_kind",
        "payment_method",
        "created_at",
    ]
    can_delete = False
    ordering = ["-payment_date"]


@admin.register(MonthlyPayrollRecord)
class MonthlyPayrollRecordAdmin(admin.ModelAdmin):
    """Admin for MonthlyPayrollRecord."""

    list_display = [
        "reference",
        "employment",
        "year",
        "month",
        "gross_salary_snapshot",
        "calculated_net_salary",
        "total_paid",
        "remaining_amount",
        "payment_status",
        "status",
        "is_archived",
    ]
    list_filter = [
        "status",
        "payment_status",
        "is_archived",
        "year",
        "month",
        "employment__company",
        "employment__person__city",
    ]
    search_fields = [
        "reference",
        "employment__person__first_name",
        "employment__person__last_name",
        "employment__employee_reference",
    ]
    readonly_fields = [
        "id",
        "reference",
        "gross_salary_snapshot",
        "daily_rate",
        "absence_deduction",
        "calculated_net_salary",
        "total_paid",
        "remaining_amount",
        "payment_status",
        "calculated_at",
        "approved_at",
        "approved_by",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
    ]
    ordering = ["-year", "-month", "employment__person__last_name"]

    fieldsets = (
        (_("Period"), {"fields": ("employment", "year", "month", "period_start", "period_end")}),
        (
            _("Attendance"),
            {
                "fields": (
                    "scheduled_working_days",
                    "worked_days",
                    "absence_days",
                    "authorized_leave_days",
                    "unpaid_leave_days",
                    "declared_days",
                )
            },
        ),
        (
            _("Salary"),
            {
                "fields": (
                    "gross_salary_snapshot",
                    "daily_rate",
                    "absence_deduction",
                    "supplements_total",
                    "other_deductions_total",
                    "calculated_net_salary",
                )
            },
        ),
        (_("Payments"), {"fields": ("total_paid", "remaining_amount", "payment_status")}),
        (
            _("Status & Approval"),
            {"fields": ("status", "calculated_at", "approved_at", "approved_by")},
        ),
        (_("Notes"), {"fields": ("notes", "observations")}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    inlines = [PayrollAdjustmentInline, PayrollPaymentInline]

    def get_queryset(self, request):
        return MonthlyPayrollRecord.all_objects.select_related(
            "employment", "employment__person", "employment__company", "approved_by"
        )

    actions = ["recalculate_action", "approve_action"]

    def recalculate_action(self, request, queryset):
        for payroll in queryset.filter(status__in=["draft", "calculated"]):
            payroll.recalculate()
        self.message_user(request, _("Selected payrolls recalculated."))

    recalculate_action.short_description = _("Recalculate selected payrolls")

    def approve_action(self, request, queryset):
        for payroll in queryset.filter(status="calculated"):
            payroll.approved_by = request.user
            payroll.approved_at = timezone.now()
            payroll.status = "approved"
            payroll.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        self.message_user(request, _("Selected payrolls approved."))

    approve_action.short_description = _("Approve selected payrolls")


@admin.register(PayrollAdjustment)
class PayrollAdjustmentAdmin(admin.ModelAdmin):
    """Admin for PayrollAdjustment."""

    list_display = [
        "reference",
        "payroll_record",
        "adjustment_type",
        "direction",
        "amount",
        "effective_date",
        "is_archived",
    ]
    list_filter = ["adjustment_type", "direction", "is_archived", "effective_date"]
    search_fields = ["reference", "payroll_record__reference", "description"]
    readonly_fields = ["id", "reference", "created_at", "updated_at"]
    ordering = ["-effective_date", "-created_at"]

    def get_queryset(self, request):
        return PayrollAdjustment.all_objects.select_related("payroll_record")


@admin.register(PayrollPayment)
class PayrollPaymentAdmin(admin.ModelAdmin):
    """Admin for PayrollPayment."""

    list_display = [
        "reference",
        "payroll_record",
        "payment_date",
        "amount",
        "payment_kind",
        "payment_method",
        "is_archived",
    ]
    list_filter = ["payment_kind", "is_archived", "payment_date", "payment_method"]
    search_fields = ["reference", "payroll_record__reference"]
    readonly_fields = ["id", "reference", "created_at", "updated_at", "created_by", "updated_by"]
    ordering = ["-payment_date", "-created_at"]

    def get_queryset(self, request):
        return PayrollPayment.all_objects.select_related("payroll_record", "payment_method")


class CNSSMonthlyDeclarationInline(admin.TabularInline):
    """Inline for CNSSMonthlyDeclaration."""

    model = CNSSMonthlyDeclaration
    extra = 0
    readonly_fields = [
        "reference",
        "year",
        "month",
        "declared_days",
        "declared_salary",
        "situation",
        "status",
        "submission_date",
    ]
    can_delete = False
    ordering = ["-year", "-month"]


@admin.register(CNSSDeclaration)
class CNSSDeclarationAdmin(admin.ModelAdmin):
    """Admin for CNSSDeclaration."""

    list_display = [
        "reference",
        "person",
        "company",
        "cnss_registration_number",
        "situation",
        "is_currently_declared",
        "is_archived",
        "created_at",
    ]
    list_filter = [
        "situation",
        "is_currently_declared",
        "is_archived",
        "company",
        "created_at",
    ]
    search_fields = [
        "reference",
        "cnss_registration_number",
        "cin_snapshot",
        "person__first_name",
        "person__last_name",
        "person__cin",
    ]
    readonly_fields = [
        "id",
        "reference",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
    ]
    ordering = ["-created_at"]

    fieldsets = (
        (_("Relations"), {"fields": ("person", "company", "employment")}),
        (_("Registration"), {"fields": ("cnss_registration_number", "cin_snapshot")}),
        (_("Situation"), {"fields": ("situation", "is_currently_declared")}),
        (
            _("Dates"),
            {
                "fields": (
                    "first_declaration_date",
                    "declaration_start_date",
                    "declaration_end_date",
                    "declaration_stop_date",
                    "resignation_date",
                )
            },
        ),
        (_("Details"), {"fields": ("stop_reason", "notes", "observations")}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    inlines = [CNSSMonthlyDeclarationInline]

    def get_queryset(self, request):
        return CNSSDeclaration.all_objects.select_related("person", "company", "employment")


@admin.register(CNSSMonthlyDeclaration)
class CNSSMonthlyDeclarationAdmin(admin.ModelAdmin):
    """Admin for CNSSMonthlyDeclaration."""

    list_display = [
        "reference",
        "cnss_declaration",
        "year",
        "month",
        "declared_days",
        "declared_salary",
        "situation",
        "status",
        "is_archived",
    ]
    list_filter = [
        "situation",
        "status",
        "is_archived",
        "year",
        "month",
        "cnss_declaration__company",
    ]
    search_fields = [
        "reference",
        "cnss_declaration__reference",
        "cnss_declaration__person__first_name",
        "cnss_declaration__person__last_name",
    ]
    readonly_fields = [
        "id",
        "reference",
        "submission_date",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
    ]
    ordering = ["-year", "-month"]

    fieldsets = (
        (_("Declaration"), {"fields": ("cnss_declaration", "year", "month")}),
        (_("Data"), {"fields": ("declared_days", "declared_salary", "situation", "status")}),
        (_("Submission"), {"fields": ("submission_date", "reference")}),
        (_("Notes"), {"fields": ("notes", "observations")}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def get_queryset(self, request):
        return CNSSMonthlyDeclaration.all_objects.select_related(
            "cnss_declaration", "cnss_declaration__person", "cnss_declaration__company"
        )


@admin.register(PersonnelDocumentReference)
class PersonnelDocumentReferenceAdmin(admin.ModelAdmin):
    """Admin for PersonnelDocumentReference."""

    list_display = [
        "reference",
        "person",
        "document_type",
        "external_reference",
        "issue_date",
        "expiry_date",
        "is_archived",
    ]
    list_filter = [
        "document_type",
        "is_archived",
        "issue_date",
        "expiry_date",
        "employment__company",
    ]
    search_fields = ["reference", "person__first_name", "person__last_name", "external_reference"]
    readonly_fields = ["id", "reference", "created_at", "updated_at", "created_by", "updated_by"]
    ordering = ["-issue_date", "-created_at"]

    fieldsets = (
        (_("Relations"), {"fields": ("person", "employment", "cnss_declaration")}),
        (
            _("Document"),
            {"fields": ("document_type", "external_reference", "issue_date", "expiry_date")},
        ),
        (_("Notes"), {"fields": ("notes",)}),
        (
            _("Audit"),
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "is_archived",
                    "archived_at",
                    "archived_by",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    def get_queryset(self, request):
        return PersonnelDocumentReference.all_objects.select_related(
            "person", "employment", "cnss_declaration"
        )
