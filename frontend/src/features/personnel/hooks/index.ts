// src/features/personnel/hooks/index.ts
/**
 * Personnel TanStack Query Hooks
 * Centralized data fetching hooks for the Personnel feature
 */

import { sourceText } from "@/lib/i18n/source-catalog";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import {
  personnelApi,
  employmentApi,
  salaryApi,
  payrollApi,
  adjustmentApi,
  paymentApi,
  cnssApi,
  cnssMonthlyApi,
  documentApi,
  reportsApi,
  selectOptionsApi,
  dashboardApi,
} from "../api";
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
  CompanySelectOption,
  PersonnelSelectOption,
  DashboardSummary,
  PaginatedResponse,
  SearchParams,
  ReportFilters,
  ReportPreviewResponse,
  CNSSStopReason,
} from "../types";
import {
  personnelQueryKeys,
  employmentQueryKeys,
  payrollQueryKeys,
  cnssQueryKeys,
  reportsQueryKeys,
} from "../api";
import { toast } from "@/components/ui/toast";

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============ Dashboard Hooks ============

export function useDashboardSummary(
  month?: string,
  options?: UseQueryOptions<DashboardSummary, Error>,
) {
  return useQuery({
    queryKey: ["personnel", "dashboard", month],
    queryFn: () => dashboardApi.getSummary(month),
    staleTime: 1000 * 60 * 2, // 2 minutes
    ...options,
  });
}

// ============ Personnel Person Hooks ============

