// features/reports/api/index.ts
/**
 * Reports registry API — /api/v1/reports/.
 *
 * Workflow (backend-authoritative, blueprint Section 5/7/9):
 *   POST /reports/reports/generate/                 -> new Preview version
 *   POST /reports/reports/<id>/regenerate/          -> new version (reason required)
 *   POST /reports/versions/<id>/submit-for-review/  -> Preview -> Pending Review
 *   POST /reports/versions/<id>/approve/            -> Approve (or reject with notes)
 *   GET  /reports/versions/<id>/values/             -> drill-down rows
 *   GET  /reports/versions/export-xlsx/?version=id  -> XLSX download
 */

import { apiClient } from "@/lib/api";
import { sourceText } from "@/lib/i18n/source-catalog";
import type {
  GeneratedReport,
  GeneratedReportDetail,
  PaginatedResponse,
  RegenerateReportInput,
  ReportDriftRow,
  ReportValue,
  ReportValueInput,
  ReportVersion,
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

export const reportsApi = {
  list: async (
    params: Params = {},
  ): Promise<PaginatedResponse<GeneratedReport>> => {
    return apiClient.get<PaginatedResponse<GeneratedReport>>(
      `/reports/reports/${buildQuery(params)}`,
    );
  },
  /** Detail payload: the report plus its embedded version history. */
  get: async (id: string): Promise<GeneratedReportDetail> => {
    return apiClient.get<GeneratedReportDetail>(`/reports/reports/${id}/`);
  },
  generate: async (data: Record<string, unknown>): Promise<ReportVersion> => {
    return apiClient.post<ReportVersion>("/reports/reports/generate/", data);
  },
  uploadReady: async (
    data: Record<string, string>,
    file: File,
  ): Promise<ReportVersion> => {
    const body = new FormData();
    Object.entries(data).forEach(([key, value]) => body.append(key, value));
    body.append("file", file);
    return apiClient.post<ReportVersion>(
      "/reports/reports/upload-ready/",
      body,
    );
  },
  /**
   * Regenerate with an explicit payload.
   *
   * `values` is required by the server on purpose: `services.generate()` stores
   * exactly what it is given and recomputes nothing, so an implicit empty list
   * would replace a populated report with a blank version. Prefer
   * `regenerateCarryingForward` unless you are deliberately restating figures.
   */
  regenerate: async (
    id: string,
    input: RegenerateReportInput,
  ): Promise<ReportVersion> => {
    return apiClient.post<ReportVersion>(
      `/reports/reports/${id}/regenerate/`,
      input,
    );
  },

  /**
   * Map a version's stored values back into the input shape `generate()` wants,
   * so they can be replayed into a new version unchanged.
   *
   * `parent` arrives as a value id but has to go back out as `parent_key`, so
   * the id -> key mapping is rebuilt here from the same result set.
   */
  valuesAsInput: async (versionId: string): Promise<ReportValueInput[]> => {
    const rows = await reportsApi.versions.values(versionId);
    const keyById = new Map<string, string>(rows.map((row) => [row.id, row.key]));

    return rows.map((row) => {
      const sources = row.sources ?? [];
      const sourceIds = sources
        .map((source) => source.financial_record)
        .filter((id): id is string => !!id);
      const contributions: Record<string, string> = {};
      sources.forEach((source) => {
        if (source.financial_record) {
          contributions[source.financial_record] = String(
            source.contribution_amount ?? 0,
          );
        }
      });

      const input: ReportValueInput = {
        key: row.key,
        label: row.label,
        amount: String(row.amount ?? 0),
        period_label: row.period_label ?? "",
        is_available: row.is_available,
      };
      const parentKey = row.parent ? keyById.get(row.parent) : undefined;
      if (parentKey) input.parent_key = parentKey;
      if (sourceIds.length) {
        input.source_record_ids = sourceIds;
        input.source_contributions = contributions;
      }
      return input;
    });
  },

  /**
   * Regenerate while preserving the figures already on record.
   *
   * This is what "regenerate because the source data changed" means when the
   * caller is not restating the numbers: a new version, a recorded reason, and
   * the same values carried over. A report with no computed values (an
   * uploaded ready-file report) correctly carries over an empty list.
   */
  regenerateCarryingForward: async (
    report: Pick<
      GeneratedReport,
      "id" | "current_version"
    >,
    reason: string,
    overrides: Partial<Omit<RegenerateReportInput, "regeneration_reason">> = {},
  ): Promise<ReportVersion> => {
    const values =
      overrides.values ??
      (report.current_version
        ? await reportsApi.valuesAsInput(report.current_version)
        : []);
    return reportsApi.regenerate(report.id, {
      regeneration_reason: reason,
      ...overrides,
      values,
    });
  },
  outdatedDrift: async (): Promise<ReportDriftRow[]> => {
    return apiClient.get<ReportDriftRow[]>("/reports/reports/outdated-drift/");
  },

  versions: {
    list: async (
      params: Params = {},
    ): Promise<PaginatedResponse<ReportVersion>> => {
      return apiClient.get<PaginatedResponse<ReportVersion>>(
        `/reports/versions/${buildQuery(params)}`,
      );
    },
    submitForReview: async (id: string): Promise<ReportVersion> => {
      return apiClient.post<ReportVersion>(
        `/reports/versions/${id}/submit-for-review/`,
        {},
      );
    },
    approve: async (
      id: string,
      approved: boolean,
      notes?: string,
    ): Promise<ReportVersion> => {
      return apiClient.post<ReportVersion>(`/reports/versions/${id}/approve/`, {
        approved,
        notes: notes ?? "",
      });
    },
    values: async (id: string): Promise<ReportValue[]> => {
      const response = await apiClient.get<any>(
        `/reports/versions/${id}/values/`,
      );
      return Array.isArray(response) ? response : (response?.results ?? []);
    },
    /** XLSX export — streamed file download through the browser. */
    exportXlsx: async (id: string, filenameHint: string): Promise<void> => {
      const blob = await apiClient.get<Blob>(
        `/reports/versions/export-xlsx/?version=${encodeURIComponent(id)}`,
        {
          responseType: "blob",
        } as any,
      );
      const url = window.URL.createObjectURL(blob as unknown as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenameHint || sourceText("report_export_file_prefix")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    downloadReadyFile: async (version: ReportVersion): Promise<void> => {
      if (!version.ready_file_download_url) return;
      const blob = await apiClient.get<Blob>(version.ready_file_download_url, {
        responseType: "blob",
      } as any);
      const url = window.URL.createObjectURL(blob as unknown as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        version.ready_file_name || sourceText("report_file_fallback_name");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },
};
