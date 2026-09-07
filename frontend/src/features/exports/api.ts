/*
 * List-export client (v17.20).
 *
 * v17.19 wired ExportableListMixin into six list endpoints, each exposing
 * `export` and `export-options`. The only thing that differs between them is
 * the URL, so there is one client here rather than six near-identical copies
 * spread across the feature folders.
 *
 * Two rules are encoded here, both learned the hard way in v17.19:
 *
 *  1. The format parameter is `output_format`, never `format`. `format` is
 *     reserved by DRF content negotiation (URL_FORMAT_OVERRIDE), so
 *     `?format=csv` is read as "render with a renderer named csv", no such
 *     renderer is registered, and the request dies with 404 before the view
 *     body runs. A backend test pins that 404.
 *
 *  2. Filters are sent as the same query parameters the list screen already
 *     uses for its own list call, because the endpoint runs them through
 *     `filter_queryset`. Pass the screen's current filters and the file
 *     matches what the user is looking at.
 */

import { apiClient } from "@/lib/api";

export type ExportFormat = "xlsx" | "csv" | "pdf";

/** Every format the backend supports, in the order the picker shows them. */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  "xlsx",
  "csv",
  "pdf",
] as const;

export interface ExportColumn {
  field: string;
  header: string;
}

export interface ExportOptions {
  formats: ExportFormat[];
  columns: ExportColumn[];
  row_cap: number;
}

export type ExportParams = Record<
  string,
  string | number | boolean | undefined | null
>;

/**
 * The six endpoints carrying ExportableListMixin. Keys are the frontend's
 * names for them; values are the API paths.
 */
export const LIST_EXPORT_ENDPOINTS = {
  deadlines: "/deadlines/deadlines",
  financialRecords: "/financial-records/records",
  clients: "/parties/clients",
  suppliers: "/parties/suppliers",
  cashTransfers: "/transfers/cash-transfers",
  leaves: "/leaves/leaves",
  // The companies router is registered with an empty prefix, so its export
  // lives at /companies/export/ rather than /companies/companies/export/.
  companies: "/companies",
} as const;

export type ListExportKey = keyof typeof LIST_EXPORT_ENDPOINTS;

function buildExportQuery(
  params: ExportParams,
  format: ExportFormat,
  columns?: readonly string[],
): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });
  searchParams.append("output_format", format);
  // v17.26: the file is written in the language the user is reading the app
  // in. Taken from the document rather than added as an argument so all six
  // existing call sites gain it without being touched, and so it can never
  // disagree with what is on screen.
  if (typeof document !== "undefined" && document.documentElement.lang) {
    searchParams.append("lang", document.documentElement.lang);
  }
  if (columns && columns.length > 0) {
    // The backend splits this on commas and reports unknown names as a 400
    // rather than silently producing a different file.
    searchParams.append("columns", columns.join(","));
  }
  return searchParams.toString();
}

export function listExportApi(key: ListExportKey) {
  const base = LIST_EXPORT_ENDPOINTS[key];
  return {
    /** Formats, column list and row cap, so a picker needs no hard-coding. */
    options: (): Promise<ExportOptions> =>
      apiClient.get<ExportOptions>(`${base}/export-options/`),

    /** The file itself, filtered exactly as the list screen is filtered. */
    download: async (
      params: ExportParams = {},
      format: ExportFormat = "xlsx",
      columns?: readonly string[],
    ): Promise<Blob> => {
      const response = await apiClient.post(
        `${base}/export/?${buildExportQuery(params, format, columns)}`,
        {},
        { responseType: "blob" },
      );
      return response as Blob;
    },
  };
}
