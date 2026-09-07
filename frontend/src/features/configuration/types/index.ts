// features/configuration/types/index.ts
/**
 * Configuration module types — mirror apps.configuration serializers.
 */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ConfigListParams {
  page?: number;
  page_size?: number;
  search?: string;
  is_archived?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export type ConfigStatus = "active" | "inactive" | "archived";

interface ConfigEntityBase {
  id: string;
  reference: string;
  name: string;
  description: string;
  status: ConfigStatus;
  icon: string;
  color: string;
  display_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category extends Omit<ConfigEntityBase, "icon" | "color"> {
  parent: string | null;
  level: number;
  path: string;
  full_path: string;
  icon: string;
  color: string;
  is_income: boolean;
  is_expense: boolean;
  is_transfer: boolean;
}

export interface FinancialRecordType extends ConfigEntityBase {
  nature: string;
  direction: string;
  default_category: string | null;
  default_category_name?: string;
  requires_validation: boolean;
  requires_approval: boolean;
  allows_partial_payment: boolean;
}

export interface PaymentMethod extends ConfigEntityBase {
  kind: string;
  is_electronic: boolean;
  requires_bank_details: boolean;
  requires_reference: boolean;
  processing_days: number | null;
  fee_percentage: string | number | null;
  fee_fixed: string | number | null;
}

export interface TransactionType extends ConfigEntityBase {
  nature: string;
  direction: string;
  is_credit: boolean;
  is_debit: boolean;
  is_transfer: boolean;
  requires_counterparty: boolean;
  requires_payment_method: boolean;
  requires_reason: boolean;
  requires_approval: boolean;
}

export interface ReportType extends ConfigEntityBase {
  category: string | null;
  category_name?: string;
  frequency: string;
  supports_preview: boolean;
  supports_scheduled: boolean;
  template_name: string;
}

export interface NotificationType extends ConfigEntityBase {
  default_channels: string[];
  default_priority: string;
  subject_template: string;
  body_template: string;
}

export type ConfigEntityKey =
  | "categories"
  | "record-types"
  | "payment-methods"
  | "transaction-types"
  | "report-types"
  | "notification-types";

export type ConfigEntity =
  | Category
  | FinancialRecordType
  | PaymentMethod
  | TransactionType
  | ReportType
  | NotificationType;
