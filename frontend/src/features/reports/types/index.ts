// features/reports/types/index.ts
/**
 * Reports registry types — mirror apps.reports serializers.
 * Workflow: generate (preview) → submit-for-review → approve → versioned,
 * immutable official documents with XLSX export.
 */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ReportStatus =
  | "draft"
  | "preview"
  | "pending_review"
  | "approved"
  | "rejected"
  | "outdated"
  | string;

export interface GeneratedReport {
  id: string;
  reference: string;
  company: string;
  company_name?: string;
  report_type: string;
  report_type_name?: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: ReportStatus;
  current_version: string | null;
  latest_version_number: number;
  custom_fields?: Record<string, unknown>;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /reports/reports/{id}/ — GeneratedReportDetailSerializer.
 * Same as the list row plus the embedded version history, so the detail page
 * does not need a second request to render the timeline.
 */
export interface GeneratedReportDetail extends GeneratedReport {
  versions: ReportVersion[];
}

export interface ReportVersion {
  id: string;
  report: string;
  version_number: number;
  status: ReportStatus;
  generation_mode: string;
  calculation_mode: string;
  is_partial: boolean;
  missing_periods: string[];
  generated_at: string;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  approved_at?: string | null;
  notes: string;
  regeneration_reason?: string;
  outdated_at?: string | null;
  outdated_reason?: string;
  /** False once a version is approved/current-official/outdated. */
  is_editable?: boolean;
  is_archived?: boolean;
  ready_file_name?: string;
  ready_file_content_type?: string;
  ready_file_size_bytes?: number;
  ready_file_download_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReportDriftRow {
  report: GeneratedReport;
  version_number: number;
  stale_financial_record_ids: string[];
}

/** One financial record contributing to a report value (drill-down leaf). */
export interface ReportValueSource {
  id: string;
  value: string;
  financial_record: string | null;
  financial_record_reference?: string | null;
  contribution_amount: string | number | null;
  created_at?: string;
}

export interface ReportValue {
  id: string;
  version?: string;
  /** Parent value id, or null for a top-level figure. */
  parent?: string | null;
  key: string;
  label: string;
  amount: string | number | null;
  period_label: string;
  is_available: boolean;
  sources?: ReportValueSource[];
  created_at?: string;
}

/**
 * The shape `services.generate()` consumes for each figure.
 *
 * `generate()` PERSISTS these verbatim and recomputes nothing, so regenerating
 * with an empty list produces an empty version. That is why the API layer
 * carries the previous version's values forward by default rather than
 * defaulting to [].
 */
export interface ReportValueInput {
  key: string;
  label: string;
  amount: string;
  period_label: string;
  is_available: boolean;
  parent_key?: string;
  source_record_ids?: string[];
  source_contributions?: Record<string, string>;
}

export interface RegenerateReportInput {
  regeneration_reason: string;
  values: ReportValueInput[];
  mode?: string;
  calculation_mode?: string;
  is_partial?: boolean;
  missing_periods?: string[];
}
