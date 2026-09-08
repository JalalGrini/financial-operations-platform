"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { FilterPopover } from "@/components/ui/filter-popover";
import { TagAction } from "@/components/collaboration/TagAction";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useState, useCallback, useMemo } from "react";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Download,
  Columns,
  Eye,
  Edit,
  Archive,
  RotateCcw,
  MoreHorizontal,
  Loader2,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Banknote,
  Building2,
  CalendarDays,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCNSSDeclarationList,
  useCNSSMonthlyList,
  useStopCNSSDeclaration,
  useRestartCNSSDeclaration,
  useArchiveCNSSDeclaration,
  useRestoreCNSSDeclaration,
  useCompanies,
  usePersonnelSelect,
} from "@/features/personnel/hooks";
import {
  CNSSSituation,
  CNSSStopReason,
  CNSSMonthlySituation,
  CNSSMonthlyStatus,
  CNSSDeclaration,
} from "@/features/personnel/types";
import {
  Pagination,
  SearchInput,
  FilterDropdown,
  ConfirmDialog,
  EmptyState,
  TableSkeleton,
} from "@/features/personnel/components/common";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { Breadcrumb } from "@/components/ui/page-components";
import {
  StatusBadge,
  CurrencyDisplay,
  DateDisplay,
} from "@/features/personnel/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { reportsApi } from "@/features/personnel/api";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { MonthlyExportDialog } from "@/components/ui/monthly-export-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CollapsibleStats } from "@/components/ui/collapsible-stats";
import { GuidePanel } from "@/components/ui/guide-panel";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

function formatMad(value: number): string {
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: 2,
  }).format(value);
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

