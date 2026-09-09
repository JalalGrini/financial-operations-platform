import { z } from "zod";
import { companyFieldToApi, GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import {
  ContractType,
  EmploymentDepartureReason,
  EmploymentStatus,
  type EmploymentCreate,
} from "./types";

export const CONTRACT_TYPES_REQUIRING_END_DATE: ContractType[] = [
  ContractType.FIXED_TERM,
  ContractType.TEMPORARY,
  ContractType.INTERNSHIP,
  ContractType.APPRENTICESHIP,
  ContractType.SEASONAL,
];

const optionalDate = z
  .union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Utilisez le format JJ/MM/AAAA"),
  ])
  .optional();

/** Optional money amount: blank, or a non-negative number with up to 4 decimals. */
const optionalAmount = z
  .union([
    z.literal(""),
    z
      .string()
      .regex(
        /^\d+([.,]\d{1,4})?$/,
        "Saisissez un montant positif (4 décimales maximum)",
      ),
  ])
  .optional();

export const employmentFormSchema = z
  .object({
    person: z.string().uuid("Select a valid employee"),
    company: z
      .string()
      .min(1, "Select a valid company")
      .refine(
        (value) => value === GROUP_COMPANY_VALUE || z.string().uuid().safeParse(value).success,
        "Select a valid company",
      ),
    employee_reference: z
      .string()
      .trim()
      .min(1, "La référence salarié est obligatoire")
      .max(50),
    job_title: z.string().max(200).optional(),
    department: z.string().max(100).optional(),
    work_domain: z.string().max(100).optional(),
    work_city: z.string().max(100).optional(),
    contract_type: z.nativeEnum(ContractType),
    employment_status: z
      .nativeEnum(EmploymentStatus)
      .default(EmploymentStatus.ACTIVE),
    hire_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La date d'embauche est obligatoire"),
    employment_end_date: optionalDate,
    departure_reason: z.nativeEnum(EmploymentDepartureReason).optional(),
    resignation_date: optionalDate,
    payment_method: z
      .union([z.literal(""), z.string().uuid("Select a valid payment method")])
      .optional(),
    payout_method: z.enum(["cash", "bank"]).default("cash"),
    rib: z.string().max(50).optional(),
    default_monthly_working_days: z.number().int().min(1).max(31).default(26),
    authorized_leave_days_per_year: z.number().int().min(0).max(365).default(18),
    // Per-employee day pricing. Kept as strings in the form so "empty" stays
    // distinguishable from 0 - empty means "derive the rate from gross salary /
    // scheduled days" while 0 is a real price the payroll must honour. The
    // payload builder converts them to a number or an explicit null.
    worked_day_rate: optionalAmount,
    absence_day_rate: optionalAmount,
    observations: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      CONTRACT_TYPES_REQUIRING_END_DATE.includes(data.contract_type) &&
      !data.employment_end_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employment_end_date"],
        message:
          "La date de fin est obligatoire pour ce contrat à durée déterminée",
      });
    }
    if (
      data.employment_end_date &&
      data.hire_date &&
      data.employment_end_date <= data.hire_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employment_end_date"],
        message: "La date de fin doit être postérieure à la date d'embauche",
      });
    }
    const departed = [
      EmploymentStatus.RESIGNED,
      EmploymentStatus.TERMINATED,
      EmploymentStatus.RETIRED,
      EmploymentStatus.FORMER,
    ].includes(data.employment_status);
    if (departed && !data.departure_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departure_reason"],
        message: "Le motif de départ est obligatoire",
      });
    }
    if (departed && !data.resignation_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resignation_date"],
        message: "La date de départ est obligatoire",
      });
    }
    if (data.payout_method === "bank" && !data.rib?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rib"],
        message: "Le RIB est requis pour un virement bancaire",
      });
    }
  });

export type EmploymentFormValues = z.infer<typeof employmentFormSchema>;

const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Blank clears the rate, which must reach the API as an explicit `null` rather
 * than being omitted - omitting it would leave a previously saved rate in place,
 * so the user could never go back to the derived default.
 */
const optionalNumber = (value: string | undefined): number | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildEmploymentPayload(
  values: EmploymentFormValues,
): EmploymentCreate {
  return {
    person: values.person,
    company: companyFieldToApi(values.company),
    employee_reference: values.employee_reference.trim(),
    job_title: optional(values.job_title),
    department: optional(values.department),
    work_domain: optional(values.work_domain),
    work_city: optional(values.work_city),
    contract_type: values.contract_type,
    employment_status: values.employment_status,
    hire_date: values.hire_date,
    employment_end_date: optional(values.employment_end_date),
    departure_reason: values.departure_reason,
    resignation_date: optional(values.resignation_date),
    payment_method: optional(values.payment_method),
    payout_method: values.payout_method || "cash",
    rib: optional(values.rib),
    default_monthly_working_days: values.default_monthly_working_days,
    authorized_leave_days_per_year: values.authorized_leave_days_per_year,
    worked_day_rate: optionalNumber(values.worked_day_rate),
    absence_day_rate: optionalNumber(values.absence_day_rate),
    observations: optional(values.observations),
  };
}

const EMPLOYMENT_FIELDS = new Set<keyof EmploymentFormValues>([
  "person",
  "company",
  "employee_reference",
  "job_title",
  "department",
  "work_domain",
  "work_city",
  "contract_type",
  "employment_status",
  "hire_date",
  "employment_end_date",
  "departure_reason",
  "resignation_date",
  "payment_method",
  "payout_method",
  "rib",
  "default_monthly_working_days",
  "authorized_leave_days_per_year",
  "worked_day_rate",
  "absence_day_rate",
  "observations",
]);

function firstMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) return message;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstMessage(item);
      if (message) return message;
    }
  }
  return null;
}

export function getEmploymentFieldErrors(
  error: unknown,
): Partial<Record<keyof EmploymentFormValues, string>> {
  const response = (error as { response?: { data?: unknown } })?.response?.data;
  const envelope = response as { errors?: unknown } | undefined;
  const raw = envelope?.errors;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Partial<Record<keyof EmploymentFormValues, string>> = {};
  for (const [field, value] of Object.entries(raw)) {
    if (!EMPLOYMENT_FIELDS.has(field as keyof EmploymentFormValues)) continue;
    const message = firstMessage(value);
    if (message) result[field as keyof EmploymentFormValues] = message;
  }
  return result;
}
