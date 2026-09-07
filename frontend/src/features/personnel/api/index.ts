// src/features/personnel/api/index.ts
/**
 * Personnel API Client
 * Centralized API endpoints for the Personnel feature
 */

import { apiClient } from "@/lib/api";
import { sourceText } from "@/lib/i18n/source-catalog";
import {
  PersonnelPerson,
  PersonnelPersonDetail,
  PersonnelPersonCreate,
  PersonnelPersonUpdate,
  CompletenessReport,
  Employment,
  EmploymentCreate,
  EmploymentUpdate,
  EmploymentSalary,
  EmploymentSalaryCreate,
  EmploymentSalaryUpdate,
  MonthlyPayrollRecord,
  MonthlyPayrollRecordCreate,
  MonthlyPayrollRecordUpdate,
  PayrollCalculationResult,
  PayrollAdjustment,
  PayrollAdjustmentCreate,
  PayrollAdjustmentUpdate,
  PayrollPayment,
  PayrollPaymentCreate,
  PayrollPaymentUpdate,
  CNSSDeclaration,
  CNSSDeclarationCreate,
  CNSSDeclarationUpdate,
  CNSSMonthlyDeclaration,
  CNSSMonthlyDeclarationCreate,
  CNSSMonthlyDeclarationUpdate,
  PersonnelDocumentReference,
  PersonnelDocumentReferenceCreate,
  CNSSReportRow,
  PayrollReportRow,
  ReportFilters,
  ReportPreviewResponse,
  CompanySelectOption,
  PersonnelSelectOption,
  DashboardSummary,
  PaginatedResponse,
  SearchParams,
  PayrollStatus,
  CNSSMonthlyStatus,
  CNSSMonthlySituation,
  CNSSSituation,
  PersonnelStatus,
  EmploymentStatus,
  PayrollAdjustmentType,
  PayrollAdjustmentDirection,
  PayrollPaymentKind,
  ContractType,
  DocumentType,
  CNSSStopReason,
} from "../types";

// ============ Query Keys ============

export const personnelQueryKeys = {
  all: ["personnel"] as const,
  lists: () => [...personnelQueryKeys.all, "list"] as const,
  list: (params: SearchParams) =>
    [...personnelQueryKeys.lists(), params] as const,
  details: () => [...personnelQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...personnelQueryKeys.details(), id] as const,
  completeness: (id: string) =>
    [...personnelQueryKeys.detail(id), "completeness"] as const,
  search: (query: string) =>
    [...personnelQueryKeys.all, "search", query] as const,
  dashboard: (month?: string) =>
    [...personnelQueryKeys.all, "dashboard", month] as const,
  companies: () => [...personnelQueryKeys.all, "companies"] as const,
  personnel: (params?: SearchParams) =>
    [...personnelQueryKeys.all, "personnel-select", params] as const,
} as const;

export const employmentQueryKeys = {
  all: ["employments"] as const,
  lists: () => [...employmentQueryKeys.all, "list"] as const,
  list: (params: SearchParams) =>
    [...employmentQueryKeys.lists(), params] as const,
  details: () => [...employmentQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...employmentQueryKeys.details(), id] as const,
  byPerson: (personId: string) =>
    [...employmentQueryKeys.all, "by-person", personId] as const,
  byCompany: (companyId: string) =>
    [...employmentQueryKeys.all, "by-company", companyId] as const,
  salaries: (employmentId: string) =>
    [...employmentQueryKeys.detail(employmentId), "salaries"] as const,
} as const;

export const payrollQueryKeys = {
  all: ["payrolls"] as const,
  lists: () => [...payrollQueryKeys.all, "list"] as const,
  list: (params: SearchParams) =>
    [...payrollQueryKeys.lists(), params] as const,
  details: () => [...payrollQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...payrollQueryKeys.details(), id] as const,
  byEmployment: (employmentId: string) =>
    [...payrollQueryKeys.all, "by-employment", employmentId] as const,
  adjustments: (payrollId: string) =>
    [...payrollQueryKeys.detail(payrollId), "adjustments"] as const,
  payments: (payrollId: string) =>
    [...payrollQueryKeys.detail(payrollId), "payments"] as const,
  calculate: (payrollId: string) =>
    [...payrollQueryKeys.detail(payrollId), "calculate"] as const,
  bulkCreate: () => [...payrollQueryKeys.all, "bulk-create"] as const,
  bulkCalculate: () => [...payrollQueryKeys.all, "bulk-calculate"] as const,
  bulkApprove: () => [...payrollQueryKeys.all, "bulk-approve"] as const,
} as const;

