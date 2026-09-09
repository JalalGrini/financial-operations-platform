"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CreditCard,
  Eye,
  FileCheck,
  FileText,
  Plus,
  User,
} from "lucide-react";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useRole } from "@/hooks/useRole";
import { StatusBadge } from "@/features/personnel/components/common";
import { payrollApi, salaryApi } from "@/features/personnel/api";
import {
  useCNSSDeclarationsByPerson,
  useEmploymentsByPerson,
} from "@/features/personnel/hooks";
import { formatDate } from "@/features/personnel/utils/formatters";
import { Amount } from "@/components/ui/amount";
import { companyDisplayName } from "@/lib/company-scope";
import type {
  CNSSDeclaration,
  Employment,
  EmploymentSalary,
  MonthlyPayrollRecord,
} from "@/features/personnel/types";

type RelatedTab =
  | "overview"
  | "employments"
  | "salaries"
  | "payrolls"
  | "cnss"
  | "documents";

function RelatedRow({
  title,
  subtitle,
  badge,
  href,
  canOpen,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  href?: string;
  canOpen?: boolean;
}) {
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 transition hover:border-primary/30 hover:bg-muted/50">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        {canOpen && href ? (
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
    </div>
  );
  if (canOpen && href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

export function RelatedPersonnelRecords({
  personId,
  documents,
}: {
  personId: string;
  documents: ReactNode;
}) {
  const { isAdmin, isAssistant } = useRole();
  const canOpenPersonnelOps = isAdmin || isAssistant;
  const [activeTab, setActiveTab] = useState<RelatedTab>("employments");
  const employmentsQuery = useEmploymentsByPerson(personId);
  const salariesQuery = useQuery({
    queryKey: ["personnel-related-salaries", personId],
    queryFn: () => salaryApi.list({ person: personId, page_size: 100 }),
    enabled: Boolean(personId),
  });
  const payrollsQuery = useQuery({
    queryKey: ["personnel-related-payrolls", personId],
    queryFn: () => payrollApi.list({ person: personId, page_size: 100 }),
    enabled: Boolean(personId),
  });
  const cnssQuery = useCNSSDeclarationsByPerson(personId);

  const employments: Employment[] = employmentsQuery.data ?? [];
  const salaries: EmploymentSalary[] = salariesQuery.data?.results ?? [];
  const payrolls: MonthlyPayrollRecord[] = payrollsQuery.data?.results ?? [];
  const cnssRows: CNSSDeclaration[] = cnssQuery.data ?? [];

  const tabs = useMemo(
    () => [
      { id: "overview" as const, label: sourceText("Overview"), icon: User },
      {
        id: "employments" as const,
        label: sourceText("Employments"),
        icon: Briefcase,
        count: employments.length,
      },
      {
        id: "salaries" as const,
        label: sourceText("Salaries"),
        icon: CreditCard,
        count: salaries.length,
      },
      {
        id: "payrolls" as const,
        label: sourceText("Payroll"),
        icon: FileText,
        count: payrolls.length,
      },
      {
        id: "cnss" as const,
        label: sourceText("CNSS"),
        icon: FileCheck,
        count: cnssRows.length,
      },
      { id: "documents" as const, label: sourceText("Documents"), icon: FileText },
    ],
    [employments.length, salaries.length, payrolls.length, cnssRows.length],
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="text-lg">
            <SourceText source="Related Records" />
          </CardTitle>
          <div className="-mx-1 flex max-w-full flex-wrap gap-1 overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {"count" in tab && tab.count !== undefined && (
                  <span className="ms-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {activeTab === "overview" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: sourceText("Employments"), value: employments.length },
              { label: sourceText("Salaries"), value: salaries.length },
              { label: sourceText("Payroll"), value: payrolls.length },
              { label: sourceText("CNSS"), value: cnssRows.length },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "employments" && (
          <div className="space-y-3">
            {employments.length === 0 ? (
              <EmptyHint text={sourceText("No employments found")} />
            ) : (
              employments.map((row) => (
                <RelatedRow
                  key={row.id}
                  title={`${row.job_title || sourceText("Employment")} · ${companyDisplayName(row.company_name, sourceText("Tout le groupe"))}`}
                  subtitle={`${row.reference} · ${row.employee_reference || "—"} · ${sourceText("Remaining leave")}: ${row.remaining_leave_days ?? "—"}`}
                  badge={
                    <StatusBadge
                      status={row.display_status || row.employment_status}
                      variant="employment"
                    />
                  }
                  href={`/personnel/employments/${row.id}`}
                  canOpen={canOpenPersonnelOps}
                />
              ))
            )}
            <WriteOnly>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/personnel/employments/new?person=${personId}`}>
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Add Employment" />
                </Link>
              </Button>
            </WriteOnly>
          </div>
        )}

        {activeTab === "salaries" && (
          <div className="space-y-3">
            {salaries.length === 0 ? (
              <EmptyHint text={sourceText("No salary records found")} />
            ) : (
              salaries.map((row) => (
                <RelatedRow
                  key={row.id}
                  title={row.reference || sourceText("Salary")}
                  subtitle={`${sourceText("Effective:")} ${row.effective_from ? formatDate(row.effective_from) : "—"}`}
                  badge={
                    <span className="text-sm font-medium">
                      <Amount value={row.fixed_monthly_gross_salary} size="sm" />
                    </span>
                  }
                  href={`/personnel/salaries/${row.id}`}
                  canOpen={canOpenPersonnelOps}
                />
              ))
            )}
            <WriteOnly>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/personnel/salaries/new?person=${personId}`}>
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Add Salary" />
                </Link>
              </Button>
            </WriteOnly>
          </div>
        )}

        {activeTab === "payrolls" && (
          <div className="space-y-3">
            {payrolls.length === 0 ? (
              <EmptyHint text={sourceText("No payroll records found")} />
            ) : (
              payrolls.map((row) => (
                <RelatedRow
                  key={row.id}
                  title={`${row.reference} · ${row.year}-${String(row.month).padStart(2, "0")}`}
                  subtitle={`${sourceText("Net:")} ${row.calculated_net_salary ?? 0}`}
                  badge={<StatusBadge status={row.status} variant="payroll" />}
                  href={`/personnel/payroll/${row.id}`}
                  canOpen
                />
              ))
            )}
            <WriteOnly>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/personnel/payroll/new?person=${personId}`}>
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Create Payroll" />
                </Link>
              </Button>
            </WriteOnly>
          </div>
        )}

        {activeTab === "cnss" && (
          <div className="space-y-3">
            {cnssRows.length === 0 ? (
              <EmptyHint text={sourceText("No CNSS declarations found")} />
            ) : (
              cnssRows.map((row) => (
                <RelatedRow
                  key={row.id}
                  title={row.reference}
                  subtitle={`${sourceText("CNSS #:")} ${row.cnss_registration_number || "—"}`}
                  badge={<StatusBadge status={row.situation} variant="cnssSituation" />}
                  href={`/personnel/cnss/${row.id}`}
                  canOpen
                />
              ))
            )}
            <WriteOnly>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/personnel/cnss/new?person=${personId}`}>
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Create CNSS Declaration" />
                </Link>
              </Button>
            </WriteOnly>
          </div>
        )}

        {activeTab === "documents" && documents}
      </CardContent>
    </Card>
  );
}
