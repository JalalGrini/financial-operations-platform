import { describe, expect, it } from "vitest";
import {
  buildFinancialRecordLineInput,
  buildQuickClientPayload,
  canPostFinancialRecord,
  normalizeTemplateDefaults,
  requiredCancellationReason,
  validateQuickClient,
} from "./contracts";

describe("Financial Record UI contracts", () => {
  it("builds exactly one debit or credit side", () => {
    expect(
      buildFinancialRecordLineInput({
        description: " Cash ",
        category: "",
        side: "debit",
        amount: "1250.0000",
      }),
    ).toEqual({
      payload: {
        description: "Cash",
        category: null,
        debit: "1250.0000",
        credit: "0",
      },
    });
    expect(
      buildFinancialRecordLineInput({
        description: "Revenue",
        category: "cat-1",
        side: "credit",
        amount: "1250.0000",
      }).payload,
    ).toEqual({
      description: "Revenue",
      category: "cat-1",
      debit: "0",
      credit: "1250.0000",
    });
    expect(
      buildFinancialRecordLineInput({
        description: "",
        category: "",
        side: "credit",
        amount: "0",
      }).error,
    ).toBe("Enter a positive amount.");
  });

  it("trusts backend posting readiness only for drafts", () => {
    expect(canPostFinancialRecord({ status: "draft", can_post: true })).toBe(
      true,
    );
    expect(canPostFinancialRecord({ status: "draft", can_post: false })).toBe(
      false,
    );
    expect(canPostFinancialRecord({ status: "posted", can_post: true })).toBe(
      false,
    );
  });

  it("requires and trims cancellation reasons", () => {
    expect(requiredCancellationReason("   ").error).toBe(
      "A cancellation reason is required.",
    );
    expect(requiredCancellationReason(" Duplicate import ").value).toBe(
      "Duplicate import",
    );
  });

  it("builds kind-specific quick-client payloads", () => {
    const organization = {
      client_kind: "organization" as const,
      name: " Atlas SARL ",
      first_name: "",
      last_name: "",
      email: " a@example.com ",
      phone: " 1 ",
    };
    expect(validateQuickClient(organization)).toBeNull();
    expect(buildQuickClientPayload("company-1", organization)).toMatchObject({
      company: "company-1",
      client_kind: "organization",
      name: "Atlas SARL",
      first_name: undefined,
    });
    const individual = {
      client_kind: "individual" as const,
      name: "",
      first_name: " Sara ",
      last_name: " Benali ",
      email: "",
      phone: "",
    };
    expect(buildQuickClientPayload("company-1", individual)).toMatchObject({
      client_kind: "individual",
      name: undefined,
      first_name: "Sara",
      last_name: "Benali",
    });
    expect(validateQuickClient({ ...individual, first_name: "" })).toContain(
      "First and last",
    );
  });

  it("keeps false, zero, and empty defaults but omits null/undefined", () => {
    expect(
      normalizeTemplateDefaults([
        { key: "approved", default_value: false },
        { key: "count", default_value: 0 },
        { key: "note", default_value: "" },
        { key: "none", default_value: null },
        { key: "missing", default_value: undefined },
      ]),
    ).toEqual({ approved: false, count: 0, note: "" });
  });
});