export const cnssQueryKeys = {
  all: ["cnss"] as const,
  declarations: () => [...cnssQueryKeys.all, "declarations"] as const,
  declarationList: (params: SearchParams) =>
    [...cnssQueryKeys.declarations(), "list", params] as const,
  declarationDetail: (id: string) =>
    [...cnssQueryKeys.declarations(), "detail", id] as const,
  monthly: () => [...cnssQueryKeys.all, "monthly"] as const,
  monthlyList: (params: SearchParams) =>
    [...cnssQueryKeys.monthly(), "list", params] as const,
  monthlyDetail: (id: string) =>
    [...cnssQueryKeys.monthly(), "detail", id] as const,
  byPerson: (personId: string) =>
    [...cnssQueryKeys.all, "by-person", personId] as const,
  byCompany: (companyId: string) =>
    [...cnssQueryKeys.all, "by-company", companyId] as const,
  submit: (id: string) =>
    [...cnssQueryKeys.monthlyDetail(id), "submit"] as const,
  correct: (id: string) =>
    [...cnssQueryKeys.monthlyDetail(id), "correct"] as const,
  stop: (id: string) =>
    [...cnssQueryKeys.declarationDetail(id), "stop"] as const,
  restart: (id: string) =>
    [...cnssQueryKeys.declarationDetail(id), "restart"] as const,
} as const;

export const reportsQueryKeys = {
  all: ["reports"] as const,
  types: () => [...reportsQueryKeys.all, "types"] as const,
  preview: (filters: ReportFilters) =>
    [...reportsQueryKeys.all, "preview", filters] as const,
  export: (filters: ReportFilters) =>
    [...reportsQueryKeys.all, "export", filters] as const,
} as const;

// ============ API Functions ============

// --- Personnel Person ---

export const personnelApi = {
  // List with pagination, search, filtering
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<PersonnelPerson>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<PersonnelPerson>>(
      `/personnel/persons/?${searchParams.toString()}`,
    );
    return response;
  },

  // Get single person with full details
  get: async (id: string): Promise<PersonnelPersonDetail> => {
    const response = await apiClient.get<PersonnelPersonDetail>(
      `/personnel/persons/${id}/`,
    );
    return response;
  },

  // Create new person
  // apiClient.post/patch already return the response body (they unwrap
  // `.data` internally, see lib/api.ts), so a further `?.data` here resolved
  // to undefined on every successful photo upload rather than the saved person.
  createWithPhoto: async (formData: FormData): Promise<PersonnelPerson> =>
    await apiClient.post<PersonnelPerson>("/personnel/persons/", formData),
  updateWithPhoto: async (id: string, formData: FormData): Promise<PersonnelPerson> =>
    await apiClient.patch<PersonnelPerson>(`/personnel/persons/${id}/`, formData),
  create: async (data: PersonnelPersonCreate): Promise<PersonnelPerson> => {
    const response = await apiClient.post<PersonnelPerson>(
      "/personnel/persons/",
      data,
    );
    return response;
  },

  // Update person
  update: async (
    id: string,
    data: PersonnelPersonUpdate,
  ): Promise<PersonnelPerson> => {
    const response = await apiClient.patch<PersonnelPerson>(
      `/personnel/persons/${id}/`,
      data,
    );
    return response;
  },

  // Archive person
  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/persons/${id}/archive/`,
      { reason },
    );
    return response;
  },

  // Restore archived person
  restore: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/persons/${id}/restore/`,
    );
    return response;
  },

  // Permanently delete a person (Administrator-only, confirmation-gated on the backend)
  permanentDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/persons/${id}/permanent/`, {
      data: { confirm: true },
    });
  },

  // Export personnel list
  export: async (
    params: SearchParams = {},
    format: "csv" | "xlsx" = "xlsx",
  ): Promise<Blob> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    searchParams.append("output_format", format);
    const response = await apiClient.post(
      `/personnel/persons/export/?${searchParams.toString()}`,
      {},
      { responseType: "blob" },
    );
    return response as Blob;
  },

  // Get completeness report
  getCompleteness: async (id: string): Promise<CompletenessReport> => {
    const response = await apiClient.get<CompletenessReport>(
      `/personnel/persons/${id}/completeness/`,
    );
    return response;
  },

  // Search personnel (for selects)
  search: async (query: string): Promise<{ results: PersonnelPerson[] }> => {
    const response = await apiClient.get<{ results: PersonnelPerson[] }>(
      `/personnel/persons/search/?q=${encodeURIComponent(query)}`,
    );
    return response;
  },
};

// --- Employment ---

export const employmentApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<Employment>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<Employment>>(
      `/personnel/employments/?${searchParams.toString()}`,
    );
    return response;
  },

  get: async (id: string): Promise<Employment> => {
    const response = await apiClient.get<Employment>(
      `/personnel/employments/${id}/`,
    );
    return response;
  },

  create: async (data: EmploymentCreate): Promise<Employment> => {
    const response = await apiClient.post<Employment>(
      "/personnel/employments/",
      data,
    );
    return response;
  },

  update: async (id: string, data: EmploymentUpdate): Promise<Employment> => {
    const response = await apiClient.patch<Employment>(
      `/personnel/employments/${id}/`,
      data,
    );
    return response;
  },

  terminate: async (
    id: string,
    data: { departure_reason?: string; resignation_date?: string },
  ): Promise<Employment> => {
    const response = await apiClient.post<Employment>(
      `/personnel/employments/${id}/terminate/`,
      data,
    );
    return response;
  },

  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/employments/${id}/archive/`,
      { reason },
    );
    return response;
  },

  restore: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/employments/${id}/restore/`,
    );
    return response;
  },
  permanentDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/employments/${id}/permanent/`, {
      data: { confirm: true },
    });
  },

  getByPerson: async (personId: string): Promise<Employment[]> => {
    const response = await apiClient.get<PaginatedResponse<Employment>>(
      `/personnel/employments/?person=${personId}`,
    );
    return response.results;
  },

  getByCompany: async (companyId: string): Promise<Employment[]> => {
    const response = await apiClient.get<PaginatedResponse<Employment>>(
      `/personnel/employments/?company=${companyId}`,
    );
    return response.results;
  },

  // Export employments list (backs the list-page export buttons)
  export: async (
    params: SearchParams = {},
    format: "csv" | "xlsx" = "xlsx",
  ): Promise<Blob> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    searchParams.append("output_format", format);
    const response = await apiClient.post(
      `/personnel/employments/export/?${searchParams.toString()}`,
      {},
      { responseType: "blob" },
    );
    return response as Blob;
  },
};

