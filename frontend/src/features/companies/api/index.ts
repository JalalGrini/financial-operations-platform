// features/companies/api/index.ts
/**
 * Companies API Client
 * Centralized API endpoints for the Companies feature
 */

import { apiClient } from "@/lib/api";
import type {
  Company,
  CompanyCreate,
  CompanyDetail,
  CompanySettings,
  CompanySettingsCreate,
  CompanySettingsUpdate,
  CompanyPreference,
  CompanyPreferenceCreate,
  CompanyPreferenceUpdate,
  CompanySelectOption,
  CompanyStatistics,
  PaginatedResponse,
  SearchParams,
  CompanyListParams,
  CompanySelectParams,
} from "../types";

// ============ API Functions ============

export const companyApi = {
  // --- Company CRUD ---

  // List companies with pagination, search, filtering
  list: async (
    params: CompanyListParams = {},
  ): Promise<PaginatedResponse<Company>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<PaginatedResponse<Company>>(
      `/companies/?${searchParams.toString()}`,
    );
    return response;
  },

  // Get single company
  get: async (id: string): Promise<CompanyDetail> => {
    const response = await apiClient.get<CompanyDetail>(`/companies/${id}/`);
    return response;
  },

  // Create new company
  create: async (data: CompanyCreate): Promise<Company> => {
    const response = await apiClient.post<Company>("/companies/", data);
    return response;
  },

  // Update company
  update: async (
    id: string,
    data: Partial<CompanyCreate>,
  ): Promise<Company> => {
    const response = await apiClient.patch<Company>(`/companies/${id}/`, data);
    return response;
  },

  // Archive company
  archive: async (
    id: string,
    reason?: string,
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/companies/${id}/archive/`,
      { reason },
    );
    return response;
  },

  // Restore company
  restore: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(
      `/companies/${id}/restore/`,
    );
    return response;
  },

  // Delete company (admin only)
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/companies/${id}/permanent/`, {
      data: { confirm: true },
    });
  },

  // Search companies (for selects)
  search: async (
    query: string,
  ): Promise<{ results: CompanySelectOption[] }> => {
    const response = await apiClient.get<{ results: CompanySelectOption[] }>(
      `/companies/search/?q=${encodeURIComponent(query)}`,
    );
    return response;
  },

  // Get company statistics
  getStatistics: async (): Promise<CompanyStatistics> => {
    const response = await apiClient.get<CompanyStatistics>(
      `/companies/statistics/`,
    );
    return response;
  },

  // --- Company Settings ---

  getSettings: async (companyId: string): Promise<CompanySettings> => {
    const response = await apiClient.get<CompanySettings>(
      `/companies/${companyId}/settings/`,
    );
    return response;
  },

  updateSettings: async (
    companyId: string,
    data: Partial<CompanySettingsCreate>,
  ): Promise<CompanySettings> => {
    const response = await apiClient.patch<CompanySettings>(
      `/companies/${companyId}/settings/`,
      data,
    );
    return response;
  },

  // --- Company Preferences ---

  listPreferences: async (companyId: string): Promise<CompanyPreference[]> => {
    const response = await apiClient.get<CompanyPreference[]>(
      `/companies/${companyId}/preferences/`,
    );
    return response;
  },

  createPreference: async (
    companyId: string,
    data: CompanyPreferenceCreate,
  ): Promise<CompanyPreference> => {
    const response = await apiClient.post<CompanyPreference>(
      `/companies/${companyId}/preferences/`,
      data,
    );
    return response;
  },

  updatePreference: async (
    companyId: string,
    key: string,
    data: CompanyPreferenceUpdate,
  ): Promise<CompanyPreference> => {
    const response = await apiClient.patch<CompanyPreference>(
      `/companies/${companyId}/preferences/${key}/`,
      data,
    );
    return response;
  },

  deletePreference: async (companyId: string, key: string): Promise<void> => {
    await apiClient.delete(`/companies/${companyId}/preferences/${key}/`);
  },

  // Get select options for dropdowns
  getSelectOptions: async (
    params: CompanySelectParams = {},
  ): Promise<CompanySelectOption[]> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const response = await apiClient.get<CompanySelectOption[]>(
      `/companies/select/?${searchParams.toString()}`,
    );
    return response;
  },
};
