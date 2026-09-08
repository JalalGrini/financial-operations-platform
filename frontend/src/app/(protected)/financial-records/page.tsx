"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { TagAction } from "@/components/collaboration/TagAction";
import React, { useMemo, useState } from "react";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Eye,
  FilePlus2,
  FolderOpen,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  RotateCcw,
  Banknote,
  Building2,
  CalendarDays,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

import { SourceText } from "@/components/i18n/SourceText";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  Pagination,
  SearchInput,
} from "@/features/personnel/components/common";
import { configurationApi } from "@/features/configuration/api";
import { financialRecordsApi } from "@/features/financial-records/api";
import type {
  FinancialRecord,
  FinancialRecordCreateInput,
} from "@/features/financial-records/types";
import {
  buildQuickClientPayload,
  emptyQuickClient,
  normalizeTemplateDefaults,
  validateQuickClient,
  type QuickClientInput,
} from "@/features/financial-records/contracts";
import { useCompanies } from "@/features/personnel/hooks";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { CollapsibleStats } from "@/components/ui/collapsible-stats";
import { GuidePanel } from "@/components/ui/guide-panel";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { StaggerList, StaggerItem } from "@/components/ui/stagger-list";
import { Reveal } from "@/components/ui/reveal";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi } from "@/features/exports/api";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

