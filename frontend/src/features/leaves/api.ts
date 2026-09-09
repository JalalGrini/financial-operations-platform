"use client";
import { apiClient } from "@/lib/api";
import { sourceText } from "@/lib/i18n/source-catalog";

export interface Leave {
  id: number;
  personnel: string;
  personnel_name: string | null;
  employment: string;
  company?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  department?: string | null;
  leave_type: string;
  leave_type_other?: string;
  decision_number?: string;
  decision_date?: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  reason: string;
  status: "draft" | "official" | "cancelled";
  signed_document?: string | null;
  created_by: number | string;
  created_by_name: string | null;
  official_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLeaveData {
  personnel: string;
  employment: string;
  company?: string;
  leave_type: string;
  leave_type_other?: string;
  decision_number?: string;
  decision_date?: string;
  start_date: string;
  end_date: string;
  reason?: string;
  signed_document?: File | null;
}

export const LEAVE_TYPES = [
  {
    value: "annual",
    get label() {
      return sourceText("Annual Leave");
    },
  },
  {
    value: "exceptional",
    get label() {
      return sourceText("Exceptional leave");
    },
  },
  {
    value: "other",
    get label() {
      return sourceText("Other");
    },
  },
];

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  get draft() {
    return sourceText("Draft");
  },
  get official() {
    return sourceText("Official");
  },
  get cancelled() {
    return sourceText("Cancelled");
  },
};

export const LEAVE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  official: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export function leaveDurationDays(startDate: string, returnDate: string): number {
  if (!startDate || !returnDate) return 0;
  const ms = new Date(returnDate).getTime() - new Date(startDate).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function unwrapLeaveList(payload: unknown): { results: Leave[]; count: number } {
  if (Array.isArray(payload)) {
    return { results: payload as Leave[], count: payload.length };
  }
  const obj = (payload ?? {}) as Record<string, unknown>;
  const inner = (obj.data ?? obj) as Record<string, unknown>;
  const results = (inner.results ?? obj.results) as Leave[] | undefined;
  if (Array.isArray(results)) {
    return { results, count: Number(inner.count ?? obj.count ?? results.length) };
  }
  return { results: [], count: 0 };
}

function toLeaveFormData(data: CreateLeaveData | Partial<CreateLeaveData>): FormData {
  const form = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (key === "signed_document") {
      if (value instanceof File) form.append("signed_document", value);
      return;
    }
    form.append(key, String(value));
  });
  return form;
}

export const leavesApi = {
  list: async (params?: Record<string, string>) => {
    try {
      const response = await apiClient.get<unknown>("/leaves/", { params });
      return unwrapLeaveList(response);
    } catch {
      return { results: [] as Leave[], count: 0 };
    }
  },
  get: (id: number) => apiClient.get<Leave>(`/leaves/${id}/`),
  create: (data: CreateLeaveData) =>
    apiClient.post<Leave>("/leaves/", toLeaveFormData(data)),
  update: (id: number, data: Partial<CreateLeaveData>) =>
    apiClient.patch<Leave>(`/leaves/${id}/`, toLeaveFormData(data)),
  delete: (id: number) => apiClient.delete(`/leaves/${id}/`),
  markOfficial: (id: number) =>
    apiClient.post<Leave>(`/leaves/${id}/mark-official/`),
  cancel: (id: number) => apiClient.post<Leave>(`/leaves/${id}/cancel/`),
};