interface Column<T> {
  key: keyof T | string;
  header: React.ReactNode;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

const densityLabels: Record<"comfortable" | "compact" | "dense", string> = {
  comfortable: sourceText("Comfortable"),
  compact: sourceText("Compact"),
  dense: sourceText("Dense"),
};

export default function CNSSListPage() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useViewMode("cnss", "table");
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({});
  const statusFilter = filterSelected.status?.[0] ?? "";
  const companyFilter = filterSelected.company?.[0] ?? "";
  const personFilter = filterSelected.person?.[0] ?? "";
  // v17.25: declarations are looked up by period far more often than by
  // anything else, and the archive made that worse - without a date range
  // you had to page through every historic row to find one month.
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>("first_declaration_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">(
    "comfortable",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  // Stop/Restart dialog state
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [selectedForStop, setSelectedForStop] = useState<string>("");
  const [selectedForRestart, setSelectedForRestart] = useState<string>("");
  const [stopReason, setStopReason] = useState("");
  const [stopDate, setStopDate] = useState("");
  // Archive/Restore dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedForArchive, setSelectedForArchive] = useState<string>("");
  const [archiveReason, setArchiveReason] = useState("");
  const {
    data: cnssData,
    isLoading,
    error,
    refetch,
  } = useCNSSDeclarationList({
    page,
    page_size: pageSize,
    search,
    status: statusFilter || undefined,
    company: companyFilter || undefined,
    person: personFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ordering: `${sortOrder === "desc" ? "-" : ""}${sortBy}`,
    archive_state: showArchived ? "archived" : "active",
  });
  const { data: summaryData } = useCNSSDeclarationList({
    page: 1,
    page_size: 200,
    archive_state: showArchived ? "archived" : "active",
  });
  const { data: monthlySummary } = useCNSSMonthlyList({
    page: 1,
    page_size: 200,
    archive_state: showArchived ? "archived" : "active",
  });
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const stopMutation = useStopCNSSDeclaration({
    onSuccess: () => {
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Stop CNSS declaration failed")),
  });
  const restartMutation = useRestartCNSSDeclaration({
    onSuccess: () => {
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Restart CNSS declaration failed")),
  });
  const archiveMutation = useArchiveCNSSDeclaration({
    onSuccess: () => {
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Archive CNSS declaration failed")),
  });
  const restoreMutation = useRestoreCNSSDeclaration({
    onSuccess: () => {
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Restore CNSS declaration failed")),
  });
  // Export the CNSS monthly report for the current period (audit fix: the
  // export menu items were removed).
  // v17.25: the CNSS declaration is filed per month, so the period is picked
  // in the dialog instead of being taken from today's date. This previously
  // exported new Date() unconditionally, which made last month's declaration
  // unreachable the moment the month rolled over -- and nothing rendered the
  // handler at all, so the screen had no export button. The dialog owns the
  // download and the errors; this only performs the request.
  const handleExportMonth = async ({
    year,
    month,
    format,
  }: {
    year: number;
    month: number;
    format: "csv" | "xlsx";
  }): Promise<Blob> =>
    reportsApi.export({
      report_type: "cnss_monthly",
      year,
      month,
      company_ids: companyFilter ? [companyFilter] : undefined,
      output_format: format,
      template: "declaration",
    });
  const handleSort = useCallback(
    (key: string) => {
      if (sortBy === key) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(key);
        setSortOrder("asc");
      }
      setPage(1);
    },
    [sortBy, sortOrder],
  );
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(cnssData?.results.map((c) => c.id) || []);
      } else {
        setSelectedIds([]);
      }
    },
    [cnssData],
  );
  const handleSelectionChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((selectedId) => selectedId !== id),
    );
  }, []);
  const openStopDialog = useCallback((id: string) => {
    setSelectedForStop(id);
    setStopReason("");
    setStopDate("");
    setStopDialogOpen(true);
  }, []);
  const openRestartDialog = useCallback((id: string) => {
    setSelectedForRestart(id);
    setRestartDialogOpen(true);
  }, []);
  const handleStop = () => {
    if (selectedForStop && stopReason) {
      stopMutation.mutate({
        id: selectedForStop,
        data: {
          stop_reason: stopReason as CNSSStopReason,
          stop_date: stopDate || undefined,
          notes: stopReason,
        },
      });
      setStopDialogOpen(false);
      setSelectedForStop("");
      setStopReason("");
      setStopDate("");
    }
  };
  const handleRestart = () => {
    if (selectedForRestart && stopDate) {
      restartMutation.mutate({
        id: selectedForRestart,
        data: { restart_date: stopDate },
      });
      setRestartDialogOpen(false);
      setSelectedForRestart("");
      setStopDate("");
    }
  };
  const openArchiveDialog = useCallback((id: string) => {
    setSelectedForArchive(id);
    setArchiveReason("");
    setArchiveDialogOpen(true);
  }, []);
  const openRestoreDialog = useCallback((id: string) => {
    setSelectedForArchive(id);
    setRestoreDialogOpen(true);
  }, []);
  const handleArchive = () => {
    if (selectedForArchive) {
      archiveMutation.mutate({ id: selectedForArchive, reason: archiveReason });
      setArchiveDialogOpen(false);
      setSelectedForArchive("");
      setArchiveReason("");
    }
  };
  const handleRestore = () => {
    if (selectedForArchive) {
      restoreMutation.mutate(selectedForArchive);
      setRestoreDialogOpen(false);
      setSelectedForArchive("");
    }
  };
  const columns = useMemo<Column<CNSSDeclaration>[]>(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={
              selectedIds.length === (cnssData?.results.length || 0) &&
              (cnssData?.results.length || 0) > 0
            }
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            aria-label={sourceText("Select all")}
          />
        ),
        className: "w-12",
      },
      {
        key: "reference",
        header: sourceText("Reference"),
        render: (_, row) => (
          <span className="font-mono text-sm font-medium">{row.reference}</span>
        ),
        className: "w-32",
      },
      {
        key: "person_name",
        header: sourceText("Person"),
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.person_name}</p>
            <p className="text-xs text-muted-foreground">{row.person}</p>
          </div>
        ),
        className: "w-48",
      },
      {
        key: "company_name",
        header: sourceText("Company"),
        render: (_, row) => (
          <span className="font-medium">{row.company_name}</span>
        ),
        className: "w-36",
      },
      {
        key: "export_cnss_registration_number",
        header: sourceText("CNSS #"),
        render: (_, row) => (
          <span className="font-mono text-sm">
            {row.export_cnss_registration_number || "-"}
          </span>
        ),
        className: "w-36",
      },
      {
        key: "situation",
        header: sourceText("Situation"),
        render: (_, row) => (
          <StatusBadge status={row.situation} variant="cnssSituation" />
        ),
        className: "w-40",
      },
      {
        key: "first_declaration_date",
        header: sourceText("First Declaration"),
        render: (_, row) => (
          <DateDisplay date={row.first_declaration_date} format="short" />
        ),
        className: "w-36",
      },
      {
        key: "declaration_start_date",
        header: sourceText("Start Date"),
        render: (_, row) => (
          <DateDisplay date={row.declaration_start_date} format="short" />
        ),
        className: "w-36",
      },
      {
        key: "declaration_stop_date",
        header: sourceText("Stop Date"),
        render: (_, row) => (
          <DateDisplay date={row.declaration_stop_date} format="short" />
        ),
        className: "w-36",
      },
      {
        key: "current_declaration_state",
        header: sourceText("Current State"),
        render: (_, row) => (
          <StatusBadge
            status={row.current_declaration_state}
            variant="cnssMonthlySituation"
          />
        ),
        className: "w-40",
      },
      {
        key: "actions",
        header: sourceText("Actions"),
        render: (_, row) => (
<div className="flex items-center justify-end gap-1">
          <TagAction resourceType="personnel.cnssdeclaration" targetId={row.id} compact />
          <ExpandingActions
            actions={
              row.is_archived
                ? [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const }]
                : [
                    { label: "View", icon: <Eye size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}`) },
                    { permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}/edit`) },
                    ...(row.situation !== CNSSSituation.STOPPED
                      ? [{ permission: "write" as const, label: "Stop", icon: <AlertCircle size={14} />, onClick: () => openStopDialog(row.id), variant: "warning" as const }]
                      : [{ permission: "write" as const, label: "Restart", icon: <RotateCcw size={14} />, onClick: () => openRestartDialog(row.id), variant: "success" as const }]),
                    { permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const },
                  ]
            }
          />