// --- Employment Salary ---

export const salaryApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<EmploymentSalary>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<EmploymentSalary>>(
      `/personnel/salaries/?${searchParams.toString()}`,
    );
    return response;
  },

  get: async (id: string): Promise<EmploymentSalary> => {
    const response = await apiClient.get<EmploymentSalary>(
      `/personnel/salaries/${id}/`,
    );
    return response;
  },

  create: async (data: EmploymentSalaryCreate): Promise<EmploymentSalary> => {
    const response = await apiClient.post<EmploymentSalary>(
      "/personnel/salaries/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: EmploymentSalaryUpdate,
  ): Promise<EmploymentSalary> => {
    const response = await apiClient.patch<EmploymentSalary>(
      `/personnel/salaries/${id}/`,
      data,
    );
    return response;
  },

  setCurrent: async (id: string): Promise<EmploymentSalary> => {
    const response = await apiClient.post<EmploymentSalary>(
      `/personnel/salaries/${id}/set_current/`,
    );
    return response;
  },

  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>(
      `/personnel/salaries/${id}/archive/`,
      { reason },
    );
  },

  restore: async (id: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>(
      `/personnel/salaries/${id}/restore/`,
      {},
    );
  },

  permanentDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/salaries/${id}/permanent/`, {
      data: { confirm: true },
    });
  },

  getByEmployment: async (
    employmentId: string,
  ): Promise<EmploymentSalary[]> => {
    const response = await apiClient.get<PaginatedResponse<EmploymentSalary>>(
      `/personnel/salaries/?employment=${employmentId}`,
    );
    return response.results;
  },

  export: async (
    params: SearchParams = {},
    format: "csv" | "xlsx" = "xlsx",
  ): Promise<Blob> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    searchParams.append("output_format", format);
    const response = await apiClient.post(
      `/personnel/salaries/export/?${searchParams.toString()}`,
      {},
      { responseType: "blob" },
    );
    return response as Blob;
  },
};

// --- Monthly Payroll ---

export const payrollApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<MonthlyPayrollRecord>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<
      PaginatedResponse<MonthlyPayrollRecord>
    >(`/personnel/payrolls/?${searchParams.toString()}`);
    return response;
  },

  get: async (id: string): Promise<MonthlyPayrollRecord> => {
    const response = await apiClient.get<MonthlyPayrollRecord>(
      `/personnel/payrolls/${id}/`,
    );
    return response;
  },

  create: async (
    data: MonthlyPayrollRecordCreate,
  ): Promise<MonthlyPayrollRecord> => {
    const response = await apiClient.post<MonthlyPayrollRecord>(
      "/personnel/payrolls/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: MonthlyPayrollRecordUpdate,
  ): Promise<MonthlyPayrollRecord> => {
    const response = await apiClient.patch<MonthlyPayrollRecord>(
      `/personnel/payrolls/${id}/`,
      data,
    );
    return response;
  },

  calculate: async (id: string): Promise<MonthlyPayrollRecord> => {
    const response = await apiClient.post<MonthlyPayrollRecord>(
      `/personnel/payrolls/${id}/calculate/`,
    );
    return response;
  },

  approve: async (id: string): Promise<MonthlyPayrollRecord> => {
    const response = await apiClient.post<MonthlyPayrollRecord>(
      `/personnel/payrolls/${id}/approve/`,
    );
    return response;
  },

  recalculate: async (
    id: string,
    daily_rate_override?: number | null,
    absence_rate_override?: number | null,
  ): Promise<MonthlyPayrollRecord> => {
    const body: Record<string, unknown> = {};
    if (daily_rate_override != null && daily_rate_override > 0) {
      body.daily_rate_override = daily_rate_override;
    }
    if (absence_rate_override != null && absence_rate_override > 0) {
      body.absence_rate_override = absence_rate_override;
    }
    const response = await apiClient.post<MonthlyPayrollRecord>(
      `/personnel/payrolls/${id}/recalculate/`,
      body,
    );
    return response;
  },

  getByEmployment: async (
    employmentId: string,
  ): Promise<MonthlyPayrollRecord[]> => {
    const response = await apiClient.get<
      PaginatedResponse<MonthlyPayrollRecord>
    >(`/personnel/payrolls/?employment=${employmentId}`);
    return response.results;
  },

  bulkCreate: async (data: {
    company_id: string;
    year: number;
    month: number;
    employment_ids?: string[];
  }): Promise<{
    created_count: number;
    skipped_count: number;
    records: MonthlyPayrollRecord[];
  }> => {
    const response = await apiClient.post<{
      created_count: number;
      skipped_count: number;
      records: MonthlyPayrollRecord[];
    }>("/personnel/payrolls/bulk_create/", data);
    return response;
  },

  bulkCalculate: async (data: {
    payroll_ids?: string[];
    company_id?: string;
    year?: number;
    month?: number;
  }): Promise<{
    calculated_count: number;
    records: MonthlyPayrollRecord[];
  }> => {
    const response = await apiClient.post<{
      calculated_count: number;
      records: MonthlyPayrollRecord[];
    }>("/personnel/payrolls/bulk_calculate/", data);
    return response;
  },

  bulkApprove: async (data: {
    payroll_ids?: string[];
    company_id?: string;
    year?: number;
    month?: number;
  }): Promise<{ approved_count: number; records: MonthlyPayrollRecord[] }> => {
    const response = await apiClient.post<{
      approved_count: number;
      records: MonthlyPayrollRecord[];
    }>("/personnel/payrolls/bulk_approve/", data);
    return response;
  },

  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/payrolls/${id}/archive/`,
      { reason },
    );
    return response;
  },

  restore: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/payrolls/${id}/restore/`,
    );
    return response;
  },
};

// --- Payroll Adjustments ---

export const adjustmentApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<PayrollAdjustment>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<PayrollAdjustment>>(
      `/personnel/adjustments/?${searchParams.toString()}`,
    );
    return response;
  },

  get: async (id: string): Promise<PayrollAdjustment> => {
    const response = await apiClient.get<PayrollAdjustment>(
      `/personnel/adjustments/${id}/`,
    );
    return response;
  },

  create: async (data: PayrollAdjustmentCreate): Promise<PayrollAdjustment> => {
    const response = await apiClient.post<PayrollAdjustment>(
      "/personnel/adjustments/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: PayrollAdjustmentUpdate,
  ): Promise<PayrollAdjustment> => {
    const response = await apiClient.patch<PayrollAdjustment>(
      `/personnel/adjustments/${id}/`,
      data,
    );
    return response;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/adjustments/${id}/`);
  },

  getByPayroll: async (payrollId: string): Promise<PayrollAdjustment[]> => {
    const response = await apiClient.get<PaginatedResponse<PayrollAdjustment>>(
      `/personnel/adjustments/?payroll_record=${payrollId}`,
    );
    return response.results;
  },
};

