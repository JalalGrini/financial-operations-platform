// features/treasury/api/index.ts
/**
 * Treasury API Client — accounts, transactions, transfers, reconciliations.
 *
 * Backend: /api/v1/treasury/<...>/. Note the archive verb difference:
 * treasury ViewSets archive through the soft-delete mixin, i.e. plain
 * `DELETE /<id>/` archives (204), while restore is `POST /<id>/restore/`.
 */

import { apiClient } from "@/lib/api";
import type {
  BalanceDriftRow,
  PaginatedResponse,
  Reconciliation,
  TransferInput,
  TreasuryAccount,
  TreasuryTransaction,
} from "../types";

type Params = Record<string, string | number | boolean | undefined>;

function buildQuery(params: Params): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export const treasuryApi = {
  accounts: {
    list: async (
      params: Params = {},
    ): Promise<PaginatedResponse<TreasuryAccount>> => {
      return apiClient.get<PaginatedResponse<TreasuryAccount>>(
        `/treasury/accounts/${buildQuery(params)}`,
      );
    },
    get: async (id: string): Promise<TreasuryAccount> => {
      return apiClient.get<TreasuryAccount>(`/treasury/accounts/${id}/`);
    },
    create: async (data: Record<string, unknown>): Promise<TreasuryAccount> => {
      return apiClient.post<TreasuryAccount>("/treasury/accounts/", data);
    },
    update: async (
      id: string,
      data: Record<string, unknown>,
    ): Promise<TreasuryAccount> => {
      return apiClient.patch<TreasuryAccount>(
        `/treasury/accounts/${id}/`,
        data,
      );
    },
    /** Soft archive via the soft-delete mixin (DELETE archives, 204). */
    archive: async (id: string): Promise<void> => {
      await apiClient.delete(`/treasury/accounts/${id}/`);
    },
    restore: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/treasury/accounts/${id}/restore/`,
        {},
      );
    },
    statement: async (id: string, params: Params = {}): Promise<any> => {
      return apiClient.get(
        `/treasury/accounts/${id}/statement/${buildQuery(params)}`,
      );
    },
    balanceDrift: async (): Promise<BalanceDriftRow[]> => {
      return apiClient.get<BalanceDriftRow[]>(
        "/treasury/accounts/balance-drift/",
      );
    },
  },

  transactions: {
    list: async (
      params: Params = {},
    ): Promise<PaginatedResponse<TreasuryTransaction>> => {
      return apiClient.get<PaginatedResponse<TreasuryTransaction>>(
        `/treasury/transactions/${buildQuery(params)}`,
      );
    },
    get: async (id: string): Promise<TreasuryTransaction> => {
      return apiClient.get<TreasuryTransaction>(
        `/treasury/transactions/${id}/`,
      );
    },
    create: async (
      data: Record<string, unknown>,
    ): Promise<TreasuryTransaction> => {
      return apiClient.post<TreasuryTransaction>(
        "/treasury/transactions/",
        data,
      );
    },
    post: async (id: string): Promise<unknown> => {
      return apiClient.post(`/treasury/transactions/${id}/post_to_ledger/`, {});
    },
    cancel: async (id: string, reason: string): Promise<unknown> => {
      return apiClient.post(`/treasury/transactions/${id}/cancel/`, { reason });
    },
    archive: async (id: string): Promise<void> => {
      await apiClient.delete(`/treasury/transactions/${id}/`);
    },
    restore: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/treasury/transactions/${id}/restore/`,
        {},
      );
    },
  },

  transfers: {
    create: async (data: TransferInput): Promise<unknown> => {
      return apiClient.post("/treasury/transfers/", data);
    },
  },

  reconciliations: {
    list: async (
      params: Params = {},
    ): Promise<PaginatedResponse<Reconciliation>> => {
      return apiClient.get<PaginatedResponse<Reconciliation>>(
        `/treasury/reconciliations/${buildQuery(params)}`,
      );
    },
    create: async (data: Record<string, unknown>): Promise<Reconciliation> => {
      return apiClient.post<Reconciliation>("/treasury/reconciliations/", data);
    },
    complete: async (id: string): Promise<unknown> => {
      return apiClient.post(`/treasury/reconciliations/${id}/complete/`, {});
    },
    reopen: async (id: string): Promise<unknown> => {
      return apiClient.post(`/treasury/reconciliations/${id}/reopen/`, {});
    },
  },
};
