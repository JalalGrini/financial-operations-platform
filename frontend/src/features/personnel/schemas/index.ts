// src/features/personnel/schemas/index.ts
/**
 * Personnel Validation Schemas
 * Zod schemas for form validation matching backend requirements
 */

import { z } from "zod";

// ============ Enums ============

export const PersonnelStatusSchema = z.enum([
  "active",
  "inactive",
  "suspended",
  "terminated",
  "archived",
]);

export const ContractTypeSchema = z.enum([
  "permanent",
  "fixed_term",
  "temporary",
  "internship",
  "apprenticeship",
  "seasonal",
  "part_time",
  "other",
]);

export const CNSSSituationSchema = z.enum([
  "declared_by_this_company",
  "declared_by_another_employer",
  "personally_insured",
  "not_declared",
  "pending",
  "suspended",
  "stopped",
  "exempt",
  "unknown",
  "other",
]);

export const CNSSStopReasonSchema = z.enum([
  "resignation",
  "termination",
  "retirement",
  "death",
  "company_closure",
  "contract_end",
  "mutual_agreement",
  "suspension",
  "other",
]);

export const EmploymentDepartureReasonSchema = z.enum([
  "resignation",
  "termination",
  "retirement",
  "death",
  "contract_end",
  "mutual_agreement",
  "redundancy",
  "medical",
  "other",
]);

export const CNSSMonthlySituationSchema = z.enum([
  "entrant",
  "sortant",
  "active",
  "suspended",
  "correction",
  "other",
]);

export const PayrollAdjustmentTypeSchema = z.enum([
  "supplement",
  "bonus",
  "deduction",
  "penalty",
  "advance_recovery",
  "correction",
  "other",
]);

export const PayrollAdjustmentDirectionSchema = z.enum([
  "addition",
  "deduction",
]);

export const PayrollPaymentKindSchema = z.enum([
  "advance",
  "partial",
  "final",
  "adjustment",
  "other",
]);

export const PayrollStatusSchema = z.enum([
  "draft",
  "calculated",
  "approved",
  "paid",
  "cancelled",
]);

export const CNSSMonthlyStatusSchema = z.enum([
  "draft",
  "submitted",
  "accepted",
  "rejected",
  "corrected",
]);

export const DocumentTypeSchema = z.enum([
  "cin",
  "cnss_document",
  "employment_contract",
  "rib_document",
  "other",
]);

// ============ Personnel Person Schemas ============

export const PersonnelPersonCreateSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  middle_name: z.string().max(100).optional(),
  cin: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z
    .string()
    .email("Invalid email")
    .max(254)
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  nationality: z.string().max(100).optional(),
  status: PersonnelStatusSchema.default("active"),
  notes: z.string().optional(),
  observations: z.string().optional(),
  company: z.string().nullable().optional(),
});

export const PersonnelPersonUpdateSchema =
  PersonnelPersonCreateSchema.partial();

export const PersonnelPersonSearchSchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
});

export const PersonnelCompletenessSchema = z.object({
  overall: z.number().min(0).max(100),
  identity: z.object({
    complete: z.boolean(),
    missing: z.array(z.string()),
  }),
  employment: z.object({
    complete: z.boolean(),
    missing: z.array(z.string()),
  }),
  payment: z.object({
    complete: z.boolean(),
    missing: z.array(z.string()),
  }),
  cnss: z.object({
    complete: z.boolean(),
    missing: z.array(z.string()),
  }),
});

// ============ Employment Schemas ============

const EmploymentBaseSchema = z.object({
  person: z.string().uuid("Invalid person ID"),
  company: z.string().uuid("Invalid company ID").nullable(),
  employee_reference: z
    .string()
    .min(1, "Employee reference is required")
    .max(50),
  job_title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  work_domain: z.string().max(100).optional(),
  work_city: z.string().max(100).optional(),
  contract_type: ContractTypeSchema.default("permanent"),
  employment_status: z
    .enum([
      "active",
      "on_leave",
      "suspended",
      "resigned",
      "terminated",
      "retired",
      "former",
      "cnss_only",
      "other",
    ])
    .default("active"),
  hire_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  employment_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  departure_reason: EmploymentDepartureReasonSchema.optional(),
  resignation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  payment_method: z.string().max(100).optional(),
  rib: z.string().max(50).optional(),
  default_monthly_working_days: z.number().int().min(1).max(31).default(26),
  observations: z.string().optional(),
});

