"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { FilterPopover } from "@/components/ui/filter-popover";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useState, useCallback, useMemo } from "react";
import {
  Plus,
  Download,
  Columns,
  Eye,
  Edit,
  Archive,
  RotateCcw,
  MoreHorizontal,
  Loader2,
  Calculator,
  CheckCircle,
  AlertCircle,
  FileText,
  X,
  Search,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePayrollList,
  useCalculatePayroll,
  useApprovePayroll,
  useBulkCreatePayroll,
  useBulkCalculatePayroll,
  useBulkApprovePayroll,
  useArchivePayroll,
  useRestorePayroll,
  useCompanies,
  usePersonnelSelect,
} from "@/features/personnel/hooks";
import { reportsApi } from "@/features/personnel/api";
import { toast } from "@/components/ui/toast";
import {
  PayrollStatus,
  MonthlyPayrollRecord,
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
import { Amount } from "@/components/ui/amount";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { Breadcrumb } from "@/components/ui/page-components";
import {
  StatusBadge,
  CurrencyDisplay,
  DateDisplay,
} from "@/features/personnel/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
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
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { GuidePanel } from "@/components/ui/guide-panel";
import { MonthlyExportDialog } from "@/components/ui/monthly-export-dialog";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
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

export default function PayrollListPage() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useViewMode("payroll", "table");
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({}); 
  const statusFilter = filterSelected.status?.[0] ?? "";
  const companyFilter = filterSelected.company?.[0] ?? "";
  const employmentFilter = filterSelected.employment?.[0] ?? "";
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<keyof MonthlyPayrollRecord | string>(
    "year",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">(
    "comfortable",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    action: 'calculate' | 'approve' | 'bulkCreate' | 'bulkCalculate' | 'bulkApprove' | 'archive' | null;
    id: string | null;
  }>({ open: false, action: null, id: null });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const {
    data: payrollData,
    isLoading,
    error,
    refetch,
  } = usePayrollList({
    page,
    page_size: pageSize,
    search,
    status: statusFilter || undefined,
    company: companyFilter || undefined,
    employment: employmentFilter || undefined,
    ordering: `${sortOrder === "desc" ? "-" : ""}${sortBy}`,
    archive_state: showArchived ? "archived" : "active",
    year,
    month,
  });
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const { mutate: archivePayroll } = useArchivePayroll({
    onSuccess: () => {
      refetch();
      toast.success(sourceText("Payroll archived"));
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Archive payroll failed")),
  });
  const { mutate: restorePayroll } = useRestorePayroll({
    onSuccess: () => {
      refetch();
      toast.success(sourceText("Payroll restored"));
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Restore payroll failed")),
  });
  const calculateMutation = useCalculatePayroll({
    onSuccess: () => {
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || sourceText("Calculate payroll failed")),
  });
  const approveMutation = useApprovePayroll({
    onSuccess: () => {
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || sourceText("Approve payroll failed")),
  });
  const bulkCreateMutation = useBulkCreatePayroll({
    onSuccess: () => {
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || sourceText("Bulk create payroll failed")),
  });
  const bulkCalculateMutation = useBulkCalculatePayroll({
    onSuccess: () => {
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || sourceText("Bulk calculate payroll failed")),
  });
  const bulkApproveMutation = useBulkApprovePayroll({
    onSuccess: () => {
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || sourceText("Bulk approve payroll failed")),
  });
  // Export the payroll monthly report for the period this page is filtered to.
  // v17.25: nothing rendered the old handler, so this screen had no export
  // button either. The dialog defaults to the period the list is filtered to,
  // but the user can file any other month without changing the filters.
  const handleExportMonth = async ({
    year: exportYear,
    month: exportMonth,
    format,
  }: {
    year: number;
    month: number;
    format: "csv" | "xlsx";
  }): Promise<Blob> =>
    reportsApi.export({
      report_type: "payroll_monthly",
      year: exportYear,
      month: exportMonth,
      company_ids: companyFilter ? [companyFilter] : undefined,
      output_format: format,
      template: "monthly_list",
    });
  const handleSort = useCallback(
    (key: keyof MonthlyPayrollRecord | string) => {
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
        setSelectedIds(payrollData?.results.map((p) => p.id) || []);
      } else {
        setSelectedIds([]);
      }
    },
    [payrollData],
  );
  const handleSelectionChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((selectedId) => selectedId !== id),
    );
  }, []);
  const handleCalculate = useCallback(
    (id: string) => {
      setConfirmState({ open: true, action: 'calculate', id });
    },
    [],
  );
  const handleApprove = useCallback(
    (id: string) => {
      setConfirmState({ open: true, action: 'approve', id });
    },
    [],
  );
  const handleBulkCreate = useCallback(() => {
    if (!companyFilter) {
      alert(sourceText("Please select a company filter before creating payroll records"));
      return;
    }
    setConfirmState({ open: true, action: 'bulkCreate', id: null });
  }, [companyFilter]);
  const handleBulkCalculate = useCallback(() => {
    if (selectedIds.length === 0) return;
    setConfirmState({ open: true, action: 'bulkCalculate', id: null });
  }, [selectedIds.length]);
  const handleBulkApprove = useCallback(() => {
    if (selectedIds.length === 0) return;
    setConfirmState({ open: true, action: 'bulkApprove', id: null });
  }, [selectedIds.length]);
  const handleConfirmAction = useCallback(async () => {
    const { action, id } = confirmState;
    setConfirmState({ open: false, action: null, id: null });
    if (action === 'calculate' && id) {
      calculateMutation.mutate(id);
    } else if (action === 'approve' && id) {
      approveMutation.mutate(id);
    } else if (action === 'bulkCreate') {
      try {
        await bulkCreateMutation.mutateAsync({ company_id: companyFilter, year, month });
      } catch (error: any) {
        alert(error?.message || sourceText("Failed to create payroll records"));
      }
    } else if (action === 'bulkCalculate') {
      try {
        await bulkCalculateMutation.mutateAsync({ payroll_ids: selectedIds });
      } catch (error: any) {
        alert(error?.message || sourceText("Failed to calculate payroll records"));
      }
    } else if (action === 'bulkApprove') {
      try {
        await bulkApproveMutation.mutateAsync({ payroll_ids: selectedIds });
      } catch (error: any) {
        alert(error?.message || sourceText("Failed to approve payroll records"));
      }
    } else if (action === 'archive' && id) {
      archivePayroll({ id, reason: id === '-' ? sourceText("Archived") : "Archived from list" });
    }
  }, [confirmState, calculateMutation, approveMutation, bulkCreateMutation, bulkCalculateMutation, bulkApproveMutation, archivePayroll, companyFilter, year, month, selectedIds]);
  const columns = useMemo<Column<MonthlyPayrollRecord>[]>(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={
              selectedIds.length === (payrollData?.results.length || 0) &&
              (payrollData?.results.length || 0) > 0
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
        key: "employee_name",
        header: sourceText("Employee"),
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.employee_name}</p>
            <p className="text-xs text-muted-foreground">
              {row.employee_reference}
            </p>
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
        key: "period",
        header: sourceText("Period"),
        render: (_, row) => (
          <span className="font-medium tabular-nums">
            {row.year}-{String(row.month).padStart(2, "0")}
          </span>
        ),
        className: "w-32",
      },
      {
        key: "scheduled_working_days",
        header: sourceText("Days"),
        render: (_, row) => (
          <div className="text-end text-sm">
            <p>
              {row.scheduled_working_days} / {row.worked_days}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.declared_days}
              <SourceText source="declared" leading trailing />
            </p>
          </div>
        ),
        className: "w-28",
      },
      {
        key: "gross_salary_snapshot",
        header: sourceText("Gross Salary"),
        render: (_, row) => (
          <CurrencyDisplay amount={row.gross_salary_snapshot} />
        ),
        className: "w-32",
      },
      {
        key: "calculated_net_salary",
        header: sourceText("Net Salary"),
        render: (_, row) => (
          <CurrencyDisplay amount={row.calculated_net_salary} />
        ),
        className: "w-32",
      },
      {
        key: "total_paid",
        header: sourceText("Paid"),
        render: (_, row) => <CurrencyDisplay amount={row.total_paid} />,
        className: "w-32",
      },
      {
        key: "remaining_amount",
        header: sourceText("Remaining"),
        render: (_, row) => <CurrencyDisplay amount={row.remaining_amount} />,
        className: "w-32",
      },
      {
        key: "export_paie_status",
        header: sourceText("Status"),
        render: (_, row) => (
          <StatusBadge status={row.status} variant="payroll" />
        ),
        className: "w-36",
      },
      {
        key: "actions",
        header: sourceText("Actions"),
        render: (_, row) => (
<div className="flex items-center justify-end gap-1">
          <TagAction resourceType="personnel.monthlypayrollrecord" targetId={row.id} compact />
          <ExpandingActions
              actions={row.is_archived
                ? [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: () => restorePayroll(row.id), variant: "success" as const }]
                : [
                    { label: "View", icon: <Eye size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}`) },
                    { permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}/edit`) },
                    ...(row.status === PayrollStatus.DRAFT ? [{ permission: "write" as const, label: "Calculate", icon: <Calculator size={14} />, onClick: () => handleCalculate(row.id), disabled: calculateMutation.isPending }] : []),
                    ...(row.status === PayrollStatus.CALCULATED ? [{ permission: "write" as const, label: "Approve", icon: <CheckCircle size={14} />, onClick: () => handleApprove(row.id), disabled: approveMutation.isPending, variant: "success" as const }] : []),
                    { permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: () => setConfirmState({ open: true, action: 'archive', id: row.id }), variant: "warning" as const },
                  ]
              }
            />
