// features/treasury/types/index.ts
/**
 * Treasury module types — mirror apps.treasury serializers.
 */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type AccountKind = "bank" | "cash" | "wallet" | "other";
export type TransactionDirection = "inbound" | "outbound";
export type TransactionStatus = "draft" | "posted" | "cancelled";
export type ReconciliationStatus = "open" | "completed" | "cancelled";

export interface TreasuryAccount {
  id: string;
  reference: string;
  company: string;
  company_name?: string;
  name: string;
  kind: AccountKind;
  currency: string;
  bank_name: string;
  account_number: string;
  iban: string;
  swift: string;
  opening_balance: string | number;
  current_balance: string | number;
  is_active: boolean;
  notes: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreasuryTransaction {
  id: string;
  reference: string;
  account: string;
  account_name?: string;
  transaction_type: string;
  transaction_type_name?: string;
  payment_method: string | null;
  payment_method_name?: string;
  financial_record: string | null;
  direction: TransactionDirection;
  amount: string | number;
  signed_amount?: string | number;
  currency: string;
  transaction_date: string;
  description: string;
  notes: string;
  external_reference: string;
  status: TransactionStatus;
  is_editable?: boolean;
  posted_at?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface BalanceDriftRow {
  account: TreasuryAccount;
  stored_balance: string | number;
  ledger_balance: string | number;
}

export interface Reconciliation {
  id: string;
  reference: string;
  account: string;
  account_name?: string;
  period_start: string;
  period_end: string;
  statement_balance: string | number;
  computed_balance?: string | number;
  difference?: string | number;
  status: ReconciliationStatus;
  is_editable?: boolean;
  completed_at?: string | null;
  notes: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransferInput {
  source_account: string;
  destination_account: string;
  amount: number;
  transaction_date: string;
  description: string;
  transaction_type: string;
  post: boolean;
}
