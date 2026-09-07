/** Typed contracts for Financial Records and document templates. */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type FinancialRecordStatus = "draft" | "posted" | "cancelled";
export type TemplateStatus = "draft" | "published" | "archived";
export type TemplateFieldType =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "choice"
  | "multi_choice"
  | "email"
  | "url";

export interface CustomFieldDefinition {
  id: string;
  key: string;
  /** Explicit transition aliases returned by the backend. */
  name: string;
  label: string;
  data_type: TemplateFieldType;
  field_type: TemplateFieldType;
  is_required: boolean;
  required: boolean;
  choices: string[];
  help_text: string;
  default_value: unknown;
  display_order: number;
  section: string;
  max_length: number | null;
  validation: Record<string, unknown>;
  source: "global" | "template";
}

export interface FinancialDocumentTemplateField {
  id?: string;
  key: string;
  label: string;
  data_type: TemplateFieldType;
  is_required: boolean;
  display_order: number;
  section: string;
  help_text: string;
  default_value: unknown;
  choices: string[];
  max_length: number | null;
  validation: Record<string, unknown>;
  output_mapping: Record<string, unknown>;
  is_active: boolean;
}

export interface FinancialDocumentTemplate {
  id: string;
  record_type: string;
  record_type_name: string;
  name: string;
  version: number;
  status: TemplateStatus;
  description: string;
  effective_from: string | null;
  effective_to: string | null;
  is_default: boolean;
  output_mapping: Record<string, unknown>;
  published_at: string | null;
  fields: FinancialDocumentTemplateField[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateFieldInput {
  key: string;
  label: string;
  data_type: TemplateFieldType;
  is_required?: boolean;
  display_order?: number;
  section?: string;
  help_text?: string;
  default_value?: unknown;
  choices?: string[];
  max_length?: number | null;
  validation?: Record<string, unknown>;
  output_mapping?: Record<string, unknown>;
  is_active?: boolean;
}

export interface TemplateWriteInput {
  record_type: string;
  name: string;
  description?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  output_mapping?: Record<string, unknown>;
  fields: TemplateFieldInput[];
}

export interface FinancialRecordLine {
  id: string;
  line_number: number;
  description: string;
  category: string | null;
  category_name?: string;
  debit: string;
  credit: string;
  signed_amount: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialRecordLineInput {
  description?: string;
  category?: string | null;
  debit: string;
  credit: string;
}

export interface FinancialRecordAttachment {
  id: string;
  file_key: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
  created_at: string;
}

export interface FinancialRecord {
  id: string;
  reference: string;
  company: string;
  company_name?: string;
  record_type: string;
  record_type_name?: string;
  template: string | null;
  template_name?: string | null;
  template_version?: number | null;
  template_snapshot?: Record<string, unknown>;
  category: string | null;
  category_name?: string;
  client: string | null;
  client_name?: string | null;
  supplier: string | null;
  supplier_name?: string | null;
  record_date: string;
  description: string;
  notes?: string;
  currency: string;
  total_amount: string;
  status: FinancialRecordStatus;
  is_editable: boolean;
  custom_fields: Record<string, unknown>;
  is_archived: boolean;
  lines?: FinancialRecordLine[];
  attachments?: FinancialRecordAttachment[];
  line_count?: number;
  debit_total?: string;
  credit_total?: string;
  balance?: string;
  can_post?: boolean;
  post_blockers?: string[];
  posted_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialRecordCreateInput {
  company: string;
  record_type: string;
  template?: string | null;
  category?: string | null;
  client?: string | null;
  supplier?: string | null;
  record_date: string;
  description: string;
  notes?: string;
  currency?: string;
  custom_fields?: Record<string, unknown>;
}

export interface CustomFieldContract {
  entity: string;
  record_type: string;
  template: FinancialDocumentTemplate | null;
  definitions: CustomFieldDefinition[];
}
