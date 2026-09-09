// src/features/personnel/types/index.ts
/**
 * Personnel Domain Types
 * Centralized type definitions for the Personnel feature
 */

// ============ Enums ============

export enum PersonnelStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  TERMINATED = "terminated",
  ARCHIVED = "archived",
}

export enum ContractType {
  PERMANENT = "permanent",
  FIXED_TERM = "fixed_term",
  TEMPORARY = "temporary",
  INTERNSHIP = "internship",
  APPRENTICESHIP = "apprenticeship",
  SEASONAL = "seasonal",
  PART_TIME = "part_time",
  OTHER = "other",
}

export enum CNSSSituation {
  DECLARED_BY_THIS_COMPANY = "declared_by_this_company",
  DECLARED_BY_ANOTHER_EMPLOYER = "declared_by_another_employer",
  PERSONALLY_INSURED = "personally_insured",
  NOT_DECLARED = "not_declared",
  PENDING = "pending_registration",
  SUSPENDED = "declaration_suspended",
  STOPPED = "declaration_stopped",
  EXEMPT = "exempt",
  UNKNOWN = "unknown",
  OTHER = "other",
}

export enum CNSSStopReason {
  RESIGNATION = "resignation",
  TERMINATION = "termination",
  RETIREMENT = "retirement",
  DEATH = "death",
  COMPANY_CLOSURE = "company_closure",
  CONTRACT_END = "contract_end",
  MUTUAL_AGREEMENT = "mutual_agreement",
  SUSPENSION = "suspension",
  OTHER = "other",
}

export enum EmploymentDepartureReason {
  RESIGNATION = "resignation",
  TERMINATION = "termination",
  RETIREMENT = "retirement",
  DEATH = "death",
  CONTRACT_END = "contract_end",
  MUTUAL_AGREEMENT = "mutual_agreement",
  REDUNDANCY = "redundancy",
  MEDICAL = "medical",
  OTHER = "other",
}

export enum CNSSMonthlySituation {
  ENTRANT = "entrant",
  SORTANT = "sortant",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  CORRECTION = "correction",
  OTHER = "other",
}

export enum PayrollAdjustmentType {
  SUPPLEMENT = "supplement",
  BONUS = "bonus",
  DEDUCTION = "deduction",
  PENALTY = "penalty",
  ADVANCE_RECOVERY = "advance_recovery",
  CORRECTION = "correction",
  OTHER = "other",
}

export enum PayrollAdjustmentDirection {
  ADDITION = "addition",
  DEDUCTION = "deduction",
}

export enum PayrollPaymentKind {
  ADVANCE = "advance",
  PARTIAL = "partial",
  FINAL = "final",
  ADJUSTMENT = "adjustment",
  OTHER = "other",
}

export enum PayrollStatus {
  DRAFT = "draft",
  CALCULATED = "calculated",
  APPROVED = "approved",
  PAID = "paid",
  CANCELLED = "cancelled",
}

export enum CNSSMonthlyStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  CORRECTED = "corrected",
}

export enum DocumentType {
  CIN = "cin",
  CNSS_DOCUMENT = "cnss_document",
  EMPLOYMENT_CONTRACT = "employment_contract",
  RIB_DOCUMENT = "rib_document",
  OTHER = "other",
}

// ============ Base Types ============

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
}

export interface SearchParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  [key: string]: string | number | boolean | undefined;
}

// ============ Personnel Person Types ============

