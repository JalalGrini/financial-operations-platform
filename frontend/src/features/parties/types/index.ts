// features/parties/types/index.ts
/**
 * Parties module types — mirror apps.parties serializers.
 */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PartyStatus = "active" | "inactive" | "suspended" | "archived";

export interface Client {
  id: string;
  reference: string;
  company: string | null;
  company_name?: string;
  client_kind: "individual" | "organization";
  first_name: string;
  last_name: string;
  national_id: string | null;
  passport_number: string | null;
  name: string;
  trade_name: string;
  registration_number: string;
  tax_id: string;
  vat_number: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  status: PartyStatus;
  credit_limit: string | number | null;
  payment_terms: string;
  default_payment_method: string | null;
  default_currency: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  reference: string;
  company: string | null;
  company_name?: string;
  name: string;
  trade_name: string;
  registration_number: string;
  tax_id: string;
  vat_number: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  status: PartyStatus;
  payment_terms: string;
  default_payment_method: string | null;
  default_currency: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalParty {
  id: string;
  reference: string;
  name: string;
  trade_name: string;
  party_category: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  vat_number: string;
  is_recurring: boolean;
  status: PartyStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssociatedPerson {
  id: string;
  reference: string;
  company: string | null;
  company_name?: string;
  person_type: string | null;
  person_type_name?: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  full_name?: string;
  national_id: string;
  passport_number: string;
  employee_id: string;
  job_title: string;
  department: string;
  hire_date: string | null;
  termination_date: string | null;
  manager: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  status: PartyStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssociatedPersonType {
  id: string;
  reference: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntercompanyBalance {
  id: string;
  reference: string;
  source_company: string | null;
  source_associated_person: string | null;
  target_company: string | null;
  target_associated_person: string | null;
  source_label?: string;
  target_label?: string;
  source_party_kind?: "company" | "associated_person";
  target_party_kind?: "company" | "associated_person";
  amount: string | number;
  balance_date: string;
  reason: string;
  notes: string;
  status: PartyStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}
