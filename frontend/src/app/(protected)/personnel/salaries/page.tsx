"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { FilterPopover } from "@/components/ui/filter-popover";
import { TagAction } from "@/components/collaboration/TagAction";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useState, useCallback } from "react";
import {
  Plus,
  Download,
  Columns,
  Eye,
  Edit,
  MoreHorizontal,
  Loader2,
  Search,
  RefreshCw,
  RotateCcw,
  Archive,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSalaryList,
  useExportSalary,
  useCompanies,
  usePersonnelSelect,
  useArchiveSalary,
  useRestoreSalary,
  usePermanentDeleteSalary,
} from "@/features/personnel/hooks";
import { EmploymentSalary } from "@/features/personnel/types";
import {
  Pagination,
  SearchInput,
  FilterDropdown,
  EmptyState,
  TableSkeleton,
  StatusBadge,
  ConfirmDialog,
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
import { Breadcrumb } from "@/components/ui/page-components";
import { DateDisplay } from "@/features/personnel/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { useExperience } from "@/lib/experience";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { GuidePanel } from "@/components/ui/guide-panel";

function formatSalaryNumber(
  value: number | string | null | undefined,
  locale: "en" | "fr" | "ar",
) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
  ).format(amount);
}

function formatSalaryCurrency(
  value: number | string | null | undefined,
  locale: "en" | "fr" | "ar",
  currency = "MAD",
) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    },
  ).format(amount);
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

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function SalaryListPage() {
  const { locale } = useExperience();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [archiveDialogId, setArchiveDialogId] = React.useState<string | null>(null);
  const openArchiveDialog = setArchiveDialogId;
  const [salaryConfirm, setSalaryConfirm] = useState<{ open: boolean; id: string | null; action: 'delete' | 'archive' | null }>({ open: false, id: null, action: null });
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({});
  const statusFilter = filterSelected.status?.[0] ?? "";
  const companyFilter = filterSelected.company?.[0] ?? "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<keyof EmploymentSalary | string>(
    "effective_from",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">(
    "comfortable",
  );
  const [showArchived, setShowArchived] = useState(false);
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const {
    data: salaryData,
    isLoading,
    error,
    refetch,
  } = useSalaryList({
    page,
    page_size: pageSize,
    search,
    status: statusFilter || undefined,
    company: companyFilter || undefined,
    ordering: `${sortOrder === "desc" ? "-" : ""}${sortBy}`,
    archive_state: showArchived ? "archived" : "active",
  });
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const archiveMutation = useArchiveSalary({
    onSuccess: () => toast.success(sourceText("Salary history entry archived")),
    onError: (error) =>
      toast.error(error.message || sourceText("Archive failed")),
  });
  const restoreMutation = useRestoreSalary({
    onSuccess: () => toast.success(sourceText("Salary history entry restored")),
    onError: (error) =>
      toast.error(error.message || sourceText("Restore failed")),
  });
  const permanentDeleteMutation = usePermanentDeleteSalary({
    onSuccess: () =>
      toast.success(sourceText("Salary history entry permanently deleted")),
    onError: (error) =>
      toast.error(error.message || sourceText("Permanent deletion failed")),
  });
  const exportMutation = useExportSalary({
    onSuccess: (blob, { format }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sourceText("salary_export_file_prefix")}_${todayInputValue()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      toast.error(error?.message || sourceText("Export failed"));
    },
  });
  const handleSort = useCallback(
    (key: keyof EmploymentSalary | string) => {
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
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);
  const visibleRows = salaryData?.results || [];
  const currentCount = visibleRows.filter((row) => row.is_current).length;
  const archivedCount = visibleRows.filter((row) => row.is_archived).length;
  const totalGross = visibleRows.reduce(
    (sum, row) => sum + Number(row.fixed_monthly_gross_salary || 0),
    0,
  );

  const columns: Column<EmploymentSalary>[] = [
    {
      key: "reference",
      header: sourceText("Reference"),
      render: (_, row) => (
        <span className="font-mono text-sm font-medium">{row.reference}</span>
      ),
      className: "w-32",
    },
    {
      key: "employment_reference",
      header: sourceText("Employment"),
      render: (_, row) => (
        <div>
          <p className="font-medium">{row.employment_reference}</p>
          <p className="text-xs text-muted-foreground">{row.person_name}</p>
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
      className: "w-40",
    },
    {
      key: "fixed_monthly_gross_salary",
      header: sourceText("Gross Salary"),
      render: (_, row) => (
        <span className="font-medium tabular-nums">
          {formatSalaryNumber(row.fixed_monthly_gross_salary, locale)}
          <SourceText source="MAD" leading trailing />
        </span>
      ),
      className: "w-36",
    },
    {
      key: "effective_from",
      header: sourceText("Effective From"),
      render: (_, row) => (
        <DateDisplay date={row.effective_from} format="short" />
      ),
      className: "w-32",
    },
    {
      key: "effective_to",
      header: sourceText("Effective To"),
      render: (_, row) => (
        <DateDisplay date={row.effective_to} format="short" />
      ),
      className: "w-32",
    },
    {
      key: "is_current",
      header: sourceText("Current"),
      render: (_, row) => (
        <Badge
          variant={row.is_current ? "default" : "outline"}
          className="text-xs"
        >
          {row.is_current ? sourceText("Yes") : sourceText("No")}
        </Badge>
      ),
      className: "w-24",
    },
    {
      key: "actions",
      header: sourceText("Actions"),
      render: (_, row) => (
<div className="flex items-center justify-end gap-1">
        <TagAction resourceType="personnel.employmentsalary" targetId={row.id} compact />
        <ExpandingActions
          actions={
            row.is_archived
              ? [
                  { permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: () => restoreMutation.mutate(row.id), variant: "success" as const },
                  ...(isAdministrator
                    ? [{ permission: "delete" as const, label: "Delete permanently", icon: <Trash2 size={14} />, onClick: () => setSalaryConfirm({ open: true, id: row.id, action: 'delete' }), variant: "danger" as const }]
                    : []),
                ]
              : [
                  { label: "View", icon: <Eye size={14} />, onClick: () => router.push(`/personnel/salaries/${row.id}`) },
                  { permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/salaries/${row.id}/edit`) },
                  { permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: () => setSalaryConfirm({ open: true, id: row.id, action: 'archive' }), variant: "warning" as const },
                ]
          }
        />
</div>
      ),
      className: "w-20 text-end",
    },
  ];
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
              return sourceText("Salaries");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={Archive}
        eyebrow="Compensation history"
        title={sourceText("Salaries")}
        description={sourceText("Manage salary records, history, and adjustments across all employments.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            asChild
            size="default"
          >
            <Link href="/personnel/salaries/new">
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Add Salary" leading trailing />
            </Link>
          </Button>
        </WriteOnly>}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Archive} label={sourceText("Visible entries")} value={salaryData?.count ?? 0} tone="primary" />
          <StatCard icon={Eye} label={sourceText("Current salaries")} value={currentCount} tone="emerald" />
          <StatCard icon={RotateCcw} label={sourceText("Archived")} value={archivedCount} tone="amber" />
          <StatCard icon={Plus} label={sourceText("Gross total")} value={formatSalaryCurrency(totalGross, locale)} tone="indigo" />
        </div>

        <GuidePanel
          eyebrow={"Salary history guide"}
          title={"Keep salary history clean, current and recoverable"}
          body={"Use this page to review current compensation, preserve historical rows and archive old entries without losing traceability."}
          items={[
            "Archive historical entries instead of deleting them whenever recovery may be needed.",
            "Check effective date ranges carefully before adding or editing salary history.",
            "Export only the filtered view you actually need to review or share.",
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
                placeholder={sourceText("Search by name, CIN, reference, company...")}
                className="ps-10"
              />
            </div>
            <FilterPopover
              groups={[
                { key: "status", label: sourceText("Status"), options: [
                  { value: "current", label: sourceText("Current") },
                  { value: "historical", label: sourceText("Historical") },
                ]},
                { key: "company", label: sourceText("Company"), options: ((companies as any)?.results || companies || []).map((c: any) => ({ value: c.id, label: c.name })) },
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
              {showArchived ? sourceText("View active salaries") : sourceText("View salary archive")  }
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <EmptyState
              icon={<span className="h-12 w-12 text-red-500">⚠️</span>}
              title={sourceText("Failed to load salaries")}
              description={error.message}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  <SourceText source="Retry" leading trailing />
                </Button>
              }
            />
          ) : (salaryData?.results || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
              <SourceText source="No salaries found" leading trailing />
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{sourceText("Employee")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Company")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{sourceText("Effective Period")}</TableHead>
                      <TableHead>{sourceText("Current")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-end">{sourceText("Gross Salary")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(salaryData?.results || []).map((row) => (
                      <TableRow className="row-hover" key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{row.person_name || sourceText("—")}</p>
                            <p className="text-xs text-muted-foreground">{row.reference}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.company_name || sourceText("—")}</TableCell>
                        {/* A salary history row is an effective-dated range, not a
                            payroll month: it has no year/month/status/net_salary.
                            This view previously read those payroll fields, which
                            the EmploymentSalary API never returns, so every cell
                            here rendered undefined. */}
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          <DateDisplay date={row.effective_from} format="short" />
                          {row.effective_to ? <> — <DateDisplay date={row.effective_to} format="short" /></> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.is_current ? "default" : "outline"} className="text-xs">
                            {row.is_current ? sourceText("Yes") : sourceText("No")}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-end"><Amount value={row.fixed_monthly_gross_salary} currency="MAD" size="sm" /></TableCell>
                        <TableCell>
                          {/* Same defect class as the CNSS and employments lists:
                            * this is the table that actually renders, and it
                            * offered Edit on an archived row with no <WriteOnly>.
                            * Restore reuses the mutation the `columns` definition
                            * already calls, so there is one code path for it. */}
                          <div className="flex items-center justify-end gap-1">
                            <TagAction resourceType="personnel.employmentsalary" targetId={row.id} compact />
                            <ExpandingActions
                              actions={[
                                { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/salaries/${row.id}`) },
                                ...(!row.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/salaries/${row.id}/edit`), permission: "write" as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => restoreMutation.mutate(row.id), variant: "success" as const, permission: "write" as const }]),
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
              {salaryData && salaryData.count > pageSize && (
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil((salaryData?.count || 0) / pageSize)}
                  totalCount={salaryData?.count || 0}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={salaryConfirm.open}
        onClose={() => setSalaryConfirm({ open: false, id: null, action: null })}
        onConfirm={() => {
          if (salaryConfirm.action === 'delete' && salaryConfirm.id) permanentDeleteMutation.mutate(salaryConfirm.id);
          else if (salaryConfirm.action === 'archive' && salaryConfirm.id) archiveMutation.mutate({ id: salaryConfirm.id, reason: sourceText("Archived from Salary History") });
          setSalaryConfirm({ open: false, id: null, action: null });
        }}
        title={salaryConfirm.action === 'delete' ? sourceText("Delete Salary Entry") : sourceText("Archive Salary Entry")}
        description={
          salaryConfirm.action === 'delete'
            ? sourceText("Permanently delete this archived salary history entry? This cannot be undone.")
            : sourceText("Archive this salary history entry? It can be restored later.")
        }
        confirmLabel={salaryConfirm.action === 'delete' ? sourceText("Delete") : sourceText("Archive")}
        variant={salaryConfirm.action === 'delete' ? "destructive" : "default"}
        isLoading={permanentDeleteMutation.isPending || archiveMutation.isPending}
      />
    </div>
  );
}