</div>
        ),
        className: "w-20 text-end",
      },
    ],
    [
      cnssData,
      selectedIds,
      handleSelectAll,
      openStopDialog,
      openRestartDialog,
      openArchiveDialog,
      openRestoreDialog,
    ],
  );
  const summaryRows = summaryData?.results || [];
  const monthlyRows = monthlySummary?.results || [];
  const totalDeclarations = summaryData?.count ?? 0;
  const totalCnssAmount = monthlyRows.reduce(
    (sum, row) => sum + Number(row.declared_salary || 0),
    0,
  );
  const pendingCount = summaryRows.filter(
    (row) => row.situation === CNSSSituation.PENDING,
  ).length;
  const approvedCount = summaryRows.filter(
    (row) => row.situation === CNSSSituation.DECLARED_BY_THIS_COMPANY,
  ).length;
  const stoppedCount = summaryRows.filter(
    (row) => row.situation === CNSSSituation.STOPPED,
  ).length;
  const archivedCount = summaryRows.filter((row) => row.is_archived).length;
  const uniqueCompanyCount = new Set(
    summaryRows.map((row) => row.company_name).filter(Boolean),
  ).size;
  const companySplits = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of summaryRows) {
      const key = row.company_name || sourceText("Companies");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [summaryRows]);
  const declarationDates = summaryRows
    .map((row) => row.first_declaration_date)
    .filter(Boolean)
    .sort();
  const dateRangeLabel =
    declarationDates.length > 0
      ? `${formatDateValue(declarationDates[0])} – ${formatDateValue(declarationDates[declarationDates.length - 1])}`
      : sourceText("—");

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);
  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <SkeletonHero />
        <SkeletonStatsStrip count={4} />
        <SkeletonTable rows={6} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel",
          },
          {
            get label() {
              return sourceText("CNSS");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={CheckCircle}
        eyebrow="Social compliance"
        title={sourceText("CNSS Declarations")}
        description={sourceText("Manage CNSS declarations, monthly submissions, and compliance across all companies.")}
        action={<>
          <MonthlyExportDialog
            onExport={handleExportMonth}
            filenameStem="CNSS_declaration"
            label={sourceText("Export declaration")}
            description={sourceText("Pick the month to file. The file uses the printed CNSS declaration layout.")}
            variant="onHeroOutline"
          />
          <WriteOnly>
          <Button
            variant="onHero"
            onClick={() => router.push("/personnel/cnss/new")}
            size="default"
          >
            <Plus className="me-2 h-4 w-4" />
            <SourceText source="Add Declaration" leading trailing />
          </Button>
        </WriteOnly>
        </>}
      />

      <section className="space-y-4">
        <CollapsibleStats
          extra={
            <div className={STAT_CARDS_GRID}>
              <StatCard icon={AlertCircle} label={sourceText("Stopped")} value={stoppedCount} tone="rose" />
              <StatCard icon={Archive} label={sourceText("Archived")} value={archivedCount} tone="amber" />
              <StatCard icon={CalendarDays} label={sourceText("Date range")} value={dateRangeLabel} tone="indigo" />
              <StatCard icon={Building2} label={sourceText("Companies")} value={uniqueCompanyCount} tone="sky" />
              {companySplits.map(([name, count]) => (
                <StatCard key={name} icon={Building2} label={name} value={count} tone="violet" />
              ))}
            </div>
          }
        >
          <StatCard icon={FileText} label={sourceText("Total declarations")} value={totalDeclarations} tone="primary" />
          <StatCard icon={Banknote} label={sourceText("Total CNSS amount")} value={formatMad(totalCnssAmount)} tone="indigo" />
          <StatCard icon={Clock} label={sourceText("Pending")} value={pendingCount} tone="amber" />
          <StatCard icon={CheckCircle} label={sourceText("Approved")} value={approvedCount} tone="emerald" />
        </CollapsibleStats>
        <GuidePanel
          eyebrow={"CNSS guidance"}
          title={"Keep declaration history clear and operational"}
          body={"Use this page to filter active declarations quickly, manage stop or restart actions, and export the current operational view when needed."}
          items={[
            "Archive only when the declaration should leave active operational lists.",
            "Use stop and restart actions with explicit dates so the history remains auditable.",
            "Filter by company and person before exporting to keep the file relevant.",
          ]}
        />
      </section>

      {/* List table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative w-48 max-w-xs">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); setPage(1); }}
                placeholder={sourceText("Search by employee, company, reference, CNSS number...")}
                className="ps-10"
              />
            </div>
            <FilterPopover
              groups={[
                { key: "status", label: sourceText("CNSS Status"), options: [
                  { value: "ACTIVE", label: sourceText("Active") },
                  { value: "STOPPED", label: sourceText("Stopped") },
                  { value: "SUSPENDED", label: sourceText("Suspended") },
                  { value: "PENDING", label: sourceText("Pending") },
                  { value: "CLOSED", label: sourceText("Closed") },
                ]},
                { key: "company", label: sourceText("Company"), options: (companies ?? []).map((co) => ({ value: String(co.id), label: co.name })) },
                { key: "person", label: sourceText("Person"), options: (personnelOptions ?? []).map((p) => ({ value: String(p.id), label: p.name })) },
              ]}
              selected={filterSelected}
              onSelectedChange={(next) => { setFilterSelected(next); setPage(1); }}
              onReset={() => { setFilterSelected({}); setDateFrom(""); setDateTo(""); setPage(1); }}
            />
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onFromChange={(v) => { setDateFrom(v); setPage(1); }}
              onToChange={(v) => { setDateTo(v); setPage(1); }}
            />
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => { setShowArchived(!showArchived); setPage(1); }}
              className="shrink-0 gap-2"
            >
              <Archive className="h-4 w-4" />
              {showArchived ? sourceText("View active") : sourceText("View archive")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-lg"
              onClick={() => refetch()}
              disabled={isLoading}
              title={sourceText("Refresh")}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <EmptyState
              icon={<span className="h-12 w-12 text-red-500">⚠️</span>}
              title={sourceText("Failed to load CNSS declarations")}
              description={error.message}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  <SourceText source="Retry" leading trailing />
                </Button>
              }
            />
          ) : (cnssData?.results || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
              <SourceText
                source="No CNSS declarations found"
                leading
                trailing
              />
            </div>
          ) : (
            <>
              {viewMode === "card" ? (
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(cnssData?.results || []).map((row) => (
                    <div key={row.id} className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-tight text-foreground">{row.person_name || sourceText("—")}</p>
                        <StatusBadge status={row.situation} variant="cnssSituation" showDot />
                      </div>
                      <p className="text-xs text-muted-foreground">{row.reference}</p>
                      <p className="text-xs text-muted-foreground">{row.company_name || sourceText("—")}</p>
                      <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                        <TagAction resourceType="personnel.cnssdeclaration" targetId={row.id} compact />
                        <ExpandingActions
                          actions={[
                            { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}`) },
                            ...(!row.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}/edit`), permission: "write" as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const, permission: "write" as const }]),
                            ...(!row.is_archived ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const, permission: "write" as const }] : []),
                          ]}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="overflow-hidden">
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{sourceText("Employee")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Company")}</TableHead>
                      <TableHead>{sourceText("CNSS Status")}</TableHead>
                      <TableHead className="hidden xl:table-cell">{sourceText("Period")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(cnssData?.results || []).map((row) => (
                      <TableRow className="row-hover" key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{row.person_name || sourceText("—")}</p>
                            <p className="text-xs text-muted-foreground">{row.reference}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.company_name || sourceText("—")}</TableCell>
                        <TableCell><StatusBadge status={row.situation} variant="cnssSituation" showDot /></TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{sourceText("—")}</TableCell>
                        <TableCell>
                          {/* Archived rows must not offer Edit.
                            *
                            * This is the table that actually renders (it maps
                            * cnssData.results). The `columns` definition higher up
                            * in this file branches correctly on row.is_archived,
                            * but it is not what draws these cells - so the correct
                            * logic existed and was never reached.
                            *
                            * Two defects were live here: Edit was offered on an
                            * archived declaration, which the API refuses, and
                            * neither control was inside <WriteOnly>, so a Director
                            * saw Edit and got a 403 on save. View stays ungated
                            * because reading is allowed for every role. */}
                          <div className="flex items-center justify-end gap-1">
                            <TagAction resourceType="personnel.cnssdeclaration" targetId={row.id} compact />
                            <ExpandingActions
                              actions={[
                                { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}`) },
                                ...(!row.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/cnss/${row.id}/edit`), permission: "write" as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const, permission: "write" as const }]),
                                ...(!row.is_archived ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const, permission: "write" as const }] : []),
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </div>
              )}
              {cnssData && cnssData.count > pageSize && (
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil((cnssData?.count || 0) / pageSize)}
                  totalCount={cnssData?.count || 0}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stop CNSS Declaration Dialog */}
      <ConfirmDialog
        isOpen={stopDialogOpen}
        onClose={() => setStopDialogOpen(false)}
        onConfirm={handleStop}
        title={sourceText("Stop CNSS Declaration")}
        description={
          selectedForStop
            ? sourceText(
                "Are you sure you want to stop the CNSS declaration? This will end their CNSS coverage.",
              )
            : ""
        }
        confirmLabel={sourceText("Stop Declaration")}
        cancelLabel={sourceText("Cancel")}
        variant="destructive"
        isLoading={stopMutation.isPending}
      />

      {/* Restart CNSS Declaration Dialog */}
      <ConfirmDialog
        isOpen={restartDialogOpen}
        onClose={() => setRestartDialogOpen(false)}
        onConfirm={handleRestart}
        title={sourceText("Restart CNSS Declaration")}
        description={
          selectedForRestart
            ? sourceText(
                "Are you sure you want to restart the CNSS declaration? This will resume their CNSS coverage.",
              )
            : ""
        }
        confirmLabel={sourceText("Restart Declaration")}
        cancelLabel={sourceText("Cancel")}
        variant="default"
        isLoading={restartMutation.isPending}
      />

      {/* Archive CNSS Declaration Dialog */}
      <ConfirmDialog
        isOpen={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={handleArchive}
        title={
          selectedIds.length > 1
            ? `${sourceText("Archive CNSS declarations prompt prefix")} ${selectedIds.length} ${sourceText("Archive CNSS declarations prompt suffix")}`
            : sourceText("Archive CNSS declaration")
        }
        description={
          selectedIds.length > 1
            ? `${sourceText("Archive selected CNSS declarations prompt prefix")} ${selectedIds.length} ${sourceText("Archive selected CNSS declarations prompt suffix")}`
            : sourceText(
                "Are you sure you want to archive this CNSS declaration? This action can be reversed.",
              )
        }
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Cancel")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />

      {/* Restore CNSS Declaration Dialog */}
      <ConfirmDialog
        isOpen={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={handleRestore}
        title={
          selectedIds.length > 1
            ? `${sourceText("Restore CNSS declarations prompt prefix")} ${selectedIds.length} ${sourceText("Restore CNSS declarations prompt suffix")}`
            : sourceText("Restore CNSS declaration")
        }
        description={
          selectedIds.length > 1
            ? `${sourceText("Restore archived CNSS declarations prompt prefix")} ${selectedIds.length} ${sourceText("Restore archived CNSS declarations prompt suffix")}`
            : sourceText(
                "Are you sure you want to restore this archived CNSS declaration?",
              )
        }
        confirmLabel={sourceText("Restore")}
        cancelLabel={sourceText("Cancel")}
        variant="default"
        isLoading={restoreMutation.isPending}
      />
    </div>
  );
}
