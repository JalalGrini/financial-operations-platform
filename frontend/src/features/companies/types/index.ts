// features/companies/types/index.ts
/**
 * Companies Domain Types
 * Centralized type definitions for the Companies feature
 */

// ============ Enums ============

export const CompanyStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
} as const;

export type CompanyStatus = (typeof CompanyStatus)[keyof typeof CompanyStatus];

// ============ Base Types ============

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SearchParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  [key: string]: string | number | boolean | undefined;
}

// ============ Company Types ============

export interface Company {
  id: string;
  reference: string;
  name: string;
  trade_name?: string;
  registration_number: string;
  tax_id: string;
  vat_number?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  status: CompanyStatus;
  default_currency: string;
  timezone: string;
  default_language: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  is_archived: boolean;
  archived_at?: string;
  archived_by?: string;
}

export interface CompanyDetail extends Company {
  settings?: CompanySettings;
  preferences?: CompanyPreference[];
}

export interface CompanyCreate {
  name: string;
  trade_name?: string;
  registration_number: string;
  tax_id: string;
  vat_number?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  default_currency?: string;
  timezone?: string;
  default_language?: string;
}

export interface CompanyUpdate extends Partial<CompanyCreate> {
  status?: CompanyStatus;
}

// ============ Company Settings ============

export interface CompanySettings {
  id: string;
  company: string;
  invoice_prefix: string;
  invoice_number_format: string;
  default_payment_terms: string;
  default_currency: string;
  require_approval: boolean;
  approval_threshold: number;
  default_tax_rate: number;
  auto_send_invoices: boolean;
  invoice_footer_text: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CompanySettingsCreate {
  invoice_prefix?: string;
  invoice_number_format?: string;
  default_payment_terms?: string;
  default_currency?: string;
  require_approval?: boolean;
  approval_threshold?: number;
  default_tax_rate?: number;
  auto_send_invoices?: boolean;
  invoice_footer_text?: string;
}

export interface CompanySettingsUpdate extends Partial<CompanySettingsCreate> {}

// ============ Company Preferences ============

export interface CompanyPreference {
  id: string;
  company: string;
  key: string;
  value_type: "string" | "integer" | "decimal" | "boolean" | "json";
  value: string;
  typed_value: any;
  description?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CompanyPreferenceCreate {
  key: string;
  value_type: "string" | "integer" | "decimal" | "boolean" | "json";
  value: string;
  description?: string;
}

export interface CompanyPreferenceUpdate
  extends Partial<CompanyPreferenceCreate> {}

// ============ Select Options ============

export interface CompanySelectOption {
  id: string;
  reference: string;
  name: string;
  trade_name?: string;
  city?: string;
  status?: CompanyStatus;
  budget_amount?: number;
  personnel_count?: number;
}

export interface CompanySelectParams {
  active_only?: boolean;
  search?: string;
}

// ============ Statistics ============

export interface CompanyStatistics {
  total_companies: number;
  active_companies: number;
  archived_companies: number;
  total_personnel: number;
  total_balance: number;
}

// ============ Company List Params ============

export interface CompanyListParams extends SearchParams {
  status?: string;
  is_archived?: boolean;
}
