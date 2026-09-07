// features/companies/hooks/index.ts
/**
 * Companies Hooks
 * TanStack Query hooks for Companies feature
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companyApi } from "../api";
import type {
  Company,
  CompanyCreate,
  CompanyDetail,
  CompanySettings,
  CompanySettingsCreate,
  CompanyPreference,
  CompanyPreferenceCreate,
  CompanyPreferenceUpdate,
  CompanySelectOption,
  CompanyStatistics,
  CompanySelectParams,
  PaginatedResponse,
} from "../types";

// ============ Query Keys ============

export const companyKeys = {
  all: ["companies"] as const,
  lists: () => [...companyKeys.all, "list"] as const,
  list: (params: Record<string, any>) =>
    [...companyKeys.lists(), params] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
  settings: (companyId: string) =>
    [...companyKeys.all, "settings", companyId] as const,
  preferences: (companyId: string) =>
    [...companyKeys.all, "preferences", companyId] as const,
  statistics: () => [...companyKeys.all, "statistics"] as const,
  select: (params: CompanySelectParams) =>
    [...companyKeys.all, "select", params] as const,
};

// ============ Company List ============

export function useCompanies(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: () => companyApi.list(params),
    placeholderData: (previousData) => previousData,
  });
}

// ============ Company Detail ============

export function useCompany(id: string, enabled = true) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => companyApi.get(id),
    enabled: enabled && !!id,
  });
}

// ============ Company Mutations ============

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CompanyCreate) => companyApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyKeys.statistics() });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CompanyCreate> }) =>
      companyApi.update(id, data),
    onSuccess: (updatedCompany) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.setQueryData(
        companyKeys.detail(updatedCompany.id),
        updatedCompany,
      );
    },
  });
}

export function useArchiveCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      companyApi.archive(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyKeys.detail(id) });
    },
  });
}

export function useRestoreCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => companyApi.restore(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyKeys.detail(id) });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => companyApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.removeQueries({ queryKey: companyKeys.detail(id) });
    },
  });
}

// ============ Company Settings ============

export function useCompanySettings(companyId: string, enabled = true) {
  return useQuery({
    queryKey: companyKeys.settings(companyId),
    queryFn: () => companyApi.getSettings(companyId),
    enabled: enabled && !!companyId,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: Partial<CompanySettingsCreate>;
    }) => companyApi.updateSettings(companyId, data),
    onSuccess: (updatedSettings, { companyId }) => {
      queryClient.setQueryData(
        companyKeys.settings(companyId),
        updatedSettings,
      );
    },
  });
}

// ============ Company Preferences ============

export function useCompanyPreferences(companyId: string, enabled = true) {
  return useQuery({
    queryKey: companyKeys.preferences(companyId),
    queryFn: () => companyApi.listPreferences(companyId),
    enabled: enabled && !!companyId,
  });
}

export function useCreateCompanyPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: CompanyPreferenceCreate;
    }) => companyApi.createPreference(companyId, data),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({
        queryKey: companyKeys.preferences(companyId),
      });
    },
  });
}

export function useUpdateCompanyPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      key,
      data,
    }: {
      companyId: string;
      key: string;
      data: CompanyPreferenceUpdate;
    }) => companyApi.updatePreference(companyId, key, data),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({
        queryKey: companyKeys.preferences(companyId),
      });
    },
  });
}

export function useDeleteCompanyPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, key }: { companyId: string; key: string }) =>
      companyApi.deletePreference(companyId, key),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({
        queryKey: companyKeys.preferences(companyId),
      });
    },
  });
}

// ============ Company Statistics ============

export function useCompanyStatistics() {
  return useQuery({
    queryKey: companyKeys.statistics(),
    queryFn: () => companyApi.getStatistics(),
  });
}

// ============ Select Options ============

export function useCompanySelectOptions(params: CompanySelectParams = {}) {
  return useQuery({
    queryKey: companyKeys.select(params),
    queryFn: () => companyApi.getSelectOptions(params),
  });
}

export function useSearchCompanies(query: string, enabled = true) {
  return useQuery({
    queryKey: [...companyKeys.all, "search", query],
    queryFn: () => companyApi.search(query),
    enabled: enabled && query.length >= 2,
  });
}
