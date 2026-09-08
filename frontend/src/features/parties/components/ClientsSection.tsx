"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  EntitySection,
  type FieldDef,
} from "@/features/configuration/components/EntitySection";
import { partiesApi } from "@/features/parties/api";
import { useCompanies, usePaymentMethods } from "@/features/personnel/hooks";
import { companyDisplayName, GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import type { Client } from "@/features/parties/types";
const PARTY_STATUS_OPTIONS = [
  {
    value: "active",
    get label() {
      return sourceText("Active");
    },
  },
  {
    value: "inactive",
    get label() {
      return sourceText("Inactive");
    },
  },
  {
    value: "suspended",
    get label() {
      return sourceText("Suspended");
    },
  },
];
export function ClientsSection() {
  const { data: companies } = useCompanies();
  const companyOptions = [
    { value: GROUP_COMPANY_VALUE, label: sourceText("Tout le groupe") },
    ...(companies || []).map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];
  const { data: paymentMethods } = usePaymentMethods();
  const paymentMethodOptions = (paymentMethods || []).map((m) => ({
    value: m.id,
    label: m.name,
  }));
  const fields: FieldDef[] = [
    {
      name: "company",
      get label() {
        return sourceText("Owning EFOP company");
      },
      type: "select",
      options: companyOptions,
      required: false,
    },
    {
      name: "client_kind",
      get label() {
        return sourceText("Client type");
      },
      type: "select",
      required: true,
      options: [
        {
          value: "organization",
          get label() {
            return sourceText("Organization");
          },
        },
        {
          value: "individual",
          get label() {
            return sourceText("Individual");
          },
        },
      ],
    },
    {
      name: "name",
      get label() {
        return sourceText("Legal organization name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Acme SARL"),
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "trade_name",
      get label() {
        return sourceText("Trade name");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "registration_number",
      get label() {
        return sourceText("Registration number");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "tax_id",
      get label() {
        return sourceText("Tax ID");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "vat_number",
      get label() {
        return sourceText("VAT number");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "first_name",
      get label() {
        return sourceText("First name");
      },
      type: "text",
      required: true,
      visibleWhen: { field: "client_kind", equals: "individual" },
    },
    {
      name: "last_name",
      get label() {
        return sourceText("Last name");
      },
      type: "text",
      required: true,
      visibleWhen: { field: "client_kind", equals: "individual" },
    },
    {
      name: "national_id",
      get label() {
        return sourceText("National ID");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "individual" },
    },
    {
      name: "passport_number",
      get label() {
        return sourceText("Passport number");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "individual" },
    },
    {
      name: "email",
      get label() {
        return sourceText("Email");
      },
      type: "text",
    },
    {
      name: "phone",
      get label() {
        return sourceText("Phone");
      },
      type: "text",
    },
    {
      name: "address",
      get label() {
        return sourceText("Address");
      },
      type: "textarea",
    },
    {
      name: "website",
      get label() {
        return sourceText("Website");
      },
      type: "text",
      visibleWhen: { field: "client_kind", equals: "organization" },
    },
    {
      name: "credit_limit",
      get label() {
        return sourceText("Credit limit (MAD)");
      },
      type: "number",
      step: "0.01",
    },
    {
      name: "payment_terms",
      get label() {
        return sourceText("Payment terms");
      },
      type: "text",
      placeholder: sourceText("e.g., Net 30"),
    },
    {
      name: "default_payment_method",
      get label() {
        return sourceText("Default payment method");
      },
      type: "select",
      options: paymentMethodOptions,
      placeholder: sourceText("None"),
    },
    {
      name: "default_currency",
      get label() {
        return sourceText("Default currency");
      },
      type: "text",
      placeholder: sourceText("MAD"),
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: PARTY_STATUS_OPTIONS,
    },
  ];
  return (
    <EntitySection<Client>
      queryKey="parties:clients"
      exportKey="clients"
      exportFilenameStem="clients_export"
      crud={partiesApi.clients}
      title={sourceText("Client")}
      description={sourceText(
        "Reusable individual and organization clients for financial records.",
      )}
      columns={[
        {
          key: "reference",
          header: sourceText("Reference"),
          className: "w-28",
          render: (v) => (
            <span className="font-mono text-xs">
              {{
                active: sourceText("Active"),
                inactive: sourceText("Inactive"),
                suspended: sourceText("Suspended"),
                archived: sourceText("Archived"),
              }[String(v)] || String(v)}
            </span>
          ),
        },
        {
          key: "client_kind",
          header: sourceText("Type"),
          className: "w-28",
          render: (v) => (
            <Badge variant="outline">
              {v === "individual"
                ? sourceText("Individual")
                : sourceText("Organization")}
            </Badge>
          ),
        },
        { key: "name", header: sourceText("Name") },
        {
          key: "company_name",
          header: sourceText("Owning company"),
          className: "w-36",
          render: (_v: unknown, row: Client) =>
            companyDisplayName(row.company_name, sourceText("Tout le groupe")),
        },
        { key: "email", header: sourceText("Email"), className: "w-44" },
        { key: "phone", header: sourceText("Phone"), className: "w-32" },
        {
          key: "status",
          header: sourceText("Status"),
          className: "w-24",
          render: (v) => (
            <Badge variant={v === "active" ? "default" : "outline"}>
              {{
                active: sourceText("Active"),
                inactive: sourceText("Inactive"),
                suspended: sourceText("Suspended"),
                archived: sourceText("Archived"),
              }[String(v)] || String(v)}
            </Badge>
          ),
        },
      ]}
      fields={fields}
      createDefaults={{
        client_kind: "organization",
        status: "active",
        default_currency: "MAD",
      }}
      getEditValues={(c) => ({
        company: c.company || GROUP_COMPANY_VALUE,
        client_kind: c.client_kind,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        national_id: c.national_id || "",
        passport_number: c.passport_number || "",
        name: c.name,
        trade_name: c.trade_name || "",
        email: c.email || "",
        phone: c.phone || "",
        registration_number: c.registration_number || "",
        tax_id: c.tax_id || "",
        vat_number: c.vat_number || "",
        address: c.address || "",
        website: c.website || "",
        credit_limit: c.credit_limit ?? "",
        payment_terms: c.payment_terms || "",
        default_payment_method: c.default_payment_method ?? "",
        default_currency: c.default_currency || "MAD",
        status: c.status,
      })}
    />
  );
}
