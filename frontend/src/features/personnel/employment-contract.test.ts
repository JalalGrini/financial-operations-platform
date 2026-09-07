import { describe, expect, it } from "vitest";
import { ContractType, EmploymentStatus } from "./types";
import {
  buildEmploymentPayload,
  employmentFormSchema,
  getEmploymentFieldErrors,
} from "./employment-contract";

const base = {
  person: "11111111-1111-4111-8111-111111111111",
  company: "22222222-2222-4222-8222-222222222222",
  employee_reference: "ATL-EMP-0001",
  contract_type: ContractType.PERMANENT,
  employment_status: EmploymentStatus.ACTIVE,
  hire_date: "2026-01-02",
  employment_end_date: "",
  payment_method: "",
  default_monthly_working_days: 26,
};

describe("Employment browser contract", () => {
  it("accepts the canonical CDI form and omits empty optional values", () => {
    const parsed = employmentFormSchema.parse(base);
    expect(buildEmploymentPayload(parsed)).toEqual(
      expect.objectContaining({
        person: base.person,
        company: base.company,
        payment_method: undefined,
        employment_end_date: undefined,
        default_monthly_working_days: 26,
      }),
    );
  });

  it("requires an end date for CDD", () => {
    const result = employmentFormSchema.safeParse({
      ...base,
      contract_type: ContractType.FIXED_TERM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === "employment_end_date",
        ),
      ).toBe(true);
    }
  });

  it("sends a payment method UUID, never its label", () => {
    const paymentId = "33333333-3333-4333-8333-333333333333";
    const parsed = employmentFormSchema.parse({
      ...base,
      payment_method: paymentId,
    });
    expect(buildEmploymentPayload(parsed).payment_method).toBe(paymentId);
  });

  it("extracts backend field errors for inline display", () => {
    const error = {
      response: { data: { errors: { payment_method: ["Invalid pk."] } } },
    };
    expect(getEmploymentFieldErrors(error)).toEqual({
      payment_method: "Invalid pk.",
    });
  });
});
