import { apiClient } from "@/lib/api";
export interface AuditEvent {
  id: string;
  created_at: string;
  correlation_id: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  company_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_reference: string;
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: Record<string, { before: unknown; after: unknown }>;
  request_method: string;
  request_path: string;
  result: "success" | "denied" | "failed";
  ip_address: string | null;
  reason: string;
}
export interface AuditPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditEvent[];
}
function qs(params: Record<string, unknown> = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}
/**
 * The language the exported file should be written in.
 *
 * Read from the document rather than taken as an argument, exactly as
 * `features/exports/api.ts::buildExportQuery` does, so it can never disagree
 * with what is on screen and no call site has to remember to pass it.
 */
function exportLang(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const lang = document.documentElement.lang;
  return lang ? { lang } : {};
}

export const auditLogApi = {
  list: (params: Record<string, unknown>) =>
    apiClient.get<AuditPage>(`/audit-log/events/?${qs(params)}`),
  export: (params: Record<string, unknown>) =>
    apiClient.get<Blob>(
      `/audit-log/events/export/?${qs({ ...params, ...exportLang() })}`,
      {
        responseType: "blob",
      },
    ),
};