export function usePersonnelList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<PersonnelPerson>, Error>,
) {
  return useQuery({
    queryKey: personnelQueryKeys.list(params),
    queryFn: () => personnelApi.list(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function usePersonnelDetail(
  id: string,
  options?: UseQueryOptions<PersonnelPersonDetail, Error>,
) {
  return useQuery({
    queryKey: personnelQueryKeys.detail(id),
    queryFn: () => personnelApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePersonnelCompleteness(
  id: string,
  options?: UseQueryOptions<CompletenessReport, Error>,
) {
  return useQuery({
    queryKey: personnelQueryKeys.completeness(id),
    queryFn: () => personnelApi.getCompleteness(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePersonnelSearch(
  query: string,
  options?: UseQueryOptions<{ results: PersonnelPerson[] }, Error>,
) {
  return useQuery({
    queryKey: personnelQueryKeys.search(query),
    queryFn: () => personnelApi.search(query),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 2,
    ...options,
  });
}

export function useCreatePersonnel(
  options?: UseMutationOptions<PersonnelPerson, Error, PersonnelPersonCreate>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: personnelApi.create,
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({ queryKey: personnelQueryKeys.all });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUpdatePersonnel(
  options?: UseMutationOptions<
    PersonnelPerson,
    Error,
    { id: string; data: PersonnelPersonUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ id, data }) => personnelApi.update(id, data),
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({ queryKey: personnelQueryKeys.all });
      await queryClient.invalidateQueries({
        queryKey: personnelQueryKeys.detail(variables.id),
      });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useArchivePersonnel(
  options?: UseMutationOptions<
    { message: string },
    Error,
    { id: string; reason?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ id, reason }) => personnelApi.archive(id, reason),
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({ queryKey: personnelQueryKeys.all });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useRestorePersonnel(
  options?: UseMutationOptions<{ message: string }, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: personnelApi.restore,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({ queryKey: personnelQueryKeys.all });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function usePermanentDeletePersonnel(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (id: string) => personnelApi.permanentDelete(id),
    onSuccess: async (data, variables, onMutateResult, context) => {
      await queryClient.invalidateQueries({ queryKey: personnelQueryKeys.all });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useExportPersonnel(
  options?: UseMutationOptions<
    Blob,
    Error,
    { params: SearchParams; format: "csv" | "xlsx" }
  >,
) {
  return useMutation({
    mutationFn: ({ params, format }) => personnelApi.export(params, format),
    ...options,
  });
}

// ============ Employment Hooks ============

export function useEmploymentList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<Employment>, Error>,
) {
  return useQuery({
    queryKey: employmentQueryKeys.list(params),
    queryFn: () => employmentApi.list(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useEmploymentDetail(
  id: string,
  options?: UseQueryOptions<Employment, Error>,
) {
  return useQuery({
    queryKey: employmentQueryKeys.detail(id),
    queryFn: () => employmentApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useEmploymentsByPerson(
  personId: string,
  options?: UseQueryOptions<Employment[], Error>,
) {
  return useQuery({
    queryKey: employmentQueryKeys.byPerson(personId),
    queryFn: () => employmentApi.getByPerson(personId),
    enabled: !!personId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useEmploymentsByCompany(
  companyId: string,
  options?: UseQueryOptions<Employment[], Error>,
) {
  return useQuery({
    queryKey: employmentQueryKeys.byCompany(companyId),
    queryFn: () => employmentApi.getByCompany(companyId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateEmployment(
  options?: UseMutationOptions<Employment, Error, EmploymentCreate>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: employmentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() });
    },
    ...options,
  });
}

export function useUpdateEmployment(
  options?: UseMutationOptions<
    Employment,
    Error,
    { id: string; data: EmploymentUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => employmentApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: employmentQueryKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useTerminateEmployment(
  options?: UseMutationOptions<
    Employment,
    Error,
    {
      id: string;
      data: { departure_reason?: string; resignation_date?: string };
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => employmentApi.terminate(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: employmentQueryKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useArchiveEmployment(
  options?: UseMutationOptions<
    { message: string },
    Error,
    { id: string; reason?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => employmentApi.archive(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() });
    },
    ...options,
  });
}

export function useRestoreEmployment(
  options?: UseMutationOptions<{ message: string }, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: employmentApi.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() });
    },
    ...options,
  });
}

export function usePermanentDeleteEmployment(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: employmentApi.permanentDelete,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: employmentQueryKeys.lists() }),
    ...options,
  });
}

// ============ Salary Hooks ============

export function useSalaryList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<EmploymentSalary>, Error>,
) {
  return useQuery({
    queryKey: ["salaries", "list", params],
    queryFn: () => salaryApi.list(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useSalaryDetail(
  id: string,
  options?: UseQueryOptions<EmploymentSalary, Error>,
) {
  return useQuery({
    queryKey: ["salaries", "detail", id],
    queryFn: () => salaryApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useSalariesByEmployment(
  employmentId: string,
  options?: UseQueryOptions<EmploymentSalary[], Error>,
) {
  return useQuery({
    queryKey: employmentQueryKeys.salaries(employmentId),
    queryFn: () => salaryApi.getByEmployment(employmentId),
    enabled: !!employmentId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateSalary(
  options?: UseMutationOptions<EmploymentSalary, Error, EmploymentSalaryCreate>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salaryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries", "list"] });
    },
    ...options,
  });
}

export function useUpdateSalary(
  options?: UseMutationOptions<
    EmploymentSalary,
    Error,
    { id: string; data: EmploymentSalaryUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => salaryApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["salaries", "list"] });
      queryClient.invalidateQueries({ queryKey: ["salaries", "detail", id] });
    },
    ...options,
  });
}

export function useSetCurrentSalary(
  options?: UseMutationOptions<EmploymentSalary, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salaryApi.setCurrent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries", "list"] });
    },
    ...options,
  });
}

export function useArchiveSalary(
  options?: UseMutationOptions<
    { message: string },
    Error,
    { id: string; reason?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => salaryApi.archive(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salaries"] }),
    ...options,
  });
}

export function useRestoreSalary(
  options?: UseMutationOptions<{ message: string }, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salaryApi.restore,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salaries"] }),
    ...options,
  });
}

export function usePermanentDeleteSalary(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: salaryApi.permanentDelete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salaries"] }),
    ...options,
  });
}

export function useExportSalary(
  options?: UseMutationOptions<
    Blob,
    Error,
    { params: SearchParams; format: "csv" | "xlsx" }
  >,
) {
  return useMutation({
    mutationFn: ({ params, format }) => salaryApi.export(params, format),
    onSuccess: (blob, { format }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sourceText("salary_export_file_prefix")}_${todayInputValue()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      toast.error(error?.message || "Export failed");
    },
    ...options,
  });
}

// ============ Payroll Hooks ============

export function usePayrollList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<MonthlyPayrollRecord>, Error>,
) {
  return useQuery({
    queryKey: payrollQueryKeys.list(params),
    queryFn: () => payrollApi.list(params),
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function usePayrollDetail(
  id: string,
  options?: UseQueryOptions<MonthlyPayrollRecord, Error>,
) {
  return useQuery({
    queryKey: payrollQueryKeys.detail(id),
    queryFn: () => payrollApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
    ...options,
  });
}

export function usePayrollsByEmployment(
  employmentId: string,
  options?: UseQueryOptions<MonthlyPayrollRecord[], Error>,
) {
  return useQuery({
    queryKey: payrollQueryKeys.byEmployment(employmentId),
    queryFn: () => payrollApi.getByEmployment(employmentId),
    enabled: !!employmentId,
    staleTime: 1000 * 60 * 2,
    ...options,
  });
}

export function useCreatePayroll(
  options?: UseMutationOptions<
    MonthlyPayrollRecord,
    Error,
    MonthlyPayrollRecordCreate
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

export function useUpdatePayroll(
  options?: UseMutationOptions<
    MonthlyPayrollRecord,
    Error,
    { id: string; data: MonthlyPayrollRecordUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => payrollApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.detail(id) });
    },
    ...options,
  });
}

export function useCalculatePayroll(
  options?: UseMutationOptions<MonthlyPayrollRecord, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.calculate,
    ...options,
    onSuccess: async (data, id, onMutateResult, context) => {
      queryClient.setQueryData(payrollQueryKeys.detail(id), data);
      await queryClient.invalidateQueries({ queryKey: payrollQueryKeys.all });
      await options?.onSuccess?.(data, id, onMutateResult, context);
    },
  });
}

export function useApprovePayroll(
  options?: UseMutationOptions<MonthlyPayrollRecord, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.approve,
    ...options,
    onSuccess: async (data, id, onMutateResult, context) => {
      queryClient.setQueryData(payrollQueryKeys.detail(id), data);
      await queryClient.invalidateQueries({ queryKey: payrollQueryKeys.all });
      await options?.onSuccess?.(data, id, onMutateResult, context);
    },
  });
}

export function useArchivePayroll(
  options?: UseMutationOptions<
    { message: string },
    Error,
    { id: string; reason?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => payrollApi.archive(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

export function useRestorePayroll(
  options?: UseMutationOptions<{ message: string }, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

export function useRecalculatePayroll(
  options?: UseMutationOptions<
    MonthlyPayrollRecord,
    Error,
    { id: string; daily_rate_override?: number | null; absence_rate_override?: number | null }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, daily_rate_override, absence_rate_override }) =>
      payrollApi.recalculate(id, daily_rate_override, absence_rate_override),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.detail(id) });
    },
    ...options,
  });
}

export function useBulkCreatePayroll(
  options?: UseMutationOptions<
    {
      created_count: number;
      skipped_count: number;
      records: MonthlyPayrollRecord[];
    },
    Error,
    {
      company_id: string;
      year: number;
      month: number;
      employment_ids?: string[];
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.bulkCreate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

export function useBulkCalculatePayroll(
  options?: UseMutationOptions<
    { calculated_count: number; records: MonthlyPayrollRecord[] },
    Error,
    {
      payroll_ids?: string[];
      company_id?: string;
      year?: number;
      month?: number;
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.bulkCalculate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

export function useBulkApprovePayroll(
  options?: UseMutationOptions<
    { approved_count: number; records: MonthlyPayrollRecord[] },
    Error,
    {
      payroll_ids?: string[];
      company_id?: string;
      year?: number;
      month?: number;
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: payrollApi.bulkApprove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payrollQueryKeys.lists() });
    },
    ...options,
  });
}

// ============ Adjustment Hooks ============

export function useAdjustmentList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<PayrollAdjustment>, Error>,
) {
  return useQuery({
    queryKey: ["adjustments", "list", params],
    queryFn: () => adjustmentApi.list(params),
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useAdjustmentDetail(
  id: string,
  options?: UseQueryOptions<PayrollAdjustment, Error>,
) {
  return useQuery({
    queryKey: ["adjustments", "detail", id],
    queryFn: () => adjustmentApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useAdjustmentsByPayroll(
  payrollId: string,
  options?: UseQueryOptions<PayrollAdjustment[], Error>,
) {
  return useQuery({
    queryKey: payrollQueryKeys.adjustments(payrollId),
    queryFn: () => adjustmentApi.getByPayroll(payrollId),
    enabled: !!payrollId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateAdjustment(
  options?: UseMutationOptions<
    PayrollAdjustment,
    Error,
    PayrollAdjustmentCreate
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adjustmentApi.create,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.adjustments(variables.payroll_record),
      });
    },
    ...options,
  });
}

export function useUpdateAdjustment(
  options?: UseMutationOptions<
    PayrollAdjustment,
    Error,
    { id: string; data: PayrollAdjustmentUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => adjustmentApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: ["adjustments", "detail", id],
      });
    },
    ...options,
  });
}

export function useDeleteAdjustment(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adjustmentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adjustments", "list"] });
    },
    ...options,
  });
}