export const EmploymentCreateSchema = EmploymentBaseSchema.refine(
  (data) => {
    if (data.employment_end_date && data.hire_date) {
      return new Date(data.employment_end_date) >= new Date(data.hire_date);
    }
    return true;
  },
  {
    message: "End date must be after hire date",
    path: ["employment_end_date"],
  },
);

export const EmploymentUpdateSchema = EmploymentBaseSchema.partial();

export const EmploymentTerminateSchema = z.object({
  departure_reason: z.string().optional(),
  resignation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
});

// ============ Salary Schemas ============

const EmploymentSalaryBaseSchema = z.object({
  employment: z.string().uuid("Invalid employment ID"),
  fixed_monthly_gross_salary: z.coerce
    .number()
    .min(0, "Salary must be positive")
    .max(999999999.9999, "Salary too large"),
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().optional(),
});

export const EmploymentSalaryCreateSchema = EmploymentSalaryBaseSchema.refine(
  (data) => {
    if (data.effective_to && data.effective_from) {
      return new Date(data.effective_to) >= new Date(data.effective_from);
    }
    return true;
  },
  {
    message: "Effective to date must be after effective from date",
    path: ["effective_to"],
  },
);

export const EmploymentSalaryUpdateSchema =
  EmploymentSalaryBaseSchema.partial();

// ============ Payroll Schemas ============

const MonthlyPayrollRecordBaseSchema = z.object({
  employment: z.string().uuid("Invalid employment ID"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  scheduled_working_days: z.number().int().min(1).max(31).default(26),
  worked_days: z.number().int().min(0).max(31).default(0),
  absence_days: z.number().int().min(0).max(31).default(0),
  authorized_leave_days: z.number().int().min(0).max(31).default(0),
  unpaid_leave_days: z.number().int().min(0).max(31).default(0),
  notes: z.string().optional(),
  observations: z.string().optional(),
});

export const MonthlyPayrollRecordCreateSchema =
  MonthlyPayrollRecordBaseSchema.refine(
    (data) => {
      const total =
        data.worked_days +
        data.absence_days +
        data.authorized_leave_days +
        data.unpaid_leave_days;
      return total <= data.scheduled_working_days;
    },
    {
      message:
        "Sum of worked, absence, authorized leave, and unpaid leave days cannot exceed scheduled days",
      path: ["worked_days"],
    },
  );

export const MonthlyPayrollRecordUpdateSchema =
  MonthlyPayrollRecordBaseSchema.partial();

export const PayrollCalculationSchema = z.object({
  gross_salary_snapshot: z.number(),
  daily_rate: z.number(),
  absence_deduction: z.number(),
  supplements: z.number(),
  deductions: z.number(),
  calculated_net_salary: z.number(),
  declared_days: z.number(),
});

// ============ Adjustment Schemas ============

export const PayrollAdjustmentCreateSchema = z.object({
  payroll_record: z.string().uuid("Invalid payroll ID"),
  adjustment_type: PayrollAdjustmentTypeSchema,
  direction: PayrollAdjustmentDirectionSchema,
  amount: z.number().positive("Amount must be positive"),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  description: z.string().min(1, "Description is required").max(500),
  notes: z.string().optional(),
});

export const PayrollAdjustmentUpdateSchema =
  PayrollAdjustmentCreateSchema.partial();

// ============ Payment Schemas ============

export const PayrollPaymentCreateSchema = z.object({
  payroll_record: z.string().uuid("Invalid payroll ID"),
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  amount: z.number().positive("Amount must be positive"),
  payment_kind: PayrollPaymentKindSchema,
  payment_method: z.string().max(100).optional(),
  notes: z.string().optional(),
  observations: z.string().optional(),
});

export const PayrollPaymentUpdateSchema = PayrollPaymentCreateSchema.partial();

// ============ CNSS Schemas ============

const CNSSDeclarationBaseSchema = z.object({
  person: z.string().uuid("Invalid person ID"),
  company: z.string().uuid("Invalid company ID").nullable(),
  employment: z.string().uuid("Invalid employment ID").optional(),
  cnss_registration_number: z
    .string()
    .min(1, "CNSS number is required")
    .max(50),
  situation: CNSSSituationSchema.default("not_declared"),
  first_declaration_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  declaration_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)"),
  declaration_stop_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  resignation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  stop_reason: CNSSStopReasonSchema.optional(),
  observations: z.string().optional(),
});

