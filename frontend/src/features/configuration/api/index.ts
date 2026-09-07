// features/configuration/api/index.ts
/**
 * Configuration API Client — one uniform CRUD contract per entity.
 *
 * All six configuration ViewSets share the same surface:
 *   GET/POST   /configuration/<path>/
 *   PATCH      /configuration/<path>/<id>/
 *   POST       /configuration/<path>/<id>/archive/   (soft archive)
 *   POST       /configuration/<path>/<id>/restore/
 */

import { apiClient } from "@/lib/api";
import type {
  ConfigEntityKey,
  ConfigListParams,
  PaginatedResponse,
} from "../types";

function buildQuery(params: ConfigListParams): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

function makeEntityApi<T>(path: ConfigEntityKey) {
  return {
    list: async (
      params: ConfigListParams = {},
    ): Promise<PaginatedResponse<T>> => {
      return apiClient.get<PaginatedResponse<T>>(
        `/configuration/${path}/${buildQuery(params)}`,
      );
    },
    create: async (data: Record<string, unknown>): Promise<T> => {
      return apiClient.post<T>(`/configuration/${path}/`, data);
    },
    update: async (id: string, data: Record<string, unknown>): Promise<T> => {
      return apiClient.patch<T>(`/configuration/${path}/${id}/`, data);
    },
    archive: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/configuration/${path}/${id}/archive/`,
        {},
      );
    },
    restore: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/configuration/${path}/${id}/restore/`,
        {},
      );
    },
  };
}

export const configurationApi = {
  categories: makeEntityApi<import("../types").Category>("categories"),
  "record-types":
    makeEntityApi<import("../types").FinancialRecordType>("record-types"),
  "payment-methods":
    makeEntityApi<import("../types").PaymentMethod>("payment-methods"),
  "transaction-types":
    makeEntityApi<import("../types").TransactionType>("transaction-types"),
  "report-types": makeEntityApi<import("../types").ReportType>("report-types"),
  "notification-types":
    makeEntityApi<import("../types").NotificationType>("notification-types"),
};