// --- Payroll Payments ---

export const paymentApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<PayrollPayment>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<PayrollPayment>>(
      `/personnel/payments/?${searchParams.toString()}`,
    );
    return response;
  },

  get: async (id: string): Promise<PayrollPayment> => {
    const response = await apiClient.get<PayrollPayment>(
      `/personnel/payments/${id}/`,
    );
    return response;
  },

  create: async (data: PayrollPaymentCreate): Promise<PayrollPayment> => {
    const response = await apiClient.post<PayrollPayment>(
      "/personnel/payments/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: PayrollPaymentUpdate,
  ): Promise<PayrollPayment> => {
    const response = await apiClient.patch<PayrollPayment>(
      `/personnel/payments/${id}/`,
      data,
    );
    return response;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/payments/${id}/`);
  },

  getByPayroll: async (payrollId: string): Promise<PayrollPayment[]> => {
    const response = await apiClient.get<PaginatedResponse<PayrollPayment>>(
      `/personnel/payments/?payroll_record=${payrollId}`,
    );
    return response.results;
  },

  recordAdvance: async (
    payrollId: string,
    data: {
      amount: number;
      payment_date: string;
      payment_method?: string;
      reference_number?: string;
      notes?: string;
    },
  ): Promise<PayrollPayment> => {
    const { reference_number, ...rest } = data;
    const response = await apiClient.post<PayrollPayment>(
      `/personnel/payrolls/${payrollId}/record_payment/`,
      { ...rest, reference: reference_number, payment_kind: "advance" },
    );
    return response;
  },

  recordPartial: async (
    payrollId: string,
    data: {
      amount: number;
      payment_date: string;
      payment_method?: string;
      reference_number?: string;
      notes?: string;
    },
  ): Promise<PayrollPayment> => {
    const { reference_number, ...rest } = data;
    const response = await apiClient.post<PayrollPayment>(
      `/personnel/payrolls/${payrollId}/record_payment/`,
      { ...rest, reference: reference_number, payment_kind: "partial_payment" },
    );
    return response;
  },

  recordFinal: async (
    payrollId: string,
    data: {
      amount: number;
      payment_date: string;
      payment_method?: string;
      reference_number?: string;
      notes?: string;
    },
  ): Promise<PayrollPayment> => {
    const { reference_number, ...rest } = data;
    const response = await apiClient.post<PayrollPayment>(
      `/personnel/payrolls/${payrollId}/record_payment/`,
      { ...rest, reference: reference_number, payment_kind: "final_payment" },
    );
    return response;
  },
};

// --- CNSS Declarations ---

export const cnssApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<CNSSDeclaration>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<CNSSDeclaration>>(
      `/personnel/cnss/?${searchParams.toString()}`,
    );
    return response;
  },

  get: async (id: string): Promise<CNSSDeclaration> => {
    const response = await apiClient.get<CNSSDeclaration>(
      `/personnel/cnss/${id}/`,
    );
    return response;
  },

  create: async (data: CNSSDeclarationCreate): Promise<CNSSDeclaration> => {
    const response = await apiClient.post<CNSSDeclaration>(
      "/personnel/cnss/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: CNSSDeclarationUpdate,
  ): Promise<CNSSDeclaration> => {
    const response = await apiClient.patch<CNSSDeclaration>(
      `/personnel/cnss/${id}/`,
      data,
    );
    return response;
  },

  stop: async (
    id: string,
    data: { stop_reason: CNSSStopReason; stop_date?: string; notes?: string },
  ): Promise<CNSSDeclaration> => {
    const response = await apiClient.post<CNSSDeclaration>(
      `/personnel/cnss/${id}/stop/`,
      data,
    );
    return response;
  },

  restart: async (
    id: string,
    data: { restart_date: string; notes?: string },
  ): Promise<CNSSDeclaration> => {
    const response = await apiClient.post<CNSSDeclaration>(
      `/personnel/cnss/${id}/restart/`,
      data,
    );
    return response;
  },

  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/cnss/${id}/archive/`,
      { reason },
    );
    return response;
  },

  restore: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/personnel/cnss/${id}/restore/`,
    );
    return response;
  },

  getByPerson: async (personId: string): Promise<CNSSDeclaration[]> => {
    const response = await apiClient.get<PaginatedResponse<CNSSDeclaration>>(
      `/personnel/cnss/?person=${personId}`,
    );
    return response.results;
  },

  getByCompany: async (companyId: string): Promise<CNSSDeclaration[]> => {
    const response = await apiClient.get<PaginatedResponse<CNSSDeclaration>>(
      `/personnel/cnss/?company=${companyId}`,
    );
    return response.results;
  },
};

// --- CNSS Monthly Declarations ---

export const cnssMonthlyApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<CNSSMonthlyDeclaration>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<
      PaginatedResponse<CNSSMonthlyDeclaration>
    >(`/personnel/cnss-monthly/?${searchParams.toString()}`);
    return response;
  },

  get: async (id: string): Promise<CNSSMonthlyDeclaration> => {
    const response = await apiClient.get<CNSSMonthlyDeclaration>(
      `/personnel/cnss-monthly/${id}/`,
    );
    return response;
  },

  create: async (
    data: CNSSMonthlyDeclarationCreate,
  ): Promise<CNSSMonthlyDeclaration> => {
    const response = await apiClient.post<CNSSMonthlyDeclaration>(
      "/personnel/cnss-monthly/",
      data,
    );
    return response;
  },

  update: async (
    id: string,
    data: CNSSMonthlyDeclarationUpdate,
  ): Promise<CNSSMonthlyDeclaration> => {
    const response = await apiClient.patch<CNSSMonthlyDeclaration>(
      `/personnel/cnss-monthly/${id}/`,
      data,
    );
    return response;
  },

  submit: async (id: string): Promise<CNSSMonthlyDeclaration> => {
    const response = await apiClient.post<CNSSMonthlyDeclaration>(
      `/personnel/cnss-monthly/${id}/submit/`,
    );
    return response;
  },

  correct: async (
    id: string,
    data: { correction_note?: string },
  ): Promise<CNSSMonthlyDeclaration> => {
    const response = await apiClient.post<CNSSMonthlyDeclaration>(
      `/personnel/cnss-monthly/${id}/correct/`,
      data,
    );
    return response;
  },

  getByCnssDeclaration: async (
    cnssDeclarationId: string,
  ): Promise<CNSSMonthlyDeclaration[]> => {
    const response = await apiClient.get<
      PaginatedResponse<CNSSMonthlyDeclaration>
    >(`/personnel/cnss-monthly/?cnss_declaration=${cnssDeclarationId}`);
    return response.results;
  },

  getByPeriod: async (
    year: number,
    month: number,
  ): Promise<CNSSMonthlyDeclaration[]> => {
    const response = await apiClient.get<
      PaginatedResponse<CNSSMonthlyDeclaration>
    >(`/personnel/cnss-monthly/?year=${year}&month=${month}`);
    return response.results;
  },
};

// --- Documents ---

export const documentApi = {
  list: async (
    params: SearchParams = {},
  ): Promise<PaginatedResponse<PersonnelDocumentReference>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<
      PaginatedResponse<PersonnelDocumentReference>
    >(`/personnel/documents/?${searchParams.toString()}`);
    return response;
  },

  get: async (id: string): Promise<PersonnelDocumentReference> => {
    const response = await apiClient.get<PersonnelDocumentReference>(
      `/personnel/documents/${id}/`,
    );
    return response;
  },

  create: async (
    data: PersonnelDocumentReferenceCreate & { file?: File },
  ): Promise<PersonnelDocumentReference> => {
    const { file, ...fields } = data;
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== "") body.append(key, String(value));
    });
    if (file) body.append("file", file);
    const response = await apiClient.post<PersonnelDocumentReference>(
      "/personnel/documents/",
      body,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response;
  },

  update: async (
    id: string,
    data: Partial<PersonnelDocumentReferenceCreate>,
  ): Promise<PersonnelDocumentReference> => {
    const response = await apiClient.patch<PersonnelDocumentReference>(
      `/personnel/documents/${id}/`,
      data,
    );
    return response;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/personnel/documents/${id}/`);
  },

  getByPerson: async (
    personId: string,
  ): Promise<PersonnelDocumentReference[]> => {
    const response = await apiClient.get<
      PaginatedResponse<PersonnelDocumentReference>
    >(`/personnel/documents/?person=${personId}`);
    return response.results;
  },
  download: async (document: PersonnelDocumentReference): Promise<void> => {
    if (!document.download_url) return;
    const blob = await apiClient.get<Blob>(document.download_url, {
      responseType: "blob",
    } as any);
    const url = window.URL.createObjectURL(blob as unknown as Blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download =
      document.file_name || sourceText("personnel_document_fallback_name");
    window.document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
    window.document.body.removeChild(anchor);
  },
};

