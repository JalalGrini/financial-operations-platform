"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React from "react";
import {
  EntitySection,
  type FieldDef,
} from "@/features/configuration/components/EntitySection";
import { partiesApi } from "@/features/parties/api";
import { useCompanies, usePaymentMethods } from "@/features/personnel/hooks";
import { companyDisplayName, GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import type { Supplier } from "@/features/parties/types";

const PARTY_STATUS_OPTIONS = [
  { value: "active", get label() { return sourceText("Active"); } },
  { value: "inactive", get label() { return sourceText("Inactive"); } },
  { value: "suspended", get label() { return sourceText("Suspended"); } },
];

export function SuppliersSection() {
  const { data: companies } = useCompanies();
  const companyOptions = [
    { value: GROUP_COMPANY_VALUE, label: sourceText("Tout le groupe") },
    ...(companies || []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const { data: paymentMethods } = usePaymentMethods();
  const paymentMethodOptions = (paymentMethods || []).map((m) => ({
    value: m.id,
    label: m.name,
  }));
  const fields: FieldDef[] = [
    {
      name: "company",
      get label() { return sourceText("Company"); },
      type: "select",
      options: companyOptions,
      required: false,
    },
    {
      name: "name",
      get label() { return sourceText("Legal name"); },
      type: "text",
      required: true,
    },
    {
      name: "trade_name",
      get label() { return sourceText("Trade name"); },
      type: "text",
    },
    {
      name: "email",
      get label() { return sourceText("Email"); },
      type: "text",
    },
    {
      name: "phone",
      get label() { return sourceText("Phone"); },
      type: "text",
    },
    {
      name: "registration_number",
      get label() { return sourceText("Registration number"); },
      type: "text",
    },
    {
      name: "tax_id",
      get label() { return sourceText("Tax ID"); },
      type: "text",
    },
    {
      name: "vat_number",
      get label() { return sourceText("VAT number"); },
      type: "text",
    },
    {
      name: "address",
      get label() { return sourceText("Address"); },
      type: "textarea",
    },
    {
      name: "website",
      get label() { return sourceText("Website"); },
      type: "text",
    },
    {
      name: "payment_terms",
      get label() { return sourceText("Payment terms"); },
      type: "text",
      placeholder: sourceText("e.g., Net 30"),
    },
    {
      name: "default_payment_method",
      get label() { return sourceText("Default payment method"); },
      type: "select",
      options: paymentMethodOptions,
      placeholder: sourceText("None"),
    },
    {
      name: "default_currency",
      get label() { return sourceText("Default currency"); },
      type: "text",
      placeholder: sourceText("MAD"),
    },
    {
      name: "status",
      get label() { return sourceText("Status"); },
      type: "select",
      options: PARTY_STATUS_OPTIONS,
    },
  ];
  return (
    <EntitySection<Supplier>
      queryKey="parties:suppliers"
      exportKey="suppliers"
      exportFilenameStem="suppliers_export"
      crud={partiesApi.suppliers}
      title={sourceText("Supplier")}
      description={sourceText(
        "Vendors your companies pay — reusable across financial documents.",
      )}
      columns={[
        {
          key: "reference",
          header: sourceText("Reference"),
          className: "w-28",
          render: (_v: unknown, row: Supplier) => (
            <span className="font-mono text-xs">{row.reference}</span>
          ),
        },
        { key: "name", header: sourceText("Name") },
        {
          key: "company_name",
          header: sourceText("Company"),
          className: "w-36",
          render: (_v: unknown, row: Supplier) =>
            companyDisplayName(row.company_name, sourceText("Tout le groupe")),
        },
      ]}
      fields={fields}
      createDefaults={{ status: "active", default_currency: "MAD" }}
      getEditValues={(s) => ({
        company: s.company || GROUP_COMPANY_VALUE,
        name: s.name,
        trade_name: s.trade_name || "",
        email: s.email || "",
        phone: s.phone || "",
        registration_number: s.registration_number || "",
        tax_id: s.tax_id || "",
        vat_number: s.vat_number || "",
        address: s.address || "",
        website: s.website || "",
        payment_terms: s.payment_terms || "",
        default_payment_method: s.default_payment_method ?? "",
        default_currency: s.default_currency || "MAD",
        status: s.status,
      })}
    />
  );
}
