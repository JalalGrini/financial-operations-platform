import { apiClient } from "@/lib/api";
import type {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  Paginated,
} from "./types";
function qs(params: Record<string, unknown> = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}
export const inventoryApi = {
  listItems: (params: Record<string, unknown> = {}) =>
    apiClient.get<Paginated<InventoryItem>>(`/inventory/items/?${qs(params)}`),
  getItem: (id: string) =>
    apiClient.get<InventoryItem>(`/inventory/items/${id}/`),
  createItem: (data: FormData) =>
    apiClient.post<InventoryItem>("/inventory/items/", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateItem: (id: string, data: FormData) =>
    apiClient.patch<InventoryItem>(`/inventory/items/${id}/`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  archiveItem: (id: string, reason: string) =>
    apiClient.post(`/inventory/items/${id}/archive/`, { reason }),
  restoreItem: (id: string) =>
    apiClient.post(`/inventory/items/${id}/restore/`, {}),
  permanentDeleteItem: (id: string) =>
    apiClient.delete(`/inventory/items/${id}/permanent/`, {
      data: { confirm: true },
    }),
  listCategories: (params: Record<string, unknown> = {}) =>
    apiClient.get<Paginated<InventoryCategory>>(
      `/inventory/categories/?${qs(params)}`,
    ),
  createCategory: (data: Partial<InventoryCategory>) =>
    apiClient.post<InventoryCategory>("/inventory/categories/", data),
  listMovements: (params: Record<string, unknown> = {}) =>
    apiClient.get<Paginated<InventoryMovement>>(
      `/inventory/movements/?${qs(params)}`,
    ),
  createMovement: (id: string, data: Record<string, unknown>) =>
    apiClient.post<InventoryMovement>(`/inventory/items/${id}/movement/`, data),
  // `lang` makes the CSV headers follow the language the user is reading the
  // app in. Read from the document rather than passed in, matching
  // features/exports/api.ts, so it cannot disagree with what is on screen.
  exportItems: (params: Record<string, unknown> = {}) =>
    apiClient.get<Blob>(
      `/inventory/items/export/?${qs({
        ...params,
        ...(typeof document !== "undefined" && document.documentElement.lang
          ? { lang: document.documentElement.lang }
          : {}),
      })}`,
      {
        responseType: "blob",
      },
    ),
};
