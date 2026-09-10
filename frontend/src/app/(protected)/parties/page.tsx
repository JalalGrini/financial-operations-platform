"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
/**
 * Parties hub — External Parties, Associated Persons and Person Types
 * (Cycle 29, M2). Clients and Suppliers are sibling top-level modules.
 *
 * Backend: /api/v1/parties/<external-parties|associated-persons|person-types>/
 * (uniform CRUD + archive/restore).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { companyDisplayName, GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import { Landmark, Tag, Users2 } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { Breadcrumb } from "@/components/ui/page-components";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceText } from "@/components/i18n/SourceText";
import {
  EntitySection,
  type FieldDef,
} from "@/features/configuration/components/EntitySection";
import { partiesApi } from "@/features/parties/api";
import { useCompanies } from "@/features/personnel/hooks";
import type {
  AssociatedPerson,
  AssociatedPersonType,
  ExternalParty,
  IntercompanyBalance,
} from "@/features/parties/types";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

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
const PERSON_TYPE_STATUS_OPTIONS = [
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
const refColumn = {
  key: "reference",
  get header() {
    return sourceText("Reference");
  },
  className: "w-28",
  render: (
    _v: unknown,
    row: {
      reference: string;
    },
  ) => <span className="font-mono text-xs">{row.reference}</span>,
};
const statusColumn = {
  key: "status",
  get header() {
    return sourceText("Status");
  },
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
function useCompanyOptions() {
  const { data } = useCompanies();
  return [
    { value: GROUP_COMPANY_VALUE, label: sourceText("Tout le groupe") },
    ...(data || []).map((c) => ({ value: c.id, label: c.name })),
  ];
}

function formatMad(amount: number) {
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------- External Parties ----------
function ExternalPartiesSection() {
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
      name: "trade_name",
      get label() {
        return sourceText("Trade name");
      },
      type: "text",
    },
    {
      name: "party_category",
      get label() {
        return sourceText("Category");
      },
      type: "text",
      placeholder: sourceText("e.g., Bank, Administration, Landlord"),
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
      name: "tax_id",
      get label() {
        return sourceText("Tax ID");
      },
      type: "text",
    },
    {
      name: "vat_number",
      get label() {
        return sourceText("VAT number");
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
      name: "is_recurring",
      get label() {
        return sourceText("Recurring counterparty");
      },
      type: "checkbox",
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
    <EntitySection<ExternalParty>
      queryKey="parties:external-parties"
      crud={partiesApi.externalParties}
      title={sourceText("External Party")}
      description={sourceText(
        "Other counterparties (banks, administrations, landlords…).",
      )}
      columns={[
        refColumn,
        { key: "name", header: sourceText("Name") },
        {
          key: "party_category",
          header: sourceText("Category"),
          className: "w-36",
          render: (v) =>
            v ? <Badge variant="outline">{String(v)}</Badge> : sourceText("—"),
        },
        { key: "email", header: sourceText("Email"), className: "w-44" },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{ status: "active", is_recurring: false }}
      getEditValues={(p) => ({
        name: p.name,
        trade_name: p.trade_name || "",
        party_category: p.party_category || "",
        email: p.email || "",
        phone: p.phone || "",
        tax_id: p.tax_id || "",
        vat_number: p.vat_number || "",
        address: p.address || "",
        is_recurring: p.is_recurring,
        status: p.status,
      })}
    />
  );
}
// ---------- Associated Persons ----------
function AssociatedPersonsSection() {
  const companyOptions = useCompanyOptions();
  const { data: personTypes } = useQuery({
    queryKey: ["parties:person-types", "options"],
    queryFn: () =>
      partiesApi.personTypes.list({ page_size: 200, is_archived: false }),
    staleTime: 1000 * 60 * 5,
  });
  const personTypeOptions = (personTypes?.results || []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const fields: FieldDef[] = [
    {
      name: "company",
      get label() {
        return sourceText("Company");
      },
      type: "select",
      options: companyOptions,
      placeholder: sourceText("Tout le groupe"),
    },
    {
      name: "person_type",
      get label() {
        return sourceText("Person type");
      },
      type: "select",
      options: personTypeOptions,
      placeholder: sourceText("Select type"),
    },
    {
      name: "first_name",
      get label() {
        return sourceText("First name");
      },
      type: "text",
      required: true,
    },
    {
      name: "last_name",
      get label() {
        return sourceText("Last name");
      },
      type: "text",
      required: true,
    },
    {
      name: "middle_name",
      get label() {
        return sourceText("Middle name");
      },
      type: "text",
    },
    {
      name: "job_title",
      get label() {
        return sourceText("Job title");
      },
      type: "text",
    },
    {
      name: "department",
      get label() {
        return sourceText("Department");
      },
      type: "text",
    },
    {
      name: "national_id",
      get label() {
        return sourceText("National ID");
      },
      type: "text",
    },
    {
      name: "passport_number",
      get label() {
        return sourceText("Passport number");
      },
      type: "text",
    },
    {
      name: "employee_id",
      get label() {
        return sourceText("Employee ID");
      },
      type: "text",
    },
    {
      name: "manager",
      get label() {
        return sourceText("Manager");
      },
      type: "text",
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
      name: "mobile",
      get label() {
        return sourceText("Mobile");
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
      name: "hire_date",
      get label() {
        return sourceText("Hire date");
      },
      type: "date",
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
    <EntitySection<AssociatedPerson>
      queryKey="parties:associated-persons"
      crud={partiesApi.associatedPersons}
      title={sourceText("Associated Person")}
      description={sourceText(
        "People linked to companies without being EFOP personnel (contacts, signatories…).",
      )}
      columns={[
        refColumn,
        {
          key: "full_name",
          header: sourceText("Name"),
          render: (_v: unknown, row: AssociatedPerson) => (
            <span>{row.full_name || `${row.first_name} ${row.last_name}`}</span>
          ),
        },
        {
          key: "company_name",
          header: sourceText("Company"),
          className: "w-36",
          render: (_v: unknown, row: AssociatedPerson) =>
            companyDisplayName(row.company_name, sourceText("Tout le groupe")),
        },
        {
          key: "person_type_name",
          header: sourceText("Type"),
          className: "w-28",
        },
        { key: "email", header: sourceText("Email"), className: "w-44" },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{ status: "active" }}
      getEditValues={(p) => ({
        company: p.company || GROUP_COMPANY_VALUE,
        person_type: p.person_type ?? "",
        first_name: p.first_name,
        last_name: p.last_name,
        middle_name: p.middle_name || "",
        job_title: p.job_title || "",
        department: p.department || "",
        national_id: p.national_id || "",
        passport_number: p.passport_number || "",
        employee_id: p.employee_id || "",
        manager: p.manager || "",
        email: p.email || "",
        phone: p.phone || "",
        mobile: p.mobile || "",
        address: p.address || "",
        hire_date: p.hire_date ? p.hire_date.split("T")[0] : "",
        status: p.status,
      })}
    />
  );
}

function _IntercompanyBalancesSectionUnused() {
  const companyOptions = useCompanyOptions();
  const { data: associatedPeopleData } = useQuery({
    // Segmented, NOT "parties:associated-person-options" as one joined string.
    // EntitySection invalidates by prefix with ["parties:associated-persons"];
    // React Query matches prefixes segment by segment, so a single joined
    // string is a different head entirely and never matches. Joining with a
    // colon made this dropdown survive create/edit/archive as stale data.
    queryKey: ["parties:associated-persons", "options"],
    queryFn: () =>
      partiesApi.associatedPersons.list({ page_size: 500, status: "active" }),
  });
  const { data: balancesData } = useQuery({
    // Same fix as above. "section-summary" rather than "summary" because the
    // page-level summary cards already own
    // ["parties:intercompany-balances", "summary"] with a different page_size,
    // and reusing that key would make the two fight over one cache entry.
    queryKey: ["parties:intercompany-balances", "section-summary"],
    queryFn: () =>
      partiesApi.intercompanyBalances.list({
        page_size: 500,
        status: "active",
        is_archived: false,
      }),
  });
  const associatedPersonOptions = (associatedPeopleData?.results || []).map(
    (person) => ({
      value: person.id,
      label:
        person.full_name || `${person.first_name} ${person.last_name}`.trim(),
    }),
  );
  const summaryRows = React.useMemo(() => {
    const totals = new Map<string, { label: string; amount: number }>();
    for (const row of balancesData?.results || []) {
      const amount = Number(row.amount || 0);
      const label = `${row.source_label || sourceText("Unknown source")} → ${row.target_label || sourceText("Unknown target")}`;
      const current = totals.get(label);
      totals.set(label, {
        label,
        amount: (current?.amount || 0) + amount,
      });
    }
    return Array.from(totals.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [balancesData?.results]);
  const balanceFields: FieldDef[] = [
    {
      name: "source_party_kind",
      label: sourceText("From type"),
      type: "select",
      required: true,
      options: [
        { value: "company", label: sourceText("Company") },
        { value: "associated_person", label: sourceText("Associated Person") },
      ],
    },
    {
      name: "source_company",
      label: sourceText("From company"),
      type: "select",
      options: companyOptions,
      visibleWhen: { field: "source_party_kind", equals: "company" },
      required: true,
    },
    {
      name: "source_associated_person",
      label: sourceText("From associated person"),
      type: "select",
      options: associatedPersonOptions,
      visibleWhen: { field: "source_party_kind", equals: "associated_person" },
      required: true,
    },
    {
      name: "target_party_kind",
      label: sourceText("To type"),
      type: "select",
      required: true,
      options: [
        { value: "company", label: sourceText("Company") },
        { value: "associated_person", label: sourceText("Associated Person") },
      ],
    },
    {
      name: "target_company",
      label: sourceText("To company"),
      type: "select",
      options: companyOptions,
      visibleWhen: { field: "target_party_kind", equals: "company" },
      required: true,
    },
    {
      name: "target_associated_person",
      label: sourceText("To associated person"),
      type: "select",
      options: associatedPersonOptions,
      visibleWhen: { field: "target_party_kind", equals: "associated_person" },
      required: true,
    },
    {
      name: "amount",
      label: sourceText("Amount"),
      type: "number",
      required: true,
      step: "0.01",
    },
    {
      name: "balance_date",
      label: sourceText("Date"),
      type: "date",
      required: true,
    },
    {
      name: "reason",
      label: sourceText("Reason"),
      type: "text",
      required: true,
      placeholder: sourceText(
        "e.g., Advance, reimbursement, intercompany support",
      ),
    },
    { name: "notes", label: sourceText("Notes"), type: "textarea" },
    {
      name: "status",
      label: sourceText("Status"),
      type: "select",
      options: PARTY_STATUS_OPTIONS,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 shadow-[0_12px_32px_rgba(15,23,42,.06)]">
        <div className="mb-4">
          <h3 className="text-base font-semibold">
            <SourceText source="Balance summary" leading trailing />
          </h3>
          <p className="text-sm text-muted-foreground">
            <SourceText
              source="Current net balances between parties. Positive values show money still owed from source to target."
              leading
              trailing
            />
          </p>
        </div>
        {summaryRows.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryRows.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-dashed bg-muted/20 p-4"
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-2 text-lg font-semibold text-primary">
                  {formatMad(item.amount)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <SourceText
              source="No balances recorded yet. Use the list below to start tracking intercompany obligations."
              leading
              trailing
            />
          </p>
        )}
      </div>

      <EntitySection<IntercompanyBalance>
        queryKey="parties:intercompany-balances"
        crud={partiesApi.intercompanyBalances}
        title={sourceText("Intercompany Balances")}
        description={sourceText(
          "Track who owes money to whom between associated persons and group companies.",
        )}
        columns={[
          refColumn,
          { key: "source_label", header: sourceText("From") },
          { key: "target_label", header: sourceText("To") },
          {
            key: "amount",
            header: sourceText("Amount"),
            render: (v) => (
              <span className="font-medium">{formatMad(Number(v || 0))}</span>
            ),
          },
          { key: "balance_date", header: sourceText("Date") },
          { key: "reason", header: sourceText("Reason") },
          statusColumn,
        ]}
        fields={balanceFields}
        createDefaults={{
          source_party_kind: "company",
          target_party_kind: "company",
          status: "active",
          balance_date: todayInputValue(),
        }}
        getEditValues={(row) => ({
          source_party_kind: row.source_company
            ? "company"
            : "associated_person",
          source_company: row.source_company ?? "",
          source_associated_person: row.source_associated_person ?? "",
          target_party_kind: row.target_company
            ? "company"
            : "associated_person",
          target_company: row.target_company ?? "",
          target_associated_person: row.target_associated_person ?? "",
          amount: row.amount,
          balance_date: row.balance_date ? row.balance_date.split("T")[0] : "",
          reason: row.reason || "",
          notes: row.notes || "",
          status: row.status,
        })}
        preparePayload={(payload, formData) => {
          const sourceKind = String(formData.source_party_kind || "company");
          const targetKind = String(formData.target_party_kind || "company");
          const nextPayload: Record<string, unknown> = {
            amount: payload.amount,
            balance_date: payload.balance_date,
            reason: payload.reason,
            notes: payload.notes,
            status: payload.status,
            source_company:
              sourceKind === "company" ? payload.source_company : undefined,
            source_associated_person:
              sourceKind === "associated_person"
                ? payload.source_associated_person
                : undefined,
            target_company:
              targetKind === "company" ? payload.target_company : undefined,
            target_associated_person:
              targetKind === "associated_person"
                ? payload.target_associated_person
                : undefined,
          };
          if (
            !nextPayload.source_company &&
            !nextPayload.source_associated_person
          ) {
            return {
              error: sourceText("Select who is lending or owed first."),
            };
          }
          if (
            !nextPayload.target_company &&
            !nextPayload.target_associated_person
          ) {
            return {
              error: sourceText("Select who owes the amount or receives it."),
            };
          }
          return { payload: nextPayload };
        }}
      />
    </div>
  );
}

// ---------- Associated Person Types ----------
function PersonTypesSection() {
  const fields: FieldDef[] = [
    {
      name: "name",
      get label() {
        return sourceText("Name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Signatory"),
    },
    {
      name: "description",
      get label() {
        return sourceText("Description");
      },
      type: "textarea",
    },
    {
      name: "is_default",
      get label() {
        return sourceText("Default type");
      },
      type: "checkbox",
    },
    {
      name: "status",
      get label() {
        return sourceText("Status");
      },
      type: "select",
      options: PERSON_TYPE_STATUS_OPTIONS,
    },
  ];
  return (
    <EntitySection<AssociatedPersonType>
      queryKey="parties:person-types"
      crud={partiesApi.personTypes}
      title={sourceText("Person Type")}
      description={sourceText(
        "Categories for associated persons (contact, signatory, manager…).",
      )}
      columns={[
        refColumn,
        { key: "name", header: sourceText("Name") },
        {
          key: "is_default",
          header: sourceText("Default"),
          className: "w-24",
          render: (v) => (
            <Badge variant={v ? "default" : "outline"}>
              {v ? sourceText("Yes") : sourceText("No")}
            </Badge>
          ),
        },
        statusColumn,
      ]}
      fields={fields}
      createDefaults={{ status: "active", is_default: false }}
      getEditValues={(t) => ({
        name: t.name,
        description: t.description || "",
        is_default: t.is_default,
        status: t.status,
      })}
    />
  );
}
function TabCount({ value }: { value: number }) {
  return (
    <Badge variant="secondary" className="ms-2 min-w-8 justify-center">
      {value}
    </Badge>
  );
}

// ---------- Page ----------
export default function PartiesPage() {
  const [section, setSection] = React.useState("external-parties");
  const externalPartiesQuery = useQuery({
    queryKey: ["parties:external-parties", "summary"],
    queryFn: () =>
      partiesApi.externalParties.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });
  const associatedPeopleQuery = useQuery({
    queryKey: ["parties:associated-persons", "summary"],
    queryFn: () =>
      partiesApi.associatedPersons.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });
  const personTypesQuery = useQuery({
    queryKey: ["parties:person-types", "summary"],
    queryFn: () =>
      partiesApi.personTypes.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Parties");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={Users2}
        eyebrow="Counterparty hub"
        title={sourceText("Parties")}
        description={sourceText(
          "External parties, associated persons and person types — reusable counterparties for financial documents and treasury workflows.",
        )}
      />

      <section className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatCard
            icon={Landmark}
            label={sourceText("External Parties")}
            value={externalPartiesQuery.data?.count ?? 0}
            tone="indigo"
          />
          <StatCard
            icon={Users2}
            label={sourceText("Associated Persons")}
            value={associatedPeopleQuery.data?.count ?? 0}
            tone="emerald"
          />
          <StatCard
            icon={Tag}
            label={sourceText("Person Types")}
            value={personTypesQuery.data?.count ?? 0}
            tone="amber"
          />
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText("Workflow guidance")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {sourceText(
              "Keep counterparties, relationships and balances aligned",
            )}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sourceText(
              "Use external parties, associated persons and person types as shared references across financial records, treasury and internal money-tracking workflows.",
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              {sourceText(
                "Capture the right party once, then reuse it everywhere.",
              )}
            </li>
            <li>
              {sourceText(
                "Track intercompany balances directly when money moves between internal entities.",
              )}
            </li>
            <li>
              {sourceText(
                "Keep legal and contact details accurate so generated documents stay reliable.",
              )}
            </li>
          </ul>
        </div>
      </section>

      <Tabs value={section} onValueChange={setSection}>
        <nav aria-label={sourceText("Parties")}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/70 bg-card/80 p-2">
            <TabsTrigger value="external-parties">
              <SourceText source="External Parties" />
              <TabCount value={externalPartiesQuery.data?.count ?? 0} />
            </TabsTrigger>
            <TabsTrigger value="associated-persons">
              <SourceText source="Associated Persons" leading trailing />
              <TabCount value={associatedPeopleQuery.data?.count ?? 0} />
            </TabsTrigger>
            <TabsTrigger value="person-types">
              <SourceText source="Person Types" />
              <TabCount value={personTypesQuery.data?.count ?? 0} />
            </TabsTrigger>
          </TabsList>
        </nav>
        <TabsContent value="external-parties" className="pt-4">
          <ExternalPartiesSection />
        </TabsContent>
        <TabsContent value="associated-persons" className="pt-4">
          <AssociatedPersonsSection />
        </TabsContent>
        <TabsContent value="person-types" className="pt-4">
          <PersonTypesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}