// features/parties/api/index.ts
/**
 * Parties API Client — clients, suppliers, external parties, associated
 * persons and their types. Uniform CRUD + archive/restore contract over
 * /api/v1/parties/<path>/ (Cycle 29, M2).
 */

import { apiClient } from "@/lib/api";
import type { PaginatedResponse } from "../types";

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

function makePartyApi<T>(path: string) {
  return {
    list: async (params: Params = {}): Promise<PaginatedResponse<T>> => {
      return apiClient.get<PaginatedResponse<T>>(
        `/parties/${path}/${buildQuery(params)}`,
      );
    },
    get: async (id: string): Promise<T> => {
      return apiClient.get<T>(`/parties/${path}/${id}/`);
    },
    create: async (data: Record<string, unknown>): Promise<T> => {
      return apiClient.post<T>(`/parties/${path}/`, data);
    },
    update: async (id: string, data: Record<string, unknown>): Promise<T> => {
      return apiClient.patch<T>(`/parties/${path}/${id}/`, data);
    },
    archive: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/parties/${path}/${id}/archive/`,
        {},
      );
    },
    restore: async (id: string): Promise<{ message: string }> => {
      return apiClient.post<{ message: string }>(
        `/parties/${path}/${id}/restore/`,
        {},
      );
    },
    /** Type-ahead search backed by the backend `search` action (GET ?q=). */
    search: async (query: string): Promise<T[]> => {
      const response = await apiClient.get<any>(
        `/parties/${path}/search/?q=${encodeURIComponent(query)}`,
      );
      return Array.isArray(response) ? response : (response?.results ?? []);
    },
  };
}

export const partiesApi = {
  clients: makePartyApi<import("../types").Client>("clients"),
  suppliers: makePartyApi<import("../types").Supplier>("suppliers"),
  externalParties:
    makePartyApi<import("../types").ExternalParty>("external-parties"),
  associatedPersons:
    makePartyApi<import("../types").AssociatedPerson>("associated-persons"),
  personTypes:
    makePartyApi<import("../types").AssociatedPersonType>("person-types"),
  intercompanyBalances: makePartyApi<import("../types").IntercompanyBalance>(
    "intercompany-balances",
  ),
};