// --- Reports ---

export const reportsApi = {
  getTypes: async (): Promise<{
    types: Array<{ id: string; name: string; description: string }>;
  }> => {
    const response = await apiClient.get<{
      types: Array<{ id: string; name: string; description: string }>;
    }>("/personnel/reports/types/");
    return response;
  },

  preview: async (filters: ReportFilters): Promise<ReportPreviewResponse> => {
    // Audit fix: this used to send output_format: 'json', which the backend
    // serializer rejects outright (choices are xlsx/pdf/csv) — every preview
    // request failed validation with a 400. The preview endpoint returns JSON
    // by nature; no format field is needed.
    const response = await apiClient.post<ReportPreviewResponse>(
      `/personnel/reports/${filters.report_type.replace(/_/g, "-")}/preview/`,
      {
        year: filters.year,
        month: filters.month,
        company_ids: filters.company_ids,
        personnel_ids: filters.personnel_ids,
      },
    );
    return response;
  },

  export: async (filters: ReportFilters): Promise<Blob> => {
    // Audit fix: the backend validates the body's report_type against the
    // underscore form ('payroll_monthly'), while the URL path uses the
    // hyphenated slug. Sending the hyphenated form in the body failed
    // validation with a 400, so every report export request broke.
    const response = await apiClient.post(
      `/personnel/reports/${filters.report_type.replace(/_/g, "-")}/export/`,
      {
        year: filters.year,
        month: filters.month,
        report_type: filters.report_type.replace(/-/g, "_"),
        company_ids: filters.company_ids,
        personnel_ids: filters.personnel_ids,
        output_format: filters.output_format || "xlsx",
        // v17.26: the file's column headers and sheet name follow the
        // language the user is reading the app in. Read from the document
        // rather than threaded through every caller, for the same reason the
        // list exports do it in buildExportQuery. The backend defaults to
        // English for anything it does not recognise, and refuses to
        // translate the two printed forms at all.
        lang: (typeof document !== "undefined" &&
          document.documentElement.lang) || "en",
      },
      { responseType: "blob" },
    );
    return response as Blob;
  },
};