const STATUS_OPTIONS = [
  {
    value: "all",
    get label() {
      return sourceText("All statuses");
    },
  },
  {
    value: "draft",
    get label() {
      return sourceText("Draft");
    },
  },
  {
    value: "posted",
    get label() {
      return sourceText("Posted");
    },
  },
  {
    value: "cancelled",
    get label() {
      return sourceText("Cancelled");
    },
  },
];
function fmtMoney(
  value: string | number | null | undefined,
  currency = "MAD",
): string {
  if (value === null || value === undefined || value === "") {
    return sourceText("—");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) return sourceText("—");
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDateValue(value: string | null | undefined): string {
  if (!value) return sourceText("—");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const recordStatusLabels: Record<string, string> = {
  draft: sourceText("Draft"),
  posted: sourceText("Posted"),
  cancelled: sourceText("Cancelled"),
};


export default function FinancialRecordsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useViewMode("financial-records", "table");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [archiveTarget, setArchiveTarget] = useState<FinancialRecord | null>(
    null,
  );
  const { data: companies } = useCompanies();
  const companyOptions = (companies || []).map((company) => ({
    value: company.id,
    label: company.name,
  }));
  const { data: recordTypes } = useQuery({
    queryKey: ["configuration:record-types", "options"],
    queryFn: () =>
      configurationApi["record-types"].list({
        page_size: 200,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });
  const recordTypeOptions = (recordTypes?.results || []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const params = useMemo(
    () => ({
      page,
      page_size: 25,
      search: search || undefined,
      company: companyFilter || undefined,
      record_type: typeFilter || undefined,
      status: statusFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      archive_state: showArchived ? "archived" : "active",
    }),
    [
      page,
      search,
      companyFilter,
      typeFilter,
      statusFilter,
      dateFrom,
      dateTo,
      showArchived,
    ],
  );
  const recordsQuery = useQuery({
    queryKey: ["financial-records", "list", params],
    queryFn: () => financialRecordsApi.list(params),
    placeholderData: (previous) => previous,
  });
  const summaryRecordsQuery = useQuery({
    queryKey: ["financial-records", "summary", showArchived],
    queryFn: () =>
      financialRecordsApi.list({
        page: 1,
        page_size: 200,
        archive_state: showArchived ? "archived" : "active",
      }),
    staleTime: 120000,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["financial-records"] });
  const archiveMutation = useMutation({
    mutationFn: financialRecordsApi.archive,
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
      toast.success(sourceText("Record archived"));
    },
    onError: (error: Error) =>
      toast.error(error.message || sourceText("Archive failed")),
  });
  const restoreMutation = useMutation({
    mutationFn: financialRecordsApi.restore,
    onSuccess: () => {
      invalidate();
      toast.success(sourceText("Record restored"));
    },
    onError: (error: Error) =>
      toast.error(error.message || sourceText("Restore failed")),
  });
  const summaryRows = summaryRecordsQuery.data?.results || [];
  const totalRecords = summaryRecordsQuery.data?.count ?? 0;
  const totalAmount = summaryRows.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  );
  const monthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonthAmount = summaryRows
    .filter((row) => (row.record_date || "").startsWith(monthPrefix))
    .reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const postedCount = summaryRows.filter((item) => item.status === "posted").length;
  const draftCount = summaryRows.filter((item) => item.status === "draft").length;
  const cancelledCount = summaryRows.filter((item) => item.status === "cancelled").length;
  const typeSplits = useMemo(() => {
    const amounts = new Map<string, number>();
    for (const row of summaryRows) {
      const key = row.record_type_name || sourceText("By type");
      amounts.set(key, (amounts.get(key) ?? 0) + Number(row.total_amount || 0));
    }
    return [...amounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [summaryRows]);
  const companySplits = useMemo(() => {
    const amounts = new Map<string, number>();
    for (const row of summaryRows) {
      const key = row.company_name || sourceText("Companies");
      amounts.set(key, (amounts.get(key) ?? 0) + Number(row.total_amount || 0));
    }
    return [...amounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [summaryRows]);
  const recordDates = summaryRows
    .map((row) => row.record_date)
    .filter(Boolean)
    .sort();
  const dateRangeLabel =
    recordDates.length > 0
      ? `${formatDateValue(recordDates[0])} – ${formatDateValue(recordDates[recordDates.length - 1])}`
      : sourceText("—");
  const summaryCurrency = summaryRows[0]?.currency || "MAD";
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Financial Records");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={ReceiptText}
        eyebrow="Accounting ledger"
        title={sourceText("Financial Records")}
        description={sourceText("Create a typed draft, add balanced lines in its workspace, then post it to the ledger.")}
        action={<div className="flex flex-wrap items-center gap-2">
          {/* Same filters as the list query; page/page_size dropped because an
              export is the whole filtered set, not one page of it. */}
          <ExportButton
            variant="onHeroOutline"
            filenameStem="financial_records_export"
            onExport={(format) =>
              listExportApi("financialRecords").download(
                { ...params, page: undefined, page_size: undefined },
                format,
              )
            }
          />
          <WriteOnly>
            <Button asChild variant="onHero">
              <Link href="/financial-records/new">
                <Plus className="me-2 h-4 w-4" />
                <SourceText source="New Record" leading trailing />
              </Link>
            </Button>
          </WriteOnly>
        </div>}
      />

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <CollapsibleStats
          extra={
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ReceiptText} label={sourceText("Posted")} value={postedCount} tone="emerald" />
              <StatCard icon={FilePlus2} label={sourceText("Drafts")} value={draftCount} tone="amber" />
              <StatCard icon={Archive} label={sourceText("Cancelled")} value={cancelledCount} tone="rose" />
              <StatCard icon={CalendarDays} label={sourceText("Date range")} value={dateRangeLabel} tone="indigo" />
              {typeSplits.map(([name, amount]) => (
                <StatCard
                  key={`type-${name}`}
                  icon={FolderOpen}
                  label={name}
                  value={fmtMoney(amount, summaryCurrency)}
                  tone="sky"
                />
              ))}
              {companySplits.map(([name, amount]) => (
                <StatCard
                  key={`company-${name}`}
                  icon={Building2}
                  label={name}
                  value={fmtMoney(amount, summaryCurrency)}
                  tone="violet"
                />
              ))}
            </div>
          }
        >
          <StatCard icon={FolderOpen} label={sourceText("Total records")} value={totalRecords} tone="primary" />
          <StatCard icon={Banknote} label={sourceText("Total Amount")} value={fmtMoney(totalAmount, summaryCurrency)} tone="indigo" />
          <StatCard icon={CalendarDays} label={sourceText("This month's amount")} value={fmtMoney(thisMonthAmount, summaryCurrency)} tone="emerald" />
        </CollapsibleStats>
        <GuidePanel
          eyebrow={"Financial records guidance"}
          title={"Build each document from a clean typed draft"}
          body={"Create the draft here, then open its workspace to complete balanced debit-credit lines, attach files and finalize posting."}
          items={[
            "Choose the company and record type first so the right required fields appear.",
            "Link the correct client or supplier before the record reaches accounting review.",
            "Archive drafts you no longer need instead of leaving noisy unfinished records active.",
          ]}
        />
      </section>


      {/* ===== Table Card ===== */}
      <Card>
        <CardHeader className="pb-4">
          {/* Row 1: search + status + archived toggle + refresh */}
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SearchInput
                value={search}
                onChange={(value) => { setSearch(value); setPage(1); }}
                placeholder={sourceText("Search reference, description or party…")}
                className="ps-10"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant={showArchived ? "secondary" : "outline"} className="shrink-0"
              onClick={() => { setShowArchived(!showArchived); setPage(1); }}>
              <RotateCcw className="me-2 h-4 w-4" />
              {showArchived ? sourceText("Show active") : sourceText("View archive")}
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-lg"
              onClick={() => recordsQuery.refetch()} title={sourceText("Refresh")}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </form>

          {/* Row 2: company, record type, date range */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Select value={companyFilter || "all"} onValueChange={(v) => { setCompanyFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder={sourceText("All companies")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><SourceText source="All companies" /></SelectItem>
                {companyOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder={sourceText("All types")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><SourceText source="All types" /></SelectItem>
                {recordTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <ScheduleDate value={dateFrom || ""} onChange={(v: string) => { setDateFrom(v); setPage(1); }} />
            <ScheduleDate value={dateTo   || ""} onChange={(v: string) => { setDateTo(v);   setPage(1); }} />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-hidden">
          {/* table replaced above inside CardContent */}
        {recordsQuery.isLoading ? (
          <div className="space-y-0">
            {[0,1,2,3,4].map((row) => (
              <div key={row} className="flex items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0">
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-4 flex-1 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted/60 animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : (recordsQuery.data?.results || []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
            <SourceText
              source={
                showArchived
                  ? "No archived financial records"
                  : "No active financial records"
              }
              leading
              trailing
            />
          </div>
        ) : viewMode === "card" ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {(recordsQuery.data?.results || []).map((record) => (
              <Link key={record.id} href={`/financial-records/${record.id}`}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">{record.reference}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    record.status === "posted" ? "bg-emerald-100 text-emerald-700" :
                    record.status === "draft" ? "bg-amber-100 text-amber-700" :
                    "bg-muted text-muted-foreground"}`}>{record.status}</span>
                </div>
                <p className="text-sm text-foreground line-clamp-2">{record.description || sourceText("No description")}</p>
                {record.company_name && <p className="text-xs text-muted-foreground">{record.company_name}</p>}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{record.record_date || ""}</span>
                  <span className="font-semibold text-foreground text-sm">{record.total_amount != null ? `${Number(record.total_amount).toLocaleString()} MAD` : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto"><Table className="mobile-card-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">{sourceText("Reference")}</TableHead>
                <TableHead>{sourceText("Description")}</TableHead>
                <TableHead>{sourceText("Company")}</TableHead>
                <TableHead className="text-end">{sourceText("Amount")}</TableHead>
                <TableHead>{sourceText("Status")}</TableHead>
                <TableHead>{sourceText("Date")}</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recordsQuery.data?.results || []).map((record) => (
                <TableRow className="row-hover group" key={record.id}>
                  <TableCell data-label={sourceText("Ref.")}>
                    <Link
                      href={`/financial-records/${record.id}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {record.reference}
                    </Link>
                  </TableCell>
                  <TableCell data-label={sourceText("Description")}>
                    <div className="max-w-[260px]">
                      {/* title= rather than a see-more button: in a dense table
                          a control on every row is noise, and the reference
                          beside it already links to the full record. */}
                      <p
                        className="truncate font-medium text-foreground"
                        title={record.description || undefined}
                      >
                        {record.description}
                      </p>
                      {record.record_type_name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {record.record_type_name}
                          {record.client_name ? ` · ${record.client_name}` : ""}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-label={sourceText("Société")} className="text-sm text-muted-foreground">
                    {record.company_name || sourceText("—")}
                  </TableCell>
                  <TableCell data-label={sourceText("Montant")} className="text-end">
                    <Amount
                      value={record.total_amount}
                      currency={record.currency || "MAD"}
                    />
                  </TableCell>
                  <TableCell data-label={sourceText("Statut")}>
                    <Badge
                      variant={
                        record.status === "posted"
                          ? "default"
                          : record.status === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {recordStatusLabels[String(record.status)] ||
                        String(record.status)}
                    </Badge>
                  </TableCell>
                  <TableCell data-label={sourceText("Date")} className="text-sm text-muted-foreground">
                    {formatDateValue(record.record_date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <TagAction resourceType="financial_records.financialrecord" targetId={record.id} compact />
                      {record.is_archived && (
                        <WriteOnly>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title={sourceText("Restore")} onClick={() => restoreMutation.mutate(record.id)}>
                            <RotateCcw size={14} />
                          </Button>
                        </WriteOnly>
                      )}
                      {!record.is_archived && record.status !== "posted" && (
                        <WriteOnly>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title={sourceText("Archive")} onClick={() => archiveMutation.mutate(record.id)}>
                            <Archive size={14} />
                          </Button>
                        </WriteOnly>
                      )}
                      <ExpandingActions
                        actions={[
                          { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/financial-records/${record.id}`) },
                          ...(!record.is_archived && record.status !== "posted" ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => setArchiveTarget(record), variant: "warning" as const, permission: "write" as const }] : []),
                          ...(record.is_archived ? [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => restoreMutation.mutate(record.id), variant: "success" as const, permission: "write" as const }] : []),
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
        )}
      </div>
        </CardContent>
      </Card>

      {recordsQuery.data && recordsQuery.data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(recordsQuery.data.count / 25)}
          totalCount={recordsQuery.data.count}
          pageSize={25}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() =>
          archiveTarget && archiveMutation.mutate(archiveTarget.id)
        }
        title={sourceText("Archive financial record")}
        description={`${sourceText("Archive draft prompt prefix")} ${archiveTarget?.reference ?? sourceText("this draft")}? ${sourceText("It can be restored from the archive view.")}`}
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Keep draft")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
}