export const CNSSDeclarationCreateSchema = CNSSDeclarationBaseSchema;

export const CNSSDeclarationUpdateSchema = CNSSDeclarationBaseSchema.partial();

const CNSSMonthlyDeclarationBaseSchema = z.object({
  cnss_declaration: z.string().uuid("Invalid CNSS declaration ID"),
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  declared_days: z.number().int().min(0).max(31),
  declared_salary: z.number().min(0).max(999999999.9999),
  situation: CNSSMonthlySituationSchema.default("active"),
  observation: z.string().optional(),
});

export const CNSSMonthlyDeclarationCreateSchema =
  CNSSMonthlyDeclarationBaseSchema;

export const CNSSMonthlyDeclarationUpdateSchema =
  CNSSMonthlyDeclarationBaseSchema.partial();

export const CNSSMonthlySubmitSchema = z.object({});

export const CNSSMonthlyCorrectSchema = z.object({});

// ============ Document Schemas ============

const PersonnelDocumentReferenceBaseSchema = z.object({
  person: z.string().uuid("Invalid person ID"),
  document_type: DocumentTypeSchema,
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  document_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (JJ/MM/AAAA)")
    .optional(),
  issuing_authority: z.string().max(200).optional(),
  reference_number: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export const PersonnelDocumentReferenceCreateSchema =
  PersonnelDocumentReferenceBaseSchema;

export const PersonnelDocumentReferenceUpdateSchema =
  PersonnelDocumentReferenceBaseSchema.partial();

// ============ Report Schemas ============

export const ReportFiltersSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  company_ids: z.array(z.string().uuid()).optional(),
  personnel_ids: z.array(z.string().uuid()).optional(),
  report_type: z.enum(["cnss_monthly", "payroll_monthly"]),
  output_format: z.enum(["xlsx", "pdf", "csv"]).optional().default("xlsx"),
});

export const ReportPreviewRequestSchema = ReportFiltersSchema.omit({
  output_format: true,
});

export const ReportExportRequestSchema = ReportFiltersSchema;

// ============ Select Option Schemas ============

export const CompanySelectOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  reference: z.string(),
});

export const PersonnelSelectOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  reference: z.string(),
  cin: z.string().optional(),
  current_company: z.string().optional(),
});

// ============ Dashboard Schemas ============