// --- Company & Personnel Select Options ---

export const selectOptionsApi = {
  getCompanies: async (): Promise<CompanySelectOption[]> => {
    const response =
      await apiClient.get<CompanySelectOption[]>("/companies/select/");
    return response;
  },

  getPersonnel: async (
    params: SearchParams = {},
  ): Promise<PersonnelSelectOption[]> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PersonnelSelectOption[]>(
      `/personnel/persons/select/?${searchParams.toString()}`,
    );
    return response;
  },

  // Payment methods from the Configuration module ( Employment forms send the
  // FK id — a free-text value used to fail with a 400 ). The configuration
  // list endpoint is paginated, so unwrap `results` defensively.
  getPaymentMethods: async (): Promise<{ id: string; name: string }[]> => {
    const response = await apiClient.get<any>(
      "/configuration/payment-methods/?page_size=200",
    );
    const list = Array.isArray(response) ? response : (response?.results ?? []);
    return list.map((m: any) => ({ id: m.id, name: m.name }));
  },
};

// --- Dashboard ---

export const dashboardApi = {
  getSummary: async (month?: string): Promise<DashboardSummary> => {
    // The backend wraps the response: { success: true, data: {...} }
    const query = month ? `?month=${encodeURIComponent(month)}` : "";
    const response = await apiClient.get<{
      success: boolean;
      data: DashboardSummary;
    }>(`/personnel/reports/dashboard/${query}`);
    return response?.data;
  },
};

// --- Status Labels ---

// --- User Settings (per-user preferences; backend: accounts app) ---

