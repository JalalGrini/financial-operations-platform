"use client";
import { useRole } from "@/hooks/useRole";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SourceText } from "@/components/i18n/SourceText";
/**
 * Configuration hub — Administrator-managed business configuration:
 * payment methods, categories, transaction types, financial record types,
 * report types and notification types (Cycle 29, M1).
 *
 * Backend: /api/v1/configuration/<entity>/ (six ViewSets, uniform CRUD +
 * archive/restore contract).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CreditCard, FileCog, FolderTree } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  EntitySection,
  type FieldDef,
} from "@/features/configuration/components/EntitySection";
import { configurationApi } from "@/features/configuration/api";
import { useConfigEntityList } from "@/features/configuration/hooks";
import type {
  Category,
  FinancialRecordType,
  NotificationType,
  PaymentMethod,
  ReportType,
  TransactionType,
} from "@/features/configuration/types";
// ---------- shared choice sets (mirror apps/configuration/models.py) ----------
const STATUS_OPTIONS = [
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
];
const KIND_OPTIONS = [
  {
    value: "cash",
    get label() {
      return sourceText("Cash");
    },
  },
  {
    value: "bank_transfer",
    get label() {
      return sourceText("Bank Transfer");
    },
  },
  {
    value: "cheque",
    get label() {
      return sourceText("Cheque");
    },
  },
  {
    value: "card",
    get label() {
      return sourceText("Card");
    },
  },
  {
    value: "deposit",
    get label() {
      return sourceText("Deposit");
    },
  },
  {
    value: "direct_debit",
    get label() {
      return sourceText("Direct Debit");
    },
  },
  {
    value: "other",
    get label() {
      return sourceText("Other");
    },
  },
];
const RECORD_NATURE_OPTIONS = [
  {
    value: "income",
    get label() {
      return sourceText("Income");
    },
  },
  {
    value: "expense",
    get label() {
      return sourceText("Expense");
    },
  },
  {
    value: "transfer",
    get label() {
      return sourceText("Transfer");
    },
  },
  {
    value: "adjustment",
    get label() {
      return sourceText("Adjustment");
    },
  },
];
const TRANSACTION_NATURE_OPTIONS = [
  {
    value: "credit",
    get label() {
      return sourceText("Credit");
    },
  },
  {
    value: "debit",
    get label() {
      return sourceText("Debit");
    },
  },
  {
    value: "both",
    get label() {
      return sourceText("Both (Transfer)");
    },
  },
];
const DIRECTION_OPTIONS = [
  {
    value: "inbound",
    get label() {
      return sourceText("Inbound");
    },
  },
  {
    value: "outbound",
    get label() {
      return sourceText("Outbound");
    },
  },
  {
    value: "internal",
    get label() {
      return sourceText("Internal");
    },
  },
];
const FREQUENCY_OPTIONS = [
  {
    value: "monthly",
    get label() {
      return sourceText("Monthly");
    },
  },
  {
    value: "quarterly",
    get label() {
      return sourceText("Quarterly");
    },
  },
  {
    value: "annual",
    get label() {
      return sourceText("Annual");
    },
  },
  {
    value: "on_demand",
    get label() {
      return sourceText("On Demand");
    },
  },
];
const PRIORITY_OPTIONS = [
  {
    value: "low",
    get label() {
      return sourceText("Low");
    },
  },
  {
    value: "normal",
    get label() {
      return sourceText("Normal");
    },
  },
  {
    value: "high",
    get label() {
      return sourceText("High");
    },
  },
  {
    value: "urgent",
    get label() {
      return sourceText("Urgent");
    },
  },
];
const statusColumn = {
  key: "status",
  header: sourceText("Status"),
  className: "w-24",
  render: (v: unknown) => {
    const status = String(v ?? "");
    return (
    <Badge variant={status === "active" ? "default" : "outline"}>
      {{
        active: sourceText("Active"),
        inactive: sourceText("Inactive"),
        suspended: sourceText("Suspended"),
        archived: sourceText("Archived"),
      }[status] || status}
    </Badge>
    );
  },
};
const refColumn = {
  key: "reference",
  header: sourceText("Reference"),
  className: "w-28",
  render: (
    _v: unknown,
    row: {
      reference: string;
    },
  ) => <span className="font-mono text-xs">{row.reference}</span>,
};
const nameColumn = { key: "name", header: sourceText("Name") };

function titleCaseEnum(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const boolBadge = (key: string, label?: string) => ({
  key,
  header: sourceText(label || titleCaseEnum(key)),
  className: "w-28",
  render: (v: unknown) => (
    <Badge variant={v ? "default" : "outline"}>
      {v ? sourceText("Yes") : sourceText("No")}
    </Badge>
  ),
});

const paymentMethodKindLabels: Record<string, string> = {
  cash: sourceText("Cash"),
  bank_transfer: sourceText("Bank Transfer"),
  cheque: sourceText("Cheque"),
  card: sourceText("Card"),
  deposit: sourceText("Deposit"),
  direct_debit: sourceText("Direct Debit"),
  other: sourceText("Other"),
};

const recordNatureLabels: Record<string, string> = {
  income: sourceText("Income"),
  expense: sourceText("Expense"),
  transfer: sourceText("Transfer"),
  adjustment: sourceText("Adjustment"),
};

const transactionNatureLabels: Record<string, string> = {
  credit: sourceText("Credit"),
  debit: sourceText("Debit"),
  both: sourceText("Both (Transfer)"),
};

const directionLabels: Record<string, string> = {
  inbound: sourceText("Inbound"),
  outbound: sourceText("Outbound"),
  internal: sourceText("Internal"),
};

const frequencyLabels: Record<string, string> = {
  monthly: sourceText("Monthly"),
  quarterly: sourceText("Quarterly"),
  annual: sourceText("Annual"),
  on_demand: sourceText("On Demand"),
};

const priorityLabels: Record<string, string> = {
  low: sourceText("Low"),
  normal: sourceText("Normal"),
  high: sourceText("High"),
  urgent: sourceText("Urgent"),
};

function SummaryTile({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/90 shadow-[0_12px_28px_rgba(15,23,42,.05)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
          <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function TabCount({ value }: { value: number }) {
  return (
    <Badge variant="secondary" className="ms-2 min-w-8 justify-center">
      {value}
    </Badge>
  );
}

// ---------- Payment Methods ----------
function PaymentMethodsSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Bank Transfer"),
    },
    {
      name: "kind",
      get label() {
        return sourceText("Kind");
      },
      type: "select",
      options: KIND_OPTIONS,
      required: true,
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "is_electronic",
      get label() {
        return sourceText("Electronic payment");
      },
      type: "checkbox",
    },
    {
      name: "requires_bank_details",
      get label() {
        return sourceText("Requires bank details (RIB/IBAN)");
      },
      type: "checkbox",
    },
    {
      name: "requires_reference",
      get label() {
        return sourceText("Requires a reference number");
      },
      type: "checkbox",
    },
    {
      name: "processing_days",
      get label() {
        return sourceText("Processing days");
      },
      type: "number",
      help: sourceText("Days until the payment clears (optional)"),
    },
    {
      name: "fee_percentage",
      get label() {
        return sourceText("Fee %");
      },
      type: "number",
      step: "0.01",
    },
    {
      name: "fee_fixed",
      get label() {
        return sourceText("Fee (fixed amount)");
      },
      type: "number",
      step: "0.01",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<PaymentMethod>
      queryKey="configuration:payment-methods"
      crud={configurationApi["payment-methods"]}
      title={sourceText("Payment Method")}
      description={sourceText(
        "Methods used across employments and payroll payments.",
      )}
      columns={[
        refColumn,
        nameColumn,
        {
          key: "kind",
          header: sourceText("Kind"),
          render: (v) => (
            <Badge variant="outline">
              {paymentMethodKindLabels[String(v)] ||
                sourceText(titleCaseEnum(String(v)))}
            </Badge>
          ),
          className: "w-32",
        },
        boolBadge("is_electronic", "Electronic payment"),
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{
        kind: "bank_transfer",
        status: "active",
        is_electronic: false,
        requires_bank_details: false,
        requires_reference: false,
      }}
      getEditValues={(m) => ({
        name: m.name,
        kind: m.kind,
        description: m.description || "",
        is_electronic: m.is_electronic,
        requires_bank_details: m.requires_bank_details,
        requires_reference: m.requires_reference,
        processing_days: m.processing_days ?? "",
        fee_percentage: m.fee_percentage ?? "",
        fee_fixed: m.fee_fixed ?? "",
        status: m.status,
        display_order: m.display_order ?? "",
      })}
    />
  );
}
// ---------- Categories ----------
function CategoriesSection() {
  // Parent options come from the live list (active, non-archived categories).
  const { data: categories } = useConfigEntityList<Category>("categories", {
    page_size: 200,
  });
  const parentOptions = (categories?.results || []).map((c) => ({
    value: c.id,
    label: c.full_path || c.name,
  }));
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
    },
    {
      name: "parent",
      get label() {
        return sourceText("Parent category");
      },
      type: "select",
      options: parentOptions,
      placeholder: sourceText("None (top level)"),
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "is_income",
      get label() {
        return sourceText("Income category");
      },
      type: "checkbox",
    },
    {
      name: "is_expense",
      get label() {
        return sourceText("Expense category");
      },
      type: "checkbox",
    },
    {
      name: "is_transfer",
      get label() {
        return sourceText("Transfer category");
      },
      type: "checkbox",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<Category>
      queryKey="configuration:categories"
      crud={configurationApi.categories}
      title={sourceText("Category")}
      description={sourceText(
        "Hierarchical classification for financial records and transactions.",
      )}
      columns={[
        refColumn,
        {
          key: "full_path",
          header: sourceText("Path"),
          render: (_v: unknown, row: Category) => (
            <span>{row.full_path || row.name}</span>
          ),
        },
        boolBadge("is_income", "Income category"),
        boolBadge("is_expense", "Expense category"),
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{
        status: "active",
        is_income: false,
        is_expense: false,
        is_transfer: false,
      }}
      getEditValues={(c) => ({
        name: c.name,
        parent: c.parent ?? "",
        description: c.description || "",
        is_income: c.is_income,
        is_expense: c.is_expense,
        is_transfer: c.is_transfer,
        status: c.status,
        display_order: c.display_order ?? "",
      })}
    />
  );
}
// ---------- Transaction Types ----------
function TransactionTypesSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Client Payment"),
    },
    {
      name: "nature",
      get label() {
        return sourceText("Nature");
      },
      type: "select",
      options: TRANSACTION_NATURE_OPTIONS,
      required: true,
    },
    {
      name: "direction",
      get label() {
        return sourceText("Direction");
      },
      type: "select",
      options: DIRECTION_OPTIONS,
      required: true,
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "requires_counterparty",
      get label() {
        return sourceText("Requires counterparty");
      },
      type: "checkbox",
    },
    {
      name: "requires_payment_method",
      get label() {
        return sourceText("Requires payment method");
      },
      type: "checkbox",
    },
    {
      name: "requires_reason",
      get label() {
        return sourceText("Requires reason");
      },
      type: "checkbox",
    },
    {
      name: "requires_approval",
      get label() {
        return sourceText("Requires approval");
      },
      type: "checkbox",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<TransactionType>
      queryKey="configuration:transaction-types"
      crud={configurationApi["transaction-types"]}
      title={sourceText("Transaction Type")}
      description={sourceText("Types of treasury movements and their rules.")}
      columns={[
        refColumn,
        nameColumn,
        {
          key: "nature",
          header: sourceText("Nature"),
          render: (v) => (
            <Badge variant="outline">
              {transactionNatureLabels[String(v)] || String(v)}
            </Badge>
          ),
          className: "w-24",
        },
        {
          key: "direction",
          header: sourceText("Direction"),
          render: (v) => (
            <Badge variant="outline">
              {directionLabels[String(v)] || String(v)}
            </Badge>
          ),
          className: "w-28",
        },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{
        nature: "debit",
        direction: "outbound",
        status: "active",
      }}
      getEditValues={(t) => ({
        name: t.name,
        nature: t.nature,
        direction: t.direction,
        description: t.description || "",
        requires_counterparty: t.requires_counterparty,
        requires_payment_method: t.requires_payment_method,
        requires_reason: t.requires_reason,
        requires_approval: t.requires_approval,
        status: t.status,
        display_order: t.display_order ?? "",
      })}
    />
  );
}
// ---------- Financial Record Types ----------
function RecordTypesSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Supplier Invoice"),
    },
    {
      name: "nature",
      get label() {
        return sourceText("Nature");
      },
      type: "select",
      options: RECORD_NATURE_OPTIONS,
      required: true,
    },
    {
      name: "direction",
      get label() {
        return sourceText("Direction");
      },
      type: "select",
      options: DIRECTION_OPTIONS,
      required: true,
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "requires_validation",
      get label() {
        return sourceText("Requires validation");
      },
      type: "checkbox",
    },
    {
      name: "requires_approval",
      get label() {
        return sourceText("Requires approval");
      },
      type: "checkbox",
    },
    {
      name: "allows_partial_payment",
      get label() {
        return sourceText("Allows partial payment");
      },
      type: "checkbox",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<FinancialRecordType>
      queryKey="configuration:record-types"
      crud={configurationApi["record-types"]}
      title={sourceText("Record Type")}
      description={sourceText(
        "Types of financial documents (invoices, expenses, charges\u2026).",
      )}
      columns={[
        refColumn,
        nameColumn,
        {
          key: "nature",
          header: sourceText("Nature"),
          render: (v) => (
            <Badge variant="outline">
              {recordNatureLabels[String(v)] || String(v)}
            </Badge>
          ),
          className: "w-28",
        },
        {
          key: "direction",
          header: sourceText("Direction"),
          render: (v) => (
            <Badge variant="outline">
              {directionLabels[String(v)] || String(v)}
            </Badge>
          ),
          className: "w-28",
        },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{
        nature: "expense",
        direction: "outbound",
        status: "active",
      }}
      getEditValues={(t) => ({
        name: t.name,
        nature: t.nature,
        direction: t.direction,
        description: t.description || "",
        requires_validation: t.requires_validation,
        requires_approval: t.requires_approval,
        allows_partial_payment: t.allows_partial_payment,
        status: t.status,
        display_order: t.display_order ?? "",
      })}
    />
  );
}
// ---------- Report Types ----------
function ReportTypesSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Monthly Payroll Summary"),
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "frequency",
      get label() {
        return sourceText("Frequency");
      },
      type: "select",
      options: FREQUENCY_OPTIONS,
      required: true,
    },
    {
      name: "template_name",
      get label() {
        return sourceText("Template name");
      },
      type: "text",
      placeholder: sourceText("Report template identifier"),
    },
    {
      name: "supports_preview",
      get label() {
        return sourceText("Supports preview");
      },
      type: "checkbox",
    },
    {
      name: "supports_scheduled",
      get label() {
        return sourceText("Supports scheduled generation");
      },
      type: "checkbox",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<ReportType>
      queryKey="configuration:report-types"
      crud={configurationApi["report-types"]}
      title={sourceText("Report Type")}
      description={sourceText(
        "Report templates and their generation behavior.",
      )}
      columns={[
        refColumn,
        nameColumn,
        {
          key: "frequency",
          header: sourceText("Frequency"),
          render: (v) => (
            <Badge variant="outline">
              {frequencyLabels[String(v)] ||
                sourceText(titleCaseEnum(String(v)))}
            </Badge>
          ),
          className: "w-28",
        },
        boolBadge("supports_preview", "Supports preview"),
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{
        frequency: "monthly",
        status: "active",
        supports_preview: true,
      }}
      getEditValues={(t) => ({
        name: t.name,
        description: t.description || "",
        frequency: t.frequency,
        template_name: t.template_name || "",
        supports_preview: t.supports_preview,
        supports_scheduled: t.supports_scheduled,
        status: t.status,
        display_order: t.display_order ?? "",
      })}
    />
  );
}
// ---------- Notification Types ----------
function NotificationTypesSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Payment Received"),
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "default_priority",
      get label() {
        return sourceText("Default priority");
      },
      type: "select",
      options: PRIORITY_OPTIONS,
      required: true,
    },
    {
      name: "subject_template",
      get label() {
        return sourceText("Subject template");
      },
      type: "text",
    },
    {
      name: "body_template",
      get label() {
        return sourceText("Body template");
      },
      type: "textarea",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "display_order",
      get label() {
        return sourceText("Display order");
      },
      type: "number",
    },
  ];
  return (
    <EntitySection<NotificationType>
      queryKey="configuration:notification-types"
      crud={configurationApi["notification-types"]}
      title={sourceText("Notification Type")}
      description={sourceText(
        "Notification definitions, channels and priorities.",
      )}
      columns={[
        refColumn,
        nameColumn,
        {
          key: "default_priority",
          header: sourceText("Priority"),
          render: (v) => (
            <Badge variant="outline">
              {priorityLabels[String(v)] || String(v)}
            </Badge>
          ),
          className: "w-24",
        },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{ default_priority: "normal", status: "active" }}
      getEditValues={(t) => ({
        name: t.name,
        description: t.description || "",
        default_priority: t.default_priority,
        subject_template: t.subject_template || "",
        body_template: t.body_template || "",
        status: t.status,
        display_order: t.display_order ?? "",
      })}
    />
  );
}
// ---------- Page ----------
export default function ConfigurationPage() {
  const paymentMethodsQuery = useQuery({
    queryKey: ["configuration:payment-methods", "summary"],
    queryFn: () =>
      configurationApi["payment-methods"].list({
        page_size: 1,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 5,
  });
  const categoriesQuery = useQuery({
    queryKey: ["configuration:categories", "summary"],
    queryFn: () =>
      configurationApi.categories.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 5,
  });
  const recordTypesQuery = useQuery({
    queryKey: ["configuration:record-types", "summary"],
    queryFn: () =>
      configurationApi["record-types"].list({
        page_size: 1,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 5,
  });
  const transactionTypesQuery = useQuery({
    queryKey: ["configuration:transaction-types", "summary"],
    queryFn: () =>
      configurationApi["transaction-types"].list({
        page_size: 1,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 5,
  });
  const reportTypesQuery = useQuery({
    queryKey: ["configuration:report-types", "summary"],
    queryFn: () =>
      configurationApi["report-types"].list({
        page_size: 1,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 5,
  });
  const notificationTypesQuery = useQuery({
    queryKey: ["configuration:notification-types", "summary"],
    queryFn: () =>
      configurationApi["notification-types"].list({
        page_size: 1,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 5,
  });

  const anyError = paymentMethodsQuery.isError || categoriesQuery.isError || recordTypesQuery.isError;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Configuration");
            },
            isCurrent: true,
          },
        ]}
      />
      {anyError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <SourceText source="Some configuration data failed to load. Counts may be incomplete. Please refresh." />
        </div>
      )}
      <PageHero
        icon={FileCog}
        eyebrow="Administrator workspace"
        title={sourceText("Configuration")}
        description={sourceText("Administrator-managed business configuration: payment methods, categories, record types, transaction types, report types and notification types.")}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={CreditCard} label={sourceText("Payment Methods")} value={paymentMethodsQuery.data?.count ?? 0} tone="primary" />
          <StatCard icon={FolderTree} label={sourceText("Categories")} value={categoriesQuery.data?.count ?? 0} tone="indigo" />
          <StatCard icon={FileCog} label={sourceText("Record Types")} value={recordTypesQuery.data?.count ?? 0} tone="emerald" />
          <StatCard icon={FolderTree} label={sourceText("Transaction Types")} value={transactionTypesQuery.data?.count ?? 0} tone="amber" />
          <StatCard icon={FileCog} label={sourceText("Report Types")} value={reportTypesQuery.data?.count ?? 0} tone="rose" />
          <StatCard icon={BellRing} label={sourceText("Notification Types")} value={notificationTypesQuery.data?.count ?? 0} tone="primary" />
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText("Administrator guidance")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {sourceText("Configuration changes shape downstream workflows")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sourceText(
              "Treat these entities as product infrastructure: they control forms, labels, validation and operational consistency across EFOP.",
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              {sourceText(
                "Keep labels clear because teams will see them everywhere.",
              )}
            </li>
            <li>
              {sourceText(
                "Archive instead of deleting when a configuration item should stop being used.",
              )}
            </li>
            <li>
              {sourceText(
                "Review numbering, directions and priorities carefully before publishing changes.",
              )}
            </li>
          </ul>
        </div>
      </section>

      <Tabs defaultValue="payment-methods">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/70 bg-card/80 p-2">
          <TabsTrigger value="payment-methods">
            <SourceText source="Payment Methods" />
            <TabCount value={paymentMethodsQuery.data?.count ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="categories">
            <SourceText source="Categories" />
            <TabCount value={categoriesQuery.data?.count ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="record-types">
            <SourceText source="Record Types" />
            <TabCount value={recordTypesQuery.data?.count ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="transaction-types">
            <SourceText source="Transaction Types" />
            <TabCount value={transactionTypesQuery.data?.count ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="report-types">
            <SourceText source="Report Types" />
            <TabCount value={reportTypesQuery.data?.count ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="notification-types">
            <SourceText source="Notification Types" leading trailing />
            <TabCount value={notificationTypesQuery.data?.count ?? 0} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="payment-methods" className="pt-4">
          <PaymentMethodsSection />
        </TabsContent>
        <TabsContent value="categories" className="pt-4">
          <CategoriesSection />
        </TabsContent>
        <TabsContent value="record-types" className="pt-4">
          <RecordTypesSection />
        </TabsContent>
        <TabsContent value="transaction-types" className="pt-4">
          <TransactionTypesSection />
        </TabsContent>
        <TabsContent value="report-types" className="pt-4">
          <ReportTypesSection />
        </TabsContent>
        <TabsContent value="notification-types" className="pt-4">
          <NotificationTypesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