</div>
        ),
        className: "w-20 text-end",
      },
    ],
    [
      selectedIds,
      handleSelectAll,
      handleCalculate,
      handleApprove,
      calculateMutation.isPending,
      approveMutation.isPending,
      payrollData,
      archivePayroll,
      restorePayroll,
      setConfirmState,
    ],
  );
  const visibleRows = payrollData?.results || [];
  const draftCount = visibleRows.filter(
    (row) => row.status === PayrollStatus.DRAFT,
  ).length;
  const calculatedCount = visibleRows.filter(
    (row) => row.status === PayrollStatus.CALCULATED,
  ).length;
  const remainingTotal = visibleRows.reduce(
    (sum, row) => sum + Number(row.remaining_amount || 0),
    0,
  );

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
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("Payroll");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={Calculator}
        eyebrow="Monthly payroll"
        title={sourceText("Payroll")}
        description={sourceText("Manage monthly payroll records, calculations, and approvals across all companies.")}
        action={<>
          <MonthlyExportDialog
            onExport={handleExportMonth}
            filenameStem="Personnel_monthly_list"
            label={sourceText("Export month")}
            description={sourceText("Pick the month to extract. The file uses the printed monthly personnel list layout, with a total per company.")}
            defaultYear={year}
            defaultMonth={month}
            variant="onHeroOutline"
          />
          <WriteOnly>
          <>
            <Button
              variant="onHeroOutline"
              onClick={handleBulkCreate}
              disabled={bulkCreateMutation.isPending}
            >
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Bulk Create" leading trailing />
            </Button>
            <Button
              variant="onHero"
              onClick={() => router.push("/personnel/payroll/new")}
              size="default"
            >
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Add Payroll" leading trailing />
            </Button>
          </>
        <WriteOnly>
          <Button size="icon" variant="ghost" className="sr-only h-7 w-7" title={sourceText("Archive")} onClick={() => setConfirmState({ open: true, action: 'archive', id: '-' })} />
          </WriteOnly>
          <WriteOnly>
          <Button size="icon" variant="ghost" className="sr-only h-7 w-7" title={sourceText("Restore")} onClick={() => restorePayroll("-")} />
          </WriteOnly>
</WriteOnly>
        </>}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={FileText} label={sourceText("Visible records")} value={payrollData?.count ?? 0} tone="primary" />
          <StatCard icon={AlertCircle} label={sourceText("Drafts")} value={draftCount} tone="amber" />
          <StatCard icon={Calculator} label={sourceText("Calculated")} value={calculatedCount} tone="emerald" />
          <StatCard icon={CheckCircle} label={sourceText("Remaining to pay")} value={new Intl.NumberFormat(localeTag(), { style: "currency", currency: "MAD", minimumFractionDigits: 2 }).format(remainingTotal)} tone="rose" />
        </div>

        <GuidePanel
          eyebrow={"Payroll operations guide"}
          title={"Move payroll from draft to payment without losing control"}
          body={"Use this list to prepare monthly runs, then open each payroll record to review adjustments, approvals and payment progress in context."}
          items={[
            "Filter by company and month before bulk actions to avoid cross-period mistakes.",
            "Calculate drafts first, then approve only the payrolls that were fully reviewed.",
            "Archive old records only when they should leave active operational follow-up.",
          ]}
        />
      </section>

      {/* List table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); setPage(1); }}
                placeholder={sourceText("Search by employee, company, reference, CNSS number...")}
                className="ps-10"
              />
            </div>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-10 w-28 shrink-0">
                <SelectValue placeholder={sourceText("Year")} />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-10 w-36 shrink-0">
                <SelectValue placeholder={sourceText("Month")} />
              </SelectTrigger>
              <SelectContent>
                {[sourceText("January"),sourceText("February"),sourceText("March"),sourceText("April"),sourceText("May"),sourceText("June"),sourceText("July"),sourceText("August"),sourceText("September"),sourceText("October"),sourceText("November"),sourceText("December")].map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterPopover
              groups={[
                { key: "status", label: sourceText("Status"), options: [
                  { value: PayrollStatus.DRAFT, label: sourceText("Draft") },
                  { value: PayrollStatus.CALCULATED, label: sourceText("Calculated") },
                  { value: PayrollStatus.APPROVED, label: sourceText("Approved") },
                  { value: PayrollStatus.PAID, label: sourceText("Paid") },
                  { value: PayrollStatus.CANCELLED, label: sourceText("Cancelled") },
                ]},
                { key: "company", label: sourceText("Company"), options: ((companies as any)?.results || companies || []).map((co: any) => ({ value: co.id, label: co.name })) },
                { key: "employment", label: sourceText("Employee"), options: ((personnelOptions as any)?.results || personnelOptions || []).map((p: any) => ({ value: p.id, label: p.full_name || p.name })) },
              ]}
              selected={filterSelected}
              onSelectedChange={(next) => { setFilterSelected(next); setPage(1); }}
              onReset={() => { setFilterSelected({}); setPage(1); }}
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
              title={sourceText("Failed to load payroll")}
              description={error.message}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  <SourceText source="Retry" leading trailing />
                </Button>
              }
            />
          ) : (payrollData?.results || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
              <SourceText source="No payroll records found" leading trailing />
            </div>
          ) : (
            <>
              {viewMode === "card" ? (
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(payrollData?.results || []).map((row) => (
                    <div key={row.id} className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{row.reference}</span>
                        <StatusBadge status={row.status} variant="payroll" />
                      </div>
                      <p className="font-semibold leading-tight text-foreground">{row.employee_name}</p>
                      <p className="text-xs text-muted-foreground">{row.company_name}</p>
                      <p className="text-xs text-muted-foreground">{row.year}-{String(row.month).padStart(2, "0")}</p>
                      <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                        <TagAction resourceType="personnel.monthlypayrollrecord" targetId={row.id} compact />
                        <ExpandingActions
                          actions={row.is_archived ? [
                            { label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => restorePayroll(row.id), variant: "success" as const, permission: "write" as const },
                          ] : [
                            { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}`) },
                            { label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}/edit`), permission: "write" as const },
                            ...(row.status === PayrollStatus.DRAFT ? [{ label: sourceText("Calculate"), icon: <Calculator size={14} />, onClick: () => handleCalculate(row.id), permission: "write" as const }] : []),
                            ...(row.status === PayrollStatus.CALCULATED ? [{ label: sourceText("Approve"), icon: <CheckCircle size={14} />, onClick: () => handleApprove(row.id), variant: "success" as const, permission: "write" as const }] : []),
                            { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => setConfirmState({ open: true, action: 'archive', id: row.id }), variant: "warning" as const, permission: "write" as const },
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
                      <TableHead className="w-8"></TableHead>
                      <TableHead>{sourceText("Reference")}</TableHead>
                      <TableHead>{sourceText("Employee")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Period")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{sourceText("Status")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-end">{sourceText("Gross")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-end">{sourceText("Net")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-end">{sourceText("Remaining")}</TableHead>
                      <TableHead className="w-40"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payrollData?.results || []).map((row) => {
                      const checked = selectedIds.includes(row.id);
                      return (
                        <TableRow className={cn("row-hover", checked ? "bg-primary/5" : "")} key={row.id}>
                          <TableCell className="pr-0">
                            <input type="checkbox" checked={checked}
                              onChange={(e) => handleSelectionChange(row.id, e.target.checked)}
                              className="h-4 w-4 rounded border-border text-primary" />
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs font-semibold text-primary">{row.reference}</span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{row.employee_name}</p>
                              <p className="text-xs text-muted-foreground">{row.company_name}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            {row.year}-{String(row.month).padStart(2, "0")}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <StatusBadge status={row.status} variant="payroll" />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-end">
                            <Amount value={row.gross_salary_snapshot} currency="MAD" size="sm" />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-end">
                            <Amount value={row.calculated_net_salary} currency="MAD" size="sm" />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-end">
                            <Amount value={row.remaining_amount} currency="MAD" size="sm" colorize />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <TagAction resourceType="personnel.monthlypayrollrecord" targetId={row.id} compact />
                              <ExpandingActions
                                actions={row.is_archived ? [
                                  { label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => restorePayroll(row.id), variant: "success" as const, permission: "write" as const },
                                ] : [
                                  { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}`) },
                                  { label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/payroll/${row.id}/edit`), permission: "write" as const },
                                  ...(row.status === PayrollStatus.DRAFT ? [{ label: sourceText("Calculate"), icon: <Calculator size={14} />, onClick: () => handleCalculate(row.id), permission: "write" as const }] : []),
                                  ...(row.status === PayrollStatus.CALCULATED ? [{ label: sourceText("Approve"), icon: <CheckCircle size={14} />, onClick: () => handleApprove(row.id), variant: "success" as const, permission: "write" as const }] : []),
                                  { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => setConfirmState({ open: true, action: 'archive', id: row.id }), variant: "warning" as const, permission: "write" as const },
                                ]}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table></div>
              </div>
              )}
              {payrollData && payrollData.count > pageSize && (
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil((payrollData?.count || 0) / pageSize)}
                  totalCount={payrollData?.count || 0}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={confirmState.open}
        onClose={() => setConfirmState({ open: false, action: null, id: null })}
        onConfirm={handleConfirmAction}
        title={
          confirmState.action === 'calculate' ? sourceText("Calculate Payroll") :
          confirmState.action === 'approve' ? sourceText("Approve Payroll") :
          confirmState.action === 'bulkCreate' ? sourceText("Create Payroll Records") :
          confirmState.action === 'bulkCalculate' ? sourceText("Calculate Payrolls") :
          confirmState.action === 'bulkApprove' ? sourceText("Approve Payrolls") :
          sourceText("Archive Payroll")
        }
        description={
          confirmState.action === 'calculate' ? sourceText("Are you sure you want to calculate this payroll?") :
          confirmState.action === 'approve' ? sourceText("Are you sure you want to approve this payroll? This action cannot be undone.") :
          confirmState.action === 'bulkCreate' ? sourceText("Create payroll records for all active employments for the selected period?") :
          confirmState.action === 'bulkCalculate' ? `${sourceText("Calculate selected payroll records prompt prefix")} ${selectedIds.length} ${sourceText("Calculate selected payroll records prompt suffix")}` :
          confirmState.action === 'bulkApprove' ? `${sourceText("Approve selected payroll records prompt prefix")} ${selectedIds.length} ${sourceText("Approve selected payroll records prompt suffix")}` :
          sourceText("Archive this payroll record? It can be restored later.")
        }
        confirmLabel={
          confirmState.action === 'calculate' ? sourceText("Calculate") :
          confirmState.action === 'approve' ? sourceText("Approve") :
          confirmState.action === 'bulkCreate' ? sourceText("Create") :
          confirmState.action === 'bulkCalculate' ? sourceText("Calculate") :
          confirmState.action === 'bulkApprove' ? sourceText("Approve") :
          sourceText("Archive")
        }
        variant={confirmState.action === 'approve' || confirmState.action === 'bulkApprove' ? "destructive" : "default"}
        isLoading={
          calculateMutation.isPending || approveMutation.isPending ||
          bulkCreateMutation.isPending || bulkCalculateMutation.isPending || bulkApproveMutation.isPending
        }
      />
    </div>
  );
}
