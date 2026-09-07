// features/companies/api/types.ts
/**
 * Companies API Types
 * Parameter types for API functions
 */

export interface CompanyListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  ordering?: string;
  is_archived?: boolean;
}

export interface CompanySelectParams {
  active_only?: boolean;
  search?: string;
}