export const DashboardSummarySchema = z.object({
  totalPersonnel: z.number().int().nonnegative(),
  activeEmployees: z.number().int().nonnegative(),
  cnssDeclared: z.number().int().nonnegative(),
  notDeclared: z.number().int().nonnegative(),
  cnssOnly: z.number().int().nonnegative(),
  multiCompany: z.number().int().nonnegative(),
  incomplete: z.number().int().nonnegative(),
  archivedPersonnel: z.number().int().nonnegative().optional(),
  monthlyPayroll: z.number().int().nonnegative(),
  pendingPayments: z.number().int().nonnegative(),
  recentlyUpdated: z
    .array(
      z.object({
        id: z.string().uuid(),
        reference: z.string(),
        full_name: z.string(),
        updated_at: z.string(),
      }),
    )
    .optional(),
  payrollRequiringAttention: z
    .array(
      z.object({
        id: z.string().uuid(),
        reference: z.string(),
        person_name: z.string(),
        payroll_month: z.string(),
        status: PayrollStatusSchema,
        remaining_amount: z.number(),
      }),
    )
    .optional(),
  cnssRequiringAttention: z
    .array(
      z.object({
        id: z.string().uuid(),
        reference: z.string(),
        person_name: z.string(),
        company_name: z.string(),
        situation: CNSSMonthlySituationSchema,
        status: CNSSMonthlyStatusSchema,
      }),
    )
    .optional(),
  incompleteRecords: z
    .array(
      z.object({
        id: z.string().uuid(),
        reference: z.string(),
        full_name: z.string(),
        completeness_percentage: z.number().min(0).max(100),
        missing_sections: z.array(z.string()),
      }),
    )
    .optional(),
});

// ============ Type Exports ============

export type PersonnelPersonCreate = z.infer<typeof PersonnelPersonCreateSchema>;
export type PersonnelPersonUpdate = z.infer<typeof PersonnelPersonUpdateSchema>;
export type PersonnelPersonSearch = z.infer<typeof PersonnelPersonSearchSchema>;
export type PersonnelCompleteness = z.infer<typeof PersonnelCompletenessSchema>;

export type EmploymentCreate = z.infer<typeof EmploymentCreateSchema>;
export type EmploymentUpdate = z.infer<typeof EmploymentUpdateSchema>;
export type EmploymentTerminate = z.infer<typeof EmploymentTerminateSchema>;

export type EmploymentSalaryCreate = z.infer<
  typeof EmploymentSalaryCreateSchema
>;
export type EmploymentSalaryUpdate = z.infer<
  typeof EmploymentSalaryUpdateSchema
>;

export type MonthlyPayrollRecordCreate = z.infer<
  typeof MonthlyPayrollRecordCreateSchema
>;
export type MonthlyPayrollRecordUpdate = z.infer<
  typeof MonthlyPayrollRecordUpdateSchema
>;
export type PayrollCalculation = z.infer<typeof PayrollCalculationSchema>;

export type PayrollAdjustmentCreate = z.infer<
  typeof PayrollAdjustmentCreateSchema
>;
export type PayrollAdjustmentUpdate = z.infer<
  typeof PayrollAdjustmentUpdateSchema
>;

export type PayrollPaymentCreate = z.infer<typeof PayrollPaymentCreateSchema>;
export type PayrollPaymentUpdate = z.infer<typeof PayrollPaymentUpdateSchema>;

export type CNSSDeclarationCreate = z.infer<typeof CNSSDeclarationCreateSchema>;
export type CNSSDeclarationUpdate = z.infer<typeof CNSSDeclarationUpdateSchema>;

export type CNSSMonthlyDeclarationCreate = z.infer<
  typeof CNSSMonthlyDeclarationCreateSchema
>;
export type CNSSMonthlyDeclarationUpdate = z.infer<
  typeof CNSSMonthlyDeclarationUpdateSchema
>;
export type CNSSMonthlySubmit = z.infer<typeof CNSSMonthlySubmitSchema>;
export type CNSSMonthlyCorrect = z.infer<typeof CNSSMonthlyCorrectSchema>;

export type PersonnelDocumentReferenceCreate = z.infer<
  typeof PersonnelDocumentReferenceCreateSchema
>;
export type PersonnelDocumentReferenceUpdate = z.infer<
  typeof PersonnelDocumentReferenceUpdateSchema
>;

export type ReportFilters = z.infer<typeof ReportFiltersSchema>;
export type ReportPreviewRequest = z.infer<typeof ReportPreviewRequestSchema>;
export type ReportExportRequest = z.infer<typeof ReportExportRequestSchema>;

export type CompanySelectOption = z.infer<typeof CompanySelectOptionSchema>;
export type PersonnelSelectOption = z.infer<typeof PersonnelSelectOptionSchema>;

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