export interface PersonnelPerson {
  is_archived: boolean;
  id: string;
  reference: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name: string;
  cin?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  region?: string;
  date_of_birth?: string;
  nationality?: string;
  status: PersonnelStatus;
  notes?: string;
  observations?: string;
  completeness_percentage: number;
  active_employments_count: number;
  has_active_cnss: boolean;
  is_on_leave?: boolean;
  display_status?: string;
  photo?: string | null;
  company: string | null;
  company_name?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface PersonnelPersonDetail extends PersonnelPerson {
  employments: Employment[];
  cnss_declarations: CNSSDeclaration[];
  documents: PersonnelDocumentReference[];
  completeness_report: CompletenessReport;
}

export interface PersonnelPersonCreate {
  photo?: File | null;
  first_name: string;
  last_name: string;
  middle_name?: string;
  cin?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  region?: string;
  date_of_birth?: string;
  nationality?: string;
  status?: PersonnelStatus;
  notes?: string;
  observations?: string;
  company?: string | null;
}

export interface PersonnelPersonUpdate extends Partial<PersonnelPersonCreate> {}

export interface CompletenessReport {
  overall: number;
  identity: {
    complete: boolean;
    missing: string[];
  };
  employment: {
    complete: boolean;
    missing: string[];
  };
  payment: {
    complete: boolean;
    missing: string[];
  };
  cnss: {
    complete: boolean;
    missing: string[];
  };
}

// ============ Employment Types ============

export interface Employment {
  is_archived: boolean;
  id: string;
  reference: string;
  person: string;
  person_name: string;
  company: string | null;
  company_name: string;
  employee_reference: string;
  job_title?: string;
  department?: string;
  work_domain?: string;
  work_city?: string;
  contract_type: ContractType;
  employment_status: EmploymentStatus;
  hire_date: string | null;
  employment_end_date?: string | null;
  departure_reason?: EmploymentDepartureReason | null;
  resignation_date?: string | null;
  payment_method?: string | null;
  payout_method?: "cash" | "bank";
  rib?: string;
  is_on_leave?: boolean;
  display_status?: string;
  default_monthly_working_days: number;
  /**
   * Per-employee day pricing. `null` means the rate is derived from
   * gross salary / scheduled working days, which is the default for every
   * employment that has not been given an explicit price.
   */
  worked_day_rate?: string | number | null;
  absence_day_rate?: string | number | null;
  authorized_leave_days_per_year?: number;
  remaining_leave_days?: number;
  observations?: string;
  is_active: boolean;
  current_salary?: EmploymentSalary;
  is_multi_company: boolean;
  salaries?: EmploymentSalary[];
  payroll_records?: MonthlyPayrollRecord[];
  cnss_declarations?: CNSSDeclaration[];
  current_salary_detail?: EmploymentSalary;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export enum EmploymentStatus {
  ACTIVE = "active",
  ON_LEAVE = "on_leave",
  SUSPENDED = "suspended",
  RESIGNED = "resigned",
  TERMINATED = "terminated",
  RETIRED = "retired",
  FORMER = "former",
  CNSS_ONLY = "cnss_only",
  OTHER = "other",
}

export interface EmploymentCreate {
  person: string;
  company: string | null;
  employee_reference: string;
  job_title?: string;
  department?: string;
  work_domain?: string;
  work_city?: string;
  contract_type: ContractType;
  employment_status: EmploymentStatus;
  hire_date: string;
  employment_end_date?: string;
  departure_reason?: EmploymentDepartureReason;
  resignation_date?: string;
  payment_method?: string;
  payout_method?: "cash" | "bank";
  rib?: string;
  default_monthly_working_days: number;
  authorized_leave_days_per_year?: number;
  /** null clears the rate and restores the derived default. */
  worked_day_rate?: number | null;
  absence_day_rate?: number | null;
  observations?: string;
}

export interface EmploymentUpdate extends Partial<EmploymentCreate> {}

// ============ Salary Types ============

export interface EmploymentSalary {
  is_archived: boolean;
  id: string;
  reference: string;
  employment: string;
  person: string;
  employment_reference: string;
  person_name: string;
  company_name: string;
  fixed_monthly_gross_salary: number;
  effective_from: string;
  effective_to?: string;
  is_current: boolean;
  reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface EmploymentSalaryCreate {
  employment: string;
  fixed_monthly_gross_salary: number;
  effective_from: string;
  effective_to?: string;
  reason?: string;
  notes?: string;
}

export interface EmploymentSalaryUpdate
  extends Partial<EmploymentSalaryCreate> {}

// ============ Payroll Types ============

export interface MonthlyPayrollRecord {
  is_archived: boolean;
  id: string;
  reference: string;
  employment: string;
  employee_reference: string;
  employee_name: string;
  company_name: string;
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  scheduled_working_days: number;
  worked_days: number;
  absence_days: number;
  authorized_leave_days: number;
  unpaid_leave_days: number;
  declared_days: number;
  gross_salary_snapshot: number;
  daily_rate: number;
  absence_deduction: number;
  supplements_total: number;
  other_deductions_total: number;
  calculated_net_salary: number;
  total_paid: number;
  remaining_amount: number;
  payment_status: string;
  status: PayrollStatus;
  notes?: string;
  observations?: string;
  calculated_at?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  adjustments?: PayrollAdjustment[];
  payments?: PayrollPayment[];
  adjustments_total?: { additions: number; deductions: number; net: number };
}

export interface MonthlyPayrollRecordCreate {
  employment: string;
  year: number;
  month: number;
  scheduled_working_days: number;
  worked_days?: number;
  absence_days?: number;
  authorized_leave_days?: number;
  unpaid_leave_days?: number;
  notes?: string;
  observations?: string;
}

export interface MonthlyPayrollRecordUpdate
  extends Partial<MonthlyPayrollRecordCreate> {}

export interface PayrollCalculationResult {
  gross_salary_snapshot: number;
  daily_rate: number;
  absence_deduction: number;
  supplements: number;
  deductions: number;
  calculated_net_salary: number;
  declared_days: number;
}

// ============ Adjustment Types ============

export interface PayrollAdjustment {
  id: string;
  reference: string;
  payroll_record: string;
  adjustment_type: PayrollAdjustmentType;
  direction: PayrollAdjustmentDirection;
  amount: number;
  signed_amount: number;
  effective_date: string;
  description: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollAdjustmentCreate {
  payroll_record: string;
  adjustment_type: PayrollAdjustmentType;
  direction: PayrollAdjustmentDirection;
  amount: number;
  effective_date: string;
  description: string;
  notes?: string;
}

export interface PayrollAdjustmentUpdate
  extends Partial<PayrollAdjustmentCreate> {}

// ============ Payment Types ============

export interface PayrollPayment {
  id: string;
  reference: string;
  payroll_record: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  payment_method_name?: string;
  payment_kind: PayrollPaymentKind;
  notes?: string;
  observations?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollPaymentCreate {
  payroll_record: string;
  payment_date: string;
  amount: number;
  payment_kind: PayrollPaymentKind;
  payment_method?: string;
  notes?: string;
  observations?: string;
}

export interface PayrollPaymentUpdate extends Partial<PayrollPaymentCreate> {}

// ============ CNSS Types ============

export interface CNSSDeclaration {
  is_archived: boolean;
  id: string;
  reference: string;
  person: string;
  person_name: string;
  person_cin?: string;
  person_email?: string;
  company: string;
  company_name: string;
  employment?: string;
  employment_reference?: string;
  export_cnss_registration_number?: string;
  cnss_registration_number: string;
  situation: CNSSSituation;
  is_cnss_only: boolean;
  first_declaration_date: string;
  declaration_start_date: string;
  declaration_stop_date?: string;
  resignation_date?: string;
  stop_reason?: CNSSStopReason;
  observations?: string;
  current_declaration_state: CNSSMonthlySituation;
  has_active_monthly: boolean;
  monthly_declarations?: CNSSMonthlyDeclaration[];
  documents?: PersonnelDocumentReference[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CNSSDeclarationCreate {
  person: string;
  company: string;
  employment?: string;
  cnss_registration_number: string;
  situation: CNSSSituation;
  first_declaration_date: string;
  declaration_start_date: string;
  declaration_stop_date?: string;
  resignation_date?: string;
  stop_reason?: CNSSStopReason;
  observations?: string;
}

export interface CNSSDeclarationUpdate extends Partial<CNSSDeclarationCreate> {}

export interface CNSSMonthlyDeclaration {
  is_archived: boolean;
  id: string;
  reference: string;
  cnss_declaration: string;
  cnss_declaration_reference: string;
  year: number;
  month: number;
  declared_days: number;
  declared_salary: number;
  situation: CNSSMonthlySituation;
  status: CNSSMonthlyStatus;
  submission_date?: string;
  notes?: string;
  observations?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CNSSMonthlyDeclarationCreate {
  cnss_declaration: string;
  year: number;
  month: number;
  declared_days: number;
  declared_salary: number;
  situation: CNSSMonthlySituation;
  notes?: string;
  observations?: string;
}

export interface CNSSMonthlyDeclarationUpdate
  extends Partial<CNSSMonthlyDeclarationCreate> {}

// ============ Document Types ============

export interface PersonnelDocumentReference {
  id: string;
  reference: string;
  person: string;
  person_name?: string;
  employment?: string | null;
  cnss_declaration?: string | null;
  document_type: DocumentType;
  document_type_label?: string;
  external_reference?: string;
  issue_date?: string;
  expiry_date?: string;
  file_name?: string;
  content_type?: string;
  size_bytes?: number;
  download_url?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PersonnelDocumentReferenceCreate {
  person: string;
  document_type: DocumentType;
  employment?: string;
  cnss_declaration?: string;
  external_reference?: string;
  issue_date?: string;
  expiry_date?: string;
  notes?: string;
}

// ============ Report Types ============

export interface CNSSReportRow {
  company: string;
  company_reference: string;
  cnss_registration_number: string;
  last_name: string;
  first_name: string;
  full_name: string;
  declared_days: number;
  cin: string;
  situation: CNSSMonthlySituation;
  first_declaration_date: string;
  declaration_start_date: string;
  declaration_stop_date?: string;
  resignation_date?: string;
  current_declaration_state: CNSSMonthlySituation;
  observation?: string;
}

export interface PayrollReportRow {
  company: string;
  company_reference: string;
  work_domain: string;
  work_city: string;
  department: string;
  employee_reference: string;
  last_name: string;
  first_name: string;
  full_name: string;
  cin: string;
  phone: string;
  hire_date: string;
  payroll_month: string;
  scheduled_days: number;
  worked_days: number;
  absence_days: number;
  declared_days: number;
  fixed_gross_salary: number;
  gross_salary_snapshot: number;
  supplements: number;
  deductions: number;
  calculated_net_salary: number;
  total_paid: number;
  remaining_amount: number;
  rib: string;
  payment_method: string;
  payroll_status: PayrollStatus;
  observation?: string;
}

export type ReportType = "cnss_monthly" | "payroll_monthly";

export interface ReportFilters {
  year: number;
  month: number;
  company_ids?: string[];
  personnel_ids?: string[];
  report_type: ReportType;
  output_format?: "xlsx" | "pdf" | "csv";
  /**
   * Optional printed-form layout (v17.25). Omitted means the wide default
   * export, which analysts rely on; "declaration" and "monthly_list"
   * reproduce the two paper forms the office files each month.
   */
  template?: "declaration" | "monthly_list";
}

export interface ReportPreviewResponse {
  rows: CNSSReportRow[] | PayrollReportRow[];
  count: number;
}

export interface ReportExportRequest {
  year: number;
  month: number;
  report_type: ReportType;
  company_ids?: string[];
  personnel_ids?: string[];
  output_format: "xlsx" | "pdf" | "csv";
}

// ============ Company & Personnel Select Types ============

export interface CompanySelectOption {
  id: string;
  name: string;
  reference: string;
  rib?: string;
}

export interface PersonnelSelectOption {
  id: string;
  name: string;
  reference: string;
  cin?: string;
  current_company?: string;
}

// ============ Dashboard Types ============

export interface DashboardSummary {
  totalPersonnel: number;
  activeEmployees: number;
  cnssDeclared: number;
  notDeclared: number;
  cnssOnly: number;
  multiCompany: number;
  incomplete: number;
  archivedPersonnel: number;
  monthlyPayroll: number;
  pendingPayments: number;
  recentlyUpdated?: RecentlyUpdatedPersonnel[];
  payrollRequiringAttention?: PayrollAttentionItem[];
  cnssRequiringAttention?: CNSSAttentionItem[];
  incompleteRecords?: IncompleteRecordItem[];
}

export interface RecentlyUpdatedPersonnel {
  id: string;
  reference: string;
  full_name: string;
  updated_at: string;
}

export interface PayrollAttentionItem {
  id: string;
  reference: string;
  person_name: string;
  payroll_month: string;
  status: PayrollStatus;
  remaining_amount: number;
}

export interface CNSSAttentionItem {
  id: string;
  reference: string;
  person_name: string;
  company_name: string;
  situation: CNSSMonthlySituation;
  status: CNSSMonthlyStatus;
}

export interface IncompleteRecordItem {
  id: string;
  reference: string;
  full_name: string;
  completeness_percentage: number;
  missing_sections: string[];
}
