"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2, Search, ShieldCheck, XCircle,
  RefreshCw,
  Archive
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { auditLogApi, type AuditEvent } from "@/features/audit-log/api";
import { useCompanies } from "@/features/companies/hooks";
import { operationError } from "@/lib/form-errors";
import { SourceText } from "@/components/i18n/SourceText";
import { Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { DefinitionList } from "@/components/ui/definition-list";
import { formatDate, useExperience } from "@/lib/experience";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/hooks/useRole";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { FilterPopover } from "@/components/ui/filter-popover";
import { GuidePanel } from "@/components/ui/guide-panel";

function formatAuditDateTime(value: string, locale: "en" | "fr" | "ar") {
  return formatDate(value, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeEnumValue(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(" ");
}

function resultLabel(value: string) {
  switch (value) {
    case "success":
      return sourceText("Success");
    case "denied":
      return sourceText("Denied");
    case "failed":
      return sourceText("Failed");
    default:
      return sourceText(humanizeEnumValue(value));
  }
}

/**
 * Readable name for a recorded action.
 *
 * Historical rows still carry the old catch-all "create_or_action", which the
 * middleware wrote for every POST regardless of what it did. It is named here
 * so those rows read as something honest rather than as leaked internals.
 */
function actionLabel(value: string) {
  if (value === "create_or_action") return sourceText("Write (legacy entry)");
  return humanizeEnumValue(value.replaceAll("-", " "));
}



/** Map entity_type -> the section label shown in the Section column. */
function sectionLabel(entityType: string): string {
  const map: Record<string, string> = {
    personnel_person: sourceText("Personnel"),
    employment: sourceText("Employments"),
    cnss_declaration: sourceText("CNSS"),
    company: sourceText("Companies"),
    transfer: sourceText("Transfers"),
    treasury_account: sourceText("Treasury"),
    financial_record: sourceText("Financial Records"),
    inventory_item: sourceText("Inventory"),
    party: sourceText("Parties"),
    supplier: sourceText("Parties"),
    leave: sourceText("Leaves"),
    deadline: sourceText("Deadlines"),
    user: sourceText("Users"),
    payroll: sourceText("Payroll"),
    salary: sourceText("Salaries"),
    report: sourceText("Reports"),
  };
  return map[entityType] || humanizeEnumValue(entityType);
}

/** Build the URL for the entity item so the user can navigate to it. */
function entityUrl(entityType: string, entityId: string, action: string): string | null {
  if (!entityId) return null;
  const isArchiveAction = action.includes("archive");
  const archiveSuffix = isArchiveAction ? "?archive_state=archived" : "";
  const routes: Record<string, string> = {
    personnel_person: `/personnel/personnel/${entityId}${archiveSuffix}`,
    employment: `/personnel/employments${archiveSuffix}`,
    cnss_declaration: `/personnel/cnss${archiveSuffix}`,
    company: `/companies/${entityId}`,
    transfer: `/transfers/${entityId}`,
    financial_record: `/financial-records/${entityId}`,
    inventory_item: `/inventory/${entityId}`,
    party: `/parties`,
    supplier: `/parties`,
    leave: `/leaves`,
    deadline: `/deadlines`,
    payroll: `/personnel/payroll`,
    salary: `/personnel/salaries`,
    report: `/reports/${entityId}`,
    user: `/users`,
  };
  return routes[entityType] || null;
}

export default function AuditLogPage() {
  const { isAdmin } = useRole();
  // The admin guard deliberately renders *after* every hook below, not before.
  // `useRole` derives from `useAuth().user`, which is null while auth hydrates
  // and populated a render later, so `isAdmin` legitimately flips false -> true
  // for a real administrator. With the early return sitting above these hooks,
  // that flip changed the hook count between renders and React threw
  // "Rendered more hooks than during the previous render" - the page crashed
  // for the admins it was meant to serve. Hook order is now identical on every
  // render and only the returned tree varies.
  const { locale } = useExperience();
  const [filters, setFilters] = useState({
    search: "",
    company: "",
    action: "",
    entity_type: "",
    // The guidance card tells the reader to use denied and failed events to
    // spot process gaps, but there was no control to filter by outcome.
    result: "",
    date_from: "",
    date_to: "",
    page: 1,
  });
  // `enabled: isAdmin` keeps the hook itself unconditional (stable hook order)
  // while still not issuing an audit-log request a non-administrator would only
  // be refused, so the restricted view costs no 403s.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () => auditLogApi.list({ ...filters, page_size: 50 }),
    enabled: isAdmin,
  });
  const { data: companies } = useCompanies({
    page_size: 500,
    archive_state: "all",
  });
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const detailPanelRef = useRevealOnOpen<HTMLDivElement>(!!selected);
  const set = (key: string, value: string | number) =>
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const visibleEvents = data?.results || [];
  const successCount = visibleEvents.filter(
    (event) => event.result === "success",
  ).length;
  const deniedCount = visibleEvents.filter(
    (event) => event.result === "denied",
  ).length;
  const otherCount = visibleEvents.filter(
    (event) => event.result !== "success" && event.result !== "denied",
  ).length;

  const exp = useMutation({
    mutationFn: () => auditLogApi.export(filters),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sourceText("audit_log_export_file_prefix")}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) =>
      toast.error(operationError(sourceText("Export audit log"), error)),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">{sourceText("Access restricted to Administrators")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={ShieldCheck}
        eyebrow="Governance & compliance"
        title={sourceText("Audit Log")}
        description={sourceText("Concise, append-only governance history — trace sensitive actions, isolate suspicious activity and export targeted subsets for review.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            onClick={() => exp.mutate()}
          >
            <Download className="h-4 w-4 me-2" />
            <SourceText source="Export CSV" leading trailing />
          </Button>
        </WriteOnly>}
      />
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldCheck} label={sourceText("Visible events")} value={data?.count ?? 0} tone="primary" />
          <StatCard icon={CheckCircle2} label={sourceText("Successful")} value={successCount} tone="emerald" />
          <StatCard icon={XCircle} label={sourceText("Denied")} value={deniedCount} tone="rose" />
          <StatCard icon={AlertTriangle} label={sourceText("Other outcomes")} value={otherCount} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Audit governance guide"}
          title={"Review governance history without losing operational context"}
          body={"Use the audit log to trace sensitive actions, isolate suspicious activity and export only the subset needed for investigation or review."}
          items={[
            "Filter by action, company and date range before exporting evidence for a review.",
            "Open a single event to inspect correlation IDs, request paths and field-level changes.",
            "Use denied and failed events to spot process gaps, not only successful operations.",
          ]}
        />
      </section>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={sourceText("Actor, entity, reference or summary")}
              value={filters.search}
              onChange={(event) => set("search", event.target.value)}
            />
          </div>
          <select
            className="rounded border bg-background p-2"
            value={filters.company}
            onChange={(event) => set("company", event.target.value)}
          >
            <option value="">
              <SourceText source="All companies" />
            </option>
            {companies?.results.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <Input
            placeholder={sourceText("Action")}
            value={filters.action}
            onChange={(event) => set("action", event.target.value)}
          />
          {/* This was a date picker bound to entity_type, so the entity filter
              could only ever be given a date and never matched anything. */}
          <Input
            placeholder={sourceText("Entity type")}
            value={filters.entity_type}
            onChange={(event) => set("entity_type", event.target.value)}
          />
          <select
            className="rounded border bg-background p-2"
            value={filters.result}
            onChange={(event) => set("result", event.target.value)}
            aria-label={sourceText("Result")}
          >
            <option value="">{sourceText("All outcomes")}</option>
            <option value="success">{sourceText("Success")}</option>
            <option value="denied">{sourceText("Denied")}</option>
            <option value="failed">{sourceText("Failed")}</option>
          </select>
          <ScheduleDate
            value={filters.date_from || ""}
            onChange={(val: string) => set("date_from", val)}
          />
          <ScheduleDate
            value={filters.date_to || ""}
            onChange={(val: string) => set("date_to", val)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <SourceText source="Events" leading trailing />
              <Badge variant="outline">{data?.count ?? 0}</Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={() => refetch()}
              disabled={isLoading}
              title={sourceText("Refresh")}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : error ? (
            <p className="p-8 text-destructive">
              {operationError(sourceText("Load audit log"), error)}
            </p>
          ) : !data?.results.length ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-muted-foreground">
              <SourceText
                source="No audit events match the current filters."
                leading
                trailing
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{sourceText("Section")}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{sourceText("Type")}</th>
                    <th className="hidden px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">{sourceText("User")}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{sourceText("Date")}</th>
                    <th className="hidden px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">{sourceText("Time")}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{sourceText("Item")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.results.map((event) => {
                    const itemUrl = entityUrl(event.entity_type, event.entity_id, event.action);
                    const d = new Date(event.created_at);
                    const dateStr = isNaN(d.getTime()) ? event.created_at : [
                      String(d.getDate()).padStart(2, "0"),
                      String(d.getMonth() + 1).padStart(2, "0"),
                      d.getFullYear(),
                    ].join("/");
                    const timeStr = isNaN(d.getTime()) ? "" : [
                      String(d.getHours()).padStart(2, "0"),
                      String(d.getMinutes()).padStart(2, "0"),
                    ].join(":");
                    return (
                    <tr
                      key={event.id}
                      className="cursor-pointer border-b border-border/50 transition hover:bg-accent/30 last:border-0"
                      onClick={() => setSelected(event)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-foreground">
                          {sectionLabel(event.entity_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            event.result === "success" ? "success" :
                            event.result === "denied" ? "warning" : "destructive"
                          }
                          className="text-xs"
                        >
                          {actionLabel(event.action)}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {event.actor_name || event.actor_email || sourceText("System")}
                          </p>
                          {event.actor_role && (
                            <p className="text-xs text-muted-foreground">{event.actor_role}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell whitespace-nowrap">
                        {timeStr}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => itemUrl && e.stopPropagation()}>
                        {itemUrl ? (
                          <Link
                            href={itemUrl}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline max-w-[180px] truncate"
                            title={event.entity_reference || event.entity_id}
                          >
                            {event.entity_reference || event.entity_id || sourceText("—")}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {event.entity_reference || event.entity_id || sourceText("—")}
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Opens below the events table, so clicking a row part-way down showed
          no visible change until you scrolled. */}
      {selected && (
        <Card
          ref={detailPanelRef}
          className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{selected.summary}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <SourceText
                  source="Detailed event inspection panel"
                  leading
                  trailing
                />
              </p>
            </div>
            <Button variant="outline" onClick={() => setSelected(null)}>
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <DefinitionList
              cols={2}
              items={[
                { label: sourceText("Actor"), value: selected.actor_name || selected.actor_email || sourceText("System") },
                { label: sourceText("Timestamp"), value: formatAuditDateTime(selected.created_at, locale) },
                { label: sourceText("Action"), value: actionLabel(selected.action) },
                { label: sourceText("Entity"), value: selected.entity_reference || selected.entity_type || selected.entity_id || sourceText("—") },
                { label: sourceText("Company"), value: selected.company_name || sourceText("—") },
                { label: sourceText("Result"), value: resultLabel(selected.result) },
                { label: sourceText("Role"), value: selected.actor_role || sourceText("—") },
              ]}
            />

            {selected.reason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-destructive">
                  {sourceText("Why this did not succeed")}
                </p>
                <p className="mt-1 text-sm text-foreground">{selected.reason}</p>
              </div>
            )}
            <details className="rounded border p-3">
              <summary className="cursor-pointer font-semibold">
                <SourceText
                  source="Administrator forensic details"
                  leading
                  trailing
                />
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <b>
                    <SourceText source="Request:" />
                  </b>{" "}
                  {selected.request_method} {selected.request_path}
                </p>
                <p>
                  <b>
                    <SourceText source="Correlation:" />
                  </b>{" "}
                  <code>{selected.correlation_id}</code>
                </p>
                <pre className="overflow-auto rounded bg-muted p-3">
                  {JSON.stringify(selected.changes || {}, null, 2)}
                </pre>
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