// ============ Payment Hooks ============

export function usePaymentList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<PayrollPayment>, Error>,
) {
  return useQuery({
    queryKey: ["payments", "list", params],
    queryFn: () => paymentApi.list(params),
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePaymentDetail(
  id: string,
  options?: UseQueryOptions<PayrollPayment, Error>,
) {
  return useQuery({
    queryKey: ["payments", "detail", id],
    queryFn: () => paymentApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePaymentsByPayroll(
  payrollId: string,
  options?: UseQueryOptions<PayrollPayment[], Error>,
) {
  return useQuery({
    queryKey: payrollQueryKeys.payments(payrollId),
    queryFn: () => paymentApi.getByPayroll(payrollId),
    enabled: !!payrollId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreatePayment(
  options?: UseMutationOptions<PayrollPayment, Error, PayrollPaymentCreate>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentApi.create,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.payments(variables.payroll_record),
      });
    },
    ...options,
  });
}

export function useUpdatePayment(
  options?: UseMutationOptions<
    PayrollPayment,
    Error,
    { id: string; data: PayrollPaymentUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => paymentApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["payments", "detail", id] });
    },
    ...options,
  });
}

export function useDeletePayment(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", "list"] });
    },
    ...options,
  });
}

export function useRecordAdvance(
  options?: UseMutationOptions<
    PayrollPayment,
    Error,
    {
      payrollId: string;
      data: {
        amount: number;
        payment_date: string;
        payment_method?: string;
        reference_number?: string;
        notes?: string;
      };
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payrollId, data }) =>
      paymentApi.recordAdvance(payrollId, data),
    onSuccess: (_, { payrollId }) => {
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.payments(payrollId),
      });
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.detail(payrollId),
      });
    },
    ...options,
  });
}

