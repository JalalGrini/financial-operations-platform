// features/dashboard/api/index.ts
/**
 * Executive Dashboard API — /api/v1/dashboard/kpis/ and /charts/.
 *
 * Money figures travel as per-currency maps ({ "MAD": "1234.5000" }),
 * never collapsed floats (backend decision ED-10) — helpers below reduce
 * the map for display without ever inventing a currency that had no data.
 */

import { apiClient } from "@/lib/api";

export type CurrencyAmountMap = Record<string, string>;

export interface DashboardRecentRecord {
  id: string;
  reference: string;
  company: string;
  company_name: string;
  record_type_name: string;
  category_name: string | null;
  description: string;
  total_amount: string;
  currency: string;
  record_date: string;
  posted_at: string;
}

export interface DashboardOverview extends DashboardKpis {
  recent_records: DashboardRecentRecord[];
}

export interface DashboardKpis {
  revenue: CurrencyAmountMap;
  expenses: CurrencyAmountMap;
  net: CurrencyAmountMap;
  report_status: Record<string, number>;
}

export interface MonthlyCashFlowPoint {
  month: string;
  income: CurrencyAmountMap;
  expense: CurrencyAmountMap;
}

export interface CompanyComparisonPoint {
  company: string;
  company_name: string;
  income: CurrencyAmountMap;
  expense: CurrencyAmountMap;
}

export interface CategoryAnalysisPoint {
  category: string | null;
  category_name: string;
  total: CurrencyAmountMap;
}

export interface DashboardCharts {
  monthly_cash_flow: MonthlyCashFlowPoint[];
  company_comparison: CompanyComparisonPoint[];
  category_analysis: CategoryAnalysisPoint[];
}


export interface HeadcountStats {
  total: number;
  active: number;
  on_leave: number;
}

export interface UpcomingDeadline {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  status: string;
}

export interface TransfersSummaryStats {
  total: number;
  confirmed: number;
  draft: number;
}

export interface OperationalSnapshot {
  headcount: HeadcountStats;
  upcoming_deadlines: UpcomingDeadline[];
  deadlines_count: {
    overdue: number;
    this_week: number;
  };
  transfers_summary?: TransfersSummaryStats;
  personnel_ops?: {
    active_employees: number;
    payroll_this_month: number;
    cnss_declared: number;
  };
}
export const dashboardApi = {
  overview: async (company?: string): Promise<DashboardOverview> => {
    const qs = company ? `?company=${encodeURIComponent(company)}` : "";
    return apiClient.get<DashboardOverview>(`/dashboard/${qs}`);
  },
  kpis: async (company?: string): Promise<DashboardKpis> => {
    const qs = company ? `?company=${encodeURIComponent(company)}` : "";
    return apiClient.get<DashboardKpis>(`/dashboard/kpis/${qs}`);
  },
  charts: async (
    params: { company?: string; months?: number } = {},
  ): Promise<DashboardCharts> => {
    const searchParams = new URLSearchParams();
    if (params.company) searchParams.append("company", params.company);
    if (params.months) searchParams.append("months", String(params.months));
    const qs = searchParams.toString();
    return apiClient.get<DashboardCharts>(
      `/dashboard/charts/${qs ? `?${qs}` : ""}`,
    );
  },
  operational: async (): Promise<OperationalSnapshot> =>
    apiClient.get<OperationalSnapshot>(`/dashboard/operational/`),
};

/** Sum a per-currency map for a preferred currency; null when absent (missing ≠ zero). */
export function amountIn(
  map: CurrencyAmountMap | undefined,
  currency = "MAD",
): number | null {
  if (!map) return null;
  const raw = map[currency] ?? Object.values(map)[0];
  if (raw === undefined) return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

/** The currency actually present in the map (display label), defaulting to MAD. */
export function mapCurrency(
  map: CurrencyAmountMap | undefined,
  fallback = "MAD",
): string {
  if (!map) return fallback;
  return Object.keys(map)[0] || fallback;
}
