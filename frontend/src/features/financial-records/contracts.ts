import type {
  CustomFieldDefinition,
  FinancialRecord,
  FinancialRecordLineInput,
} from "./types";

export interface FinancialRecordLineForm {
  description: string;
  category: string;
  side: "debit" | "credit";
  amount: string;
}

export const emptyFinancialRecordLineForm: FinancialRecordLineForm = {
  description: "",
  category: "",
  side: "debit",
  amount: "",
};

export function buildFinancialRecordLineInput(form: FinancialRecordLineForm): {
  payload?: FinancialRecordLineInput;
  error?: string;
} {
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Enter a positive amount." };
  return {
    payload: {
      description: form.description.trim(),
      category: form.category || null,
      debit: form.side === "debit" ? form.amount : "0",
      credit: form.side === "credit" ? form.amount : "0",
    },
  };
}

export function normalizeTemplateDefaults(
  definitions: Pick<CustomFieldDefinition, "key" | "default_value">[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const definition of definitions) {
    if (
      definition.default_value !== null &&
      definition.default_value !== undefined
    ) {
      defaults[definition.key] = definition.default_value;
    }
  }
  return defaults;
}

export interface QuickClientInput {
  client_kind: "individual" | "organization";
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export const emptyQuickClient: QuickClientInput = {
  client_kind: "organization",
  name: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
};

export function validateQuickClient(input: QuickClientInput): string | null {
  if (input.client_kind === "organization" && !input.name.trim())
    return "Organization name is required";
  if (
    input.client_kind === "individual" &&
    (!input.first_name.trim() || !input.last_name.trim())
  ) {
    return "First and last name are required";
  }
  return null;
}

export function buildQuickClientPayload(
  company: string,
  input: QuickClientInput,
): Record<string, unknown> {
  return {
    company,
    client_kind: input.client_kind,
    name: input.client_kind === "organization" ? input.name.trim() : undefined,
    first_name:
      input.client_kind === "individual" ? input.first_name.trim() : undefined,
    last_name:
      input.client_kind === "individual" ? input.last_name.trim() : undefined,
    email: input.email.trim(),
    phone: input.phone.trim(),
    status: "active",
  };
}

export function requiredCancellationReason(reason: string): {
  value?: string;
  error?: string;
} {
  const value = reason.trim();
  return value ? { value } : { error: "A cancellation reason is required." };
}

/** The backend's readiness flag is authoritative; the UI never recomputes accounting readiness. */
export function canPostFinancialRecord(
  record: Pick<FinancialRecord, "status" | "can_post">,
): boolean {
  return record.status === "draft" && record.can_post === true;
}