export function useRecordPartialPayment(
  options?: UseMutationOptions<
    PayrollPayment,
    Error,
    {
      payrollId: string;
      data: {
        amount: number;
        payment_date: string;
        payment_method?: string;
        reference_number?: string;
        notes?: string;
      };
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payrollId, data }) =>
      paymentApi.recordPartial(payrollId, data),
    onSuccess: (_, { payrollId }) => {
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.payments(payrollId),
      });
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.detail(payrollId),
      });
    },
    ...options,
  });
}

export function useRecordFinalPayment(
  options?: UseMutationOptions<
    PayrollPayment,
    Error,
    {
      payrollId: string;
      data: {
        amount: number;
        payment_date: string;
        payment_method?: string;
        reference_number?: string;
        notes?: string;
      };
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payrollId, data }) =>
      paymentApi.recordFinal(payrollId, data),
    onSuccess: (_, { payrollId }) => {
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.payments(payrollId),
      });
      queryClient.invalidateQueries({
        queryKey: payrollQueryKeys.detail(payrollId),
      });
    },
    ...options,
  });
}

// ============ CNSS Declaration Hooks ============

export function useCNSSDeclarationList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<CNSSDeclaration>, Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.declarationList(params),
    queryFn: () => cnssApi.list(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useCNSSDeclarationDetail(
  id: string,
  options?: UseQueryOptions<CNSSDeclaration, Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.declarationDetail(id),
    queryFn: () => cnssApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCNSSDeclarationsByPerson(
  personId: string,
  options?: UseQueryOptions<CNSSDeclaration[], Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.byPerson(personId),
    queryFn: () => cnssApi.getByPerson(personId),
    enabled: !!personId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCNSSDeclarationsByCompany(
  companyId: string,
  options?: UseQueryOptions<CNSSDeclaration[], Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.byCompany(companyId),
    queryFn: () => cnssApi.getByCompany(companyId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateCNSSDeclaration(
  options?: UseMutationOptions<CNSSDeclaration, Error, CNSSDeclarationCreate>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cnssApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.declarations() });
    },
    ...options,
  });
}

