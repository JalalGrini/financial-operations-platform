export interface CashTransfer {
  id: string;
  reference: string;
  from_entity_type: "company" | "associated_person";
  from_company: string | null;
  from_company_name: string | null;
  from_associated_person: string | null;
  from_person_name: string | null;
  from_label: string;
  to_entity_type: "company" | "associated_person";
  to_company: string | null;
  to_company_name: string | null;
  to_associated_person: string | null;
  to_person_name: string | null;
  to_label: string;
  amount: string;
  currency: string;
  transfer_date: string;
  note: string;
  status: "draft" | "confirmed";
  confirmed_at: string | null;
  confirmed_by: string | null;
  is_editable: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashTransferWriteInput {
  from_entity_type: "company" | "associated_person";
  from_company?: string | null;
  from_associated_person?: string | null;
  to_entity_type: "company" | "associated_person";
  to_company?: string | null;
  to_associated_person?: string | null;
  amount: string | number;
  currency?: string;
  transfer_date: string;
  note?: string;
}

export interface TransferSummary {
  total_confirmed_volume: string;
  draft_count: number;
  confirmed_count: number;
  total_count: number;
}

export interface PaginatedTransfers {
  count: number;
  next: string | null;
  previous: string | null;
  results: CashTransfer[];
}

export type TransferEntityType = "company" | "associated_person";

/**
 * A starting position for one entity, so a company or person does not have to
 * begin this budget at zero.
 */
export interface EntityOpeningBalance {
  id: string;
  entity_type: TransferEntityType;
  company: string | null;
  company_name: string | null;
  associated_person: string | null;
  person_name: string | null;
  entity_label: string;
  /** Signed: negative means the entity started in deficit. */
  amount: string;
  currency: string;
  as_of_date: string;
  note: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntityOpeningBalanceWriteInput {
  entity_type: TransferEntityType;
  company?: string | null;
  associated_person?: string | null;
  amount: string | number;
  currency?: string;
  as_of_date?: string;
  note?: string;
}

/** One row of the per-entity balance table. All money values are strings. */
export interface EntityBalanceRow {
  entity_type: TransferEntityType;
  entity_id: string;
  entity_label: string;
  opening_balance: string;
  transfers_in: string;
  transfers_out: string;
  /** in - out. Summed across all entities this is exactly zero. */
  net_transfers: string;
  /** opening_balance + net_transfers */
  current_balance: string;
  pending_in: string;
  pending_out: string;
  pending_net: string;
  projected_balance: string;
}

export interface EntityBalanceTotals {
  opening_balance: string;
  transfers_in: string;
  transfers_out: string;
  /**
   * The integrity check: exactly "0.0000" when the ledger is sound.
   * NOTE current_balance totals to opening_balance, NOT to zero, once any
   * starting position is set.
   */
  net_transfers: string;
  current_balance: string;
  pending_net: string;
  projected_balance: string;
}

export interface EntityBalanceReport {
  currency: string;
  entities: EntityBalanceRow[];
  totals: EntityBalanceTotals;
  other_currencies: string[];
  is_balanced: boolean;
}

export interface PaginatedOpeningBalances {
  count: number;
  next: string | null;
  previous: string | null;
  results: EntityOpeningBalance[];
}