export interface UserPreferences {
  defaultPageSize: string;
  defaultDensity: string;
  showArchivedByDefault: boolean;
  autoRefreshInterval: string;
  emailOnArchive: boolean;
  emailOnRestore: boolean;
  emailOnPayrollApproval: boolean;
  emailOnCNSSSubmission: boolean;
  defaultWorkingDays: number;
  autoCalculatePayroll: boolean;
  requirePayrollApproval: boolean;
  autoSubmitCNSS: boolean;
  cnssReminderDays: number;
  sessionTimeout: string;
  requireMFA: boolean;
  // View modes
  personnelViewMode?: "table" | "card";
  companiesViewMode?: "table" | "card";
  financialRecordsViewMode?: "table" | "card";
  inventoryViewMode?: "table" | "card";
  partiesViewMode?: "table" | "card";
  // Display
  sidebarCollapsed?: boolean;
  showTotalsInLists?: boolean;
  deadlineWarningDays?: number;
  highlightOverdue?: boolean;
  // Error behavior
  errorAutoRedirectSeconds?: "2" | "3" | "5" | "0";
  show404Details?: boolean;
}

interface PreferencesEnvelope {
  success: boolean;
  message: string;
  data: { preferences: UserPreferences };
}

export const settingsApi = {
  // Audit fix (limitations pass): the settings page previously kept state
  // local-only — Save showed a toast after a fake timeout and Reset did
  // nothing. These back the page with the real per-user endpoint.
  get: async (): Promise<UserPreferences> => {
    const envelope = await apiClient.get<PreferencesEnvelope>(
      "/accounts/me/preferences/",
    );
    return envelope?.data.preferences;
  },

  update: async (
    preferences: Partial<UserPreferences>,
  ): Promise<UserPreferences> => {
    const envelope = await apiClient.put<PreferencesEnvelope>(
      "/accounts/me/preferences/",
      { preferences },
    );
    return envelope?.data.preferences;
  },

  reset: async (): Promise<UserPreferences> => {
    const envelope = await apiClient.delete<PreferencesEnvelope>(
      "/accounts/me/preferences/",
    );
    return envelope?.data.preferences;
  },
};

export const statusLabels = {
  personnel: {
    [PersonnelStatus.ACTIVE]: "Active",
    [PersonnelStatus.INACTIVE]: "Inactive",
    [PersonnelStatus.SUSPENDED]: "Suspended",
    [PersonnelStatus.TERMINATED]: "Terminated",
    [PersonnelStatus.ARCHIVED]: "Archived",
  },
  employment: {
    [EmploymentStatus.ACTIVE]: "Active",
    [EmploymentStatus.ON_LEAVE]: "On Leave",
    [EmploymentStatus.SUSPENDED]: "Suspended",
    [EmploymentStatus.RESIGNED]: "Resigned",
    [EmploymentStatus.TERMINATED]: "Terminated",
    [EmploymentStatus.RETIRED]: "Retired",
    [EmploymentStatus.FORMER]: "Former",
    [EmploymentStatus.CNSS_ONLY]: "CNSS Only",
    [EmploymentStatus.OTHER]: "Other",
  },
  payroll: {
    [PayrollStatus.DRAFT]: "Draft",
    [PayrollStatus.CALCULATED]: "Calculated",
    [PayrollStatus.APPROVED]: "Approved",
    [PayrollStatus.PAID]: "Paid",
    [PayrollStatus.CANCELLED]: "Cancelled",
  },
  cnssMonthly: {
    [CNSSMonthlyStatus.DRAFT]: "Draft",
    [CNSSMonthlyStatus.SUBMITTED]: "Submitted",
    [CNSSMonthlyStatus.ACCEPTED]: "Accepted",
    [CNSSMonthlyStatus.REJECTED]: "Rejected",
    [CNSSMonthlyStatus.CORRECTED]: "Corrected",
  },
  cnssMonthlySituation: {
    [CNSSMonthlySituation.ENTRANT]: "Entrant",
    [CNSSMonthlySituation.SORTANT]: "Sortant",
    [CNSSMonthlySituation.ACTIVE]: "Active",
    [CNSSMonthlySituation.SUSPENDED]: "Suspended",
    [CNSSMonthlySituation.CORRECTION]: "Correction",
    [CNSSMonthlySituation.OTHER]: "Other",
  },
  cnssSituation: {
    [CNSSSituation.DECLARED_BY_THIS_COMPANY]: "Declared by this Company",
    [CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER]:
      "Declared by Another Employer",
    [CNSSSituation.PERSONALLY_INSURED]: "Personally Insured",
    [CNSSSituation.NOT_DECLARED]: "Not Declared",
    [CNSSSituation.PENDING]: "Pending",
    [CNSSSituation.SUSPENDED]: "Suspended",
    [CNSSSituation.STOPPED]: "Stopped",
    [CNSSSituation.EXEMPT]: "Exempt",
    [CNSSSituation.UNKNOWN]: "Unknown",
    [CNSSSituation.OTHER]: "Other",
  },
  payrollAdjustmentType: {
    [PayrollAdjustmentType.SUPPLEMENT]: "Supplement",
    [PayrollAdjustmentType.BONUS]: "Bonus",
    [PayrollAdjustmentType.DEDUCTION]: "Deduction",
    [PayrollAdjustmentType.PENALTY]: "Penalty",
    [PayrollAdjustmentType.ADVANCE_RECOVERY]: "Advance Recovery",
    [PayrollAdjustmentType.CORRECTION]: "Correction",
    [PayrollAdjustmentType.OTHER]: "Other",
  },
  payrollAdjustmentDirection: {
    [PayrollAdjustmentDirection.ADDITION]: "Addition",
    [PayrollAdjustmentDirection.DEDUCTION]: "Deduction",
  },
  payrollPaymentKind: {
    [PayrollPaymentKind.ADVANCE]: "Advance",
    [PayrollPaymentKind.PARTIAL]: "Partial Payment",
    [PayrollPaymentKind.FINAL]: "Final Payment",
    [PayrollPaymentKind.ADJUSTMENT]: "Adjustment",
    [PayrollPaymentKind.OTHER]: "Other",
  },
  contractType: {
    [ContractType.PERMANENT]: "Permanent",
    [ContractType.FIXED_TERM]: "Fixed-term",
    [ContractType.TEMPORARY]: "Temporary",
    [ContractType.INTERNSHIP]: "Internship",
    [ContractType.APPRENTICESHIP]: "Apprenticeship",
    [ContractType.SEASONAL]: "Seasonal",
    [ContractType.PART_TIME]: "Part-time",
    [ContractType.OTHER]: "Other",
  },
  documentType: {
    [DocumentType.CIN]: "CIN",
    [DocumentType.CNSS_DOCUMENT]: "CNSS Document",
    [DocumentType.EMPLOYMENT_CONTRACT]: "Employment Contract",
    [DocumentType.RIB_DOCUMENT]: "RIB Document",
    [DocumentType.OTHER]: "Other",
  },
};

