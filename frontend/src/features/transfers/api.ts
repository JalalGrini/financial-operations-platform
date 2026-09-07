import { apiClient } from "@/lib/api";
import type {
  CashTransfer,
  CashTransferWriteInput,
  EntityBalanceReport,
  EntityOpeningBalance,
  EntityOpeningBalanceWriteInput,
  PaginatedOpeningBalances,
  PaginatedTransfers,
  TransferSummary,
} from "./types";

type Params = Record<string, string | number | boolean | undefined>;
function buildQuery(params: Params): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

const BASE = "/transfers/cash-transfers";
const OPENING = "/transfers/opening-balances";

export const transfersApi = {
  list: (params: Params = {}) =>
    apiClient.get<PaginatedTransfers>(`${BASE}/${buildQuery(params)}`),
  get: (id: string) => apiClient.get<CashTransfer>(`${BASE}/${id}/`),
  create: (data: CashTransferWriteInput) =>
    apiClient.post<CashTransfer>(`${BASE}/`, data),
  update: (id: string, data: Partial<CashTransferWriteInput>) =>
    apiClient.patch<CashTransfer>(`${BASE}/${id}/`, data),
  delete: (id: string) => apiClient.delete<void>(`${BASE}/${id}/`),
  confirm: (id: string) =>
    apiClient.post<CashTransfer>(`${BASE}/${id}/confirm/`, {}),
  revertToDraft: (id: string) =>
    apiClient.post<CashTransfer>(`${BASE}/${id}/revert_to_draft/`, {}),
  archive: (id: string) =>
    apiClient.post<{ detail: string }>(`${BASE}/${id}/archive/`, {}),
  restore: (id: string) =>
    apiClient.post<CashTransfer>(`${BASE}/${id}/restore/`, {}),
  summary: () => apiClient.get<TransferSummary>(`${BASE}/summary/`),

  /**
   * Per-entity opening / net-transfer / current balances for one currency.
   * Balances are never summed across currencies, so the currency is explicit.
   */
  balances: (currency?: string) =>
    apiClient.get<EntityBalanceReport>(`${BASE}/balances/${buildQuery({ currency })}`),

  openingBalances: {
    list: (params: Params = {}) =>
      apiClient.get<PaginatedOpeningBalances>(`${OPENING}/${buildQuery(params)}`),
    get: (id: string) => apiClient.get<EntityOpeningBalance>(`${OPENING}/${id}/`),
    create: (data: EntityOpeningBalanceWriteInput) =>
      apiClient.post<EntityOpeningBalance>(`${OPENING}/`, data),
    update: (id: string, data: Partial<EntityOpeningBalanceWriteInput>) =>
      apiClient.patch<EntityOpeningBalance>(`${OPENING}/${id}/`, data),
    delete: (id: string) => apiClient.delete<void>(`${OPENING}/${id}/`),
    restore: (id: string) =>
      apiClient.post<EntityOpeningBalance>(`${OPENING}/${id}/restore/`, {}),
  },
};