export function useUpdateCNSSDeclaration(
  options?: UseMutationOptions<
    CNSSDeclaration,
    Error,
    { id: string; data: CNSSDeclarationUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cnssApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.declarations() });
      queryClient.invalidateQueries({
        queryKey: cnssQueryKeys.declarationDetail(id),
      });
    },
    ...options,
  });
}

export function useStopCNSSDeclaration(
  options?: UseMutationOptions<
    CNSSDeclaration,
    Error,
    {
      id: string;
      data: { stop_reason: CNSSStopReason; stop_date?: string; notes?: string };
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cnssApi.stop(id, data),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        cnssQueryKeys.declarationDetail(variables.id),
        data,
      );
      await queryClient.invalidateQueries({
        queryKey: cnssQueryKeys.declarations(),
      });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useRestartCNSSDeclaration(
  options?: UseMutationOptions<
    CNSSDeclaration,
    Error,
    { id: string; data: { restart_date: string; notes?: string } }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cnssApi.restart(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.declarations() });
      queryClient.invalidateQueries({
        queryKey: cnssQueryKeys.declarationDetail(id),
      });
    },
    ...options,
  });
}

export function useArchiveCNSSDeclaration(
  options?: UseMutationOptions<
    { message: string },
    Error,
    { id: string; reason?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => cnssApi.archive(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.declarations() });
    },
    ...options,
  });
}

export function useRestoreCNSSDeclaration(
  options?: UseMutationOptions<{ message: string }, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cnssApi.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.declarations() });
    },
    ...options,
  });
}

// ============ CNSS Monthly Declaration Hooks ============

export function useCNSSMonthlyList(
  params: SearchParams = {},
  options?: UseQueryOptions<PaginatedResponse<CNSSMonthlyDeclaration>, Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.monthlyList(params),
    queryFn: () => cnssMonthlyApi.list(params),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useCNSSMonthlyDetail(
  id: string,
  options?: UseQueryOptions<CNSSMonthlyDeclaration, Error>,
) {
  return useQuery({
    queryKey: cnssQueryKeys.monthlyDetail(id),
    queryFn: () => cnssMonthlyApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCNSSMonthlyByCnssDeclaration(
  cnssDeclarationId: string,
  options?: UseQueryOptions<CNSSMonthlyDeclaration[], Error>,
) {
  return useQuery({
    queryKey: ["cnss-monthly", "by-cnss-declaration", cnssDeclarationId],
    queryFn: () => cnssMonthlyApi.getByCnssDeclaration(cnssDeclarationId),
    enabled: !!cnssDeclarationId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCNSSMonthlyByPeriod(
  year: number,
  month: number,
  options?: UseQueryOptions<CNSSMonthlyDeclaration[], Error>,
) {
  return useQuery({
    queryKey: ["cnss-monthly", "by-period", year, month],
    queryFn: () => cnssMonthlyApi.getByPeriod(year, month),
    enabled: !!year && !!month,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateCNSSMonthly(
  options?: UseMutationOptions<
    CNSSMonthlyDeclaration,
    Error,
    CNSSMonthlyDeclarationCreate
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cnssMonthlyApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.monthly() });
    },
    ...options,
  });
}

export function useUpdateCNSSMonthly(
  options?: UseMutationOptions<
    CNSSMonthlyDeclaration,
    Error,
    { id: string; data: CNSSMonthlyDeclarationUpdate }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cnssMonthlyApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.monthly() });
      queryClient.invalidateQueries({
        queryKey: cnssQueryKeys.monthlyDetail(id),
      });
    },
    ...options,
  });
}