// --- Status Colors ---

export const statusColors = {
  personnel: {
    [PersonnelStatus.ACTIVE]: "bg-green-100 text-green-800",
    [PersonnelStatus.INACTIVE]: "bg-gray-100 text-gray-800",
    [PersonnelStatus.SUSPENDED]: "bg-yellow-100 text-yellow-800",
    [PersonnelStatus.TERMINATED]: "bg-red-100 text-red-800",
    [PersonnelStatus.ARCHIVED]: "bg-slate-100 text-slate-800",
  },
  employment: {
    [EmploymentStatus.ACTIVE]: "bg-blue-100 text-blue-800",
    [EmploymentStatus.ON_LEAVE]: "bg-blue-100 text-blue-800",
    [EmploymentStatus.SUSPENDED]: "bg-yellow-100 text-yellow-800",
    [EmploymentStatus.RESIGNED]: "bg-gray-100 text-gray-800",
    [EmploymentStatus.TERMINATED]: "bg-red-100 text-red-800",
    [EmploymentStatus.RETIRED]: "bg-purple-100 text-purple-800",
    [EmploymentStatus.FORMER]: "bg-gray-100 text-gray-800",
    [EmploymentStatus.CNSS_ONLY]: "bg-orange-100 text-orange-800",
    [EmploymentStatus.OTHER]: "bg-gray-100 text-gray-800",
  },
  payroll: {
    [PayrollStatus.DRAFT]: "bg-gray-100 text-gray-800",
    [PayrollStatus.CALCULATED]: "bg-blue-100 text-blue-800",
    [PayrollStatus.APPROVED]: "bg-green-100 text-green-800",
    [PayrollStatus.PAID]: "bg-emerald-100 text-emerald-800",
    [PayrollStatus.CANCELLED]: "bg-red-100 text-red-800",
  },
  cnssMonthly: {
    [CNSSMonthlyStatus.DRAFT]: "bg-gray-100 text-gray-800",
    [CNSSMonthlyStatus.SUBMITTED]: "bg-blue-100 text-blue-800",
    [CNSSMonthlyStatus.ACCEPTED]: "bg-green-100 text-green-800",
    [CNSSMonthlyStatus.REJECTED]: "bg-red-100 text-red-800",
    [CNSSMonthlyStatus.CORRECTED]: "bg-purple-100 text-purple-800",
  },
  cnssMonthlySituation: {
    [CNSSMonthlySituation.ENTRANT]: "bg-green-100 text-green-800",
    [CNSSMonthlySituation.SORTANT]: "bg-red-100 text-red-800",
    [CNSSMonthlySituation.ACTIVE]: "bg-blue-100 text-blue-800",
    [CNSSMonthlySituation.SUSPENDED]: "bg-yellow-100 text-yellow-800",
    [CNSSMonthlySituation.CORRECTION]: "bg-purple-100 text-purple-800",
    [CNSSMonthlySituation.OTHER]: "bg-gray-100 text-gray-800",
  },
  cnssSituation: {
    [CNSSSituation.DECLARED_BY_THIS_COMPANY]: "bg-green-100 text-green-800",
    [CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER]: "bg-blue-100 text-blue-800",
    [CNSSSituation.PERSONALLY_INSURED]: "bg-purple-100 text-purple-800",
    [CNSSSituation.NOT_DECLARED]: "bg-red-100 text-red-800",
    [CNSSSituation.PENDING]: "bg-yellow-100 text-yellow-800",
    [CNSSSituation.SUSPENDED]: "bg-orange-100 text-orange-800",
    [CNSSSituation.STOPPED]: "bg-red-100 text-red-800",
    [CNSSSituation.EXEMPT]: "bg-gray-100 text-gray-800",
    [CNSSSituation.UNKNOWN]: "bg-gray-100 text-gray-800",
    [CNSSSituation.OTHER]: "bg-gray-100 text-gray-800",
  },
};