export function useSubmitCNSSMonthly(
  options?: UseMutationOptions<CNSSMonthlyDeclaration, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cnssMonthlyApi.submit,
    ...options,
    onSuccess: async (data, id, onMutateResult, context) => {
      queryClient.setQueryData(cnssQueryKeys.monthlyDetail(id), data);
      await queryClient.invalidateQueries({ queryKey: cnssQueryKeys.monthly() });
      await options?.onSuccess?.(data, id, onMutateResult, context);
    },
  });
}

export function useCorrectCNSSMonthly(
  options?: UseMutationOptions<
    CNSSMonthlyDeclaration,
    Error,
    { id: string; data: { correction_note?: string } }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => cnssMonthlyApi.correct(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cnssQueryKeys.monthly() });
      queryClient.invalidateQueries({
        queryKey: cnssQueryKeys.monthlyDetail(id),
      });
    },
    ...options,
  });
}

// ============ Document Hooks ============

export function useDocumentList(
  params: SearchParams = {},
  options?: UseQueryOptions<
    PaginatedResponse<PersonnelDocumentReference>,
    Error
  >,
) {
  return useQuery({
    queryKey: ["documents", "list", params],
    queryFn: () => documentApi.list(params),
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useDocumentDetail(
  id: string,
  options?: UseQueryOptions<PersonnelDocumentReference, Error>,
) {
  return useQuery({
    queryKey: ["documents", "detail", id],
    queryFn: () => documentApi.get(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useDocumentsByPerson(
  personId: string,
  options?: UseQueryOptions<PersonnelDocumentReference[], Error>,
) {
  return useQuery({
    queryKey: ["documents", "by-person", personId],
    queryFn: () => documentApi.getByPerson(personId),
    enabled: !!personId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useCreateDocument(
  options?: UseMutationOptions<
    PersonnelDocumentReference,
    Error,
    PersonnelDocumentReferenceCreate
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentApi.create,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "by-person", variables.person],
      });
    },
    ...options,
  });
}

export function useUpdateDocument(
  options?: UseMutationOptions<
    PersonnelDocumentReference,
    Error,
    { id: string; data: Partial<PersonnelDocumentReferenceCreate> }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => documentApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["documents", "detail", id] });
    },
    ...options,
  });
}

export function useDeleteDocument(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "list"] });
    },
    ...options,
  });
}

// ============ Reports Hooks ============

export function useReportTypes(
  options?: UseQueryOptions<
    { types: Array<{ id: string; name: string; description: string }> },
    Error
  >,
) {
  return useQuery({
    queryKey: reportsQueryKeys.types(),
    queryFn: () => reportsApi.getTypes(),
    staleTime: 1000 * 60 * 60, // 1 hour
    ...options,
  });
}

export function useReportPreview(
  filters: ReportFilters,
  options?: UseQueryOptions<ReportPreviewResponse, Error>,
) {
  return useQuery({
    queryKey: reportsQueryKeys.preview(filters),
    queryFn: () => reportsApi.preview(filters),
    enabled: !!filters.year && !!filters.month && !!filters.report_type,
    staleTime: 1000 * 60 * 2,
    ...options,
  });
}

export function useReportExport(
  filters: ReportFilters,
  options?: UseMutationOptions<Blob, Error, ReportFilters>,
) {
  return useMutation({
    mutationFn: reportsApi.export,
    ...options,
  });
}

// ============ Select Options Hooks ============

export function useCompanies(
  options?: UseQueryOptions<CompanySelectOption[], Error>,
) {
  return useQuery({
    queryKey: ["personnel", "companies"],
    queryFn: selectOptionsApi.getCompanies,
    staleTime: 1000 * 60 * 10, // 10 minutes
    ...options,
  });
}

export function usePersonnelSelect(
  params: SearchParams = {},
  options?: UseQueryOptions<PersonnelSelectOption[], Error>,
) {
  return useQuery({
    queryKey: personnelQueryKeys.personnel(params),
    queryFn: () => selectOptionsApi.getPersonnel(params),
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePaymentMethods(
  options?: UseQueryOptions<{ id: string; name: string }[], Error>,
) {
  return useQuery({
    queryKey: ["configuration", "payment-methods"],
    queryFn: selectOptionsApi.getPaymentMethods,
    staleTime: 1000 * 60 * 10, // 10 minutes — configuration data changes rarely
    ...options,
  });
}
