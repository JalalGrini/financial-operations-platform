"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { companyFilterOptions } from "@/lib/company-scope";
import { FilteredExportButton } from "@/components/ui/filtered-export-button";
import { personnelApi } from "@/features/personnel/api";
import React, { useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  Search,
  Filter,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Plus,
  Download,
  Columns,
  Eye,
  Edit,
  Archive,
  RotateCcw,
  RefreshCw,
  MoreHorizontal,
  Loader2,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceText } from "@/components/i18n/SourceText";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { FilterPopover } from "@/components/ui/filter-popover";
import { TagAction } from "@/components/collaboration/TagAction";
import {
  formatCurrency,
  formatDate,
} from "@/features/personnel/utils/formatters";
import {
  usePersonnelList,
  useArchivePersonnel,
  useRestorePersonnel,
  usePermanentDeletePersonnel,
} from "@/features/personnel/hooks";
import { usePersonnelSelect } from "@/features/personnel/hooks";
import { useCompanies } from "@/features/personnel/hooks";
import { PersonnelStatus, PersonnelPerson } from "@/features/personnel/types";
import {
  archiveActionForRow,
  archiveStateForView,
} from "@/features/personnel/archive-contract";
import {
  Pagination,
  SearchInput,
  FilterDropdown,
  ConfirmDialog,
  EmptyState,
  Skeleton,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import {
  Breadcrumb,
  ActionCard,
  MetricCard,
} from "@/components/ui/page-components";
import {
  StatusBadge,
  CurrencyDisplay,
  DateDisplay,
  PersonnelAvatar,
} from "@/features/personnel/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { CopyButton } from "@/components/ui/copy-button";
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
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { GuidePanel } from "@/components/ui/guide-panel";
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

const densityLabels: Record<"comfortable" | "compact" | "dense", string> = {
  comfortable: sourceText("Comfortable"),
  compact: sourceText("Compact"),
  dense: sourceText("Dense"),
};

export default function PersonnelListPage() {
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useViewMode("personnel", "table");
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({});
  const statusFilter = filterSelected.status?.[0] ?? "";
  const companyFilter = filterSelected.company?.[0] ?? "";
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<keyof PersonnelPerson | string>(
    "last_name",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">(
    "comfortable",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("archive_state") ===
        "archived",
  );
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [selectedForArchive, setSelectedForArchive] = useState<string>("");
  const [archiveReason, setArchiveReason] = useState("");
  const {
    data: personnelData,
    isLoading,
    error,
    refetch,
  } = usePersonnelList({
    page,
    page_size: pageSize,
    search,
    status: statusFilter || undefined,
    company: companyFilter || undefined,
    ordering: `${sortOrder === "desc" ? "-" : ""}${sortBy}`,
    archive_state: archiveStateForView(showArchived),
  });
  // Archived-count chip: makes archived records discoverable (never "invisible").
  const { data: archivedData, refetch: refetchArchived } = usePersonnelList({
    page: 1,
    page_size: 1,
    archive_state: "archived",
  });
  const archivedCount = archivedData?.count ?? 0;
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const visibleRows = personnelData?.results || [];
  const activeRows = visibleRows.filter((row) => !row.is_archived).length;
  const currentEmployments = visibleRows.reduce(
    (sum, row) => sum + Number(row.active_employments_count || 0),
    0,
  );
  const averageCompleteness =
    visibleRows.length > 0
      ? Math.round(
          visibleRows.reduce(
            (sum, row) => sum + Number(row.completeness_percentage || 0),
            0,
          ) / visibleRows.length,
        )
      : 0;
  const archiveMutation = useArchivePersonnel({
    onSuccess: () => {
      refetch();
      refetchArchived();
      setArchiveDialogOpen(false);
      setSelectedForArchive("");
      setArchiveReason("");
    },
  });
  const permanentDeleteMutation = usePermanentDeletePersonnel({
    onSuccess: () => {
      refetch();
      refetchArchived();
      toast.success(sourceText("Personnel permanently deleted"));
    },
    onError: (error) =>
      toast.error(error.message || sourceText("Permanent delete failed")),
  });
  const restoreMutation = useRestorePersonnel({
    onSuccess: () => {
      refetch();
      refetchArchived();
      setRestoreDialogOpen(false);
      setSelectedForArchive("");
    },
  });
  const handleSort = useCallback(
    (key: keyof PersonnelPerson | string) => {
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
        setSelectedIds(personnelData?.results.map((p) => p.id) || []);
      } else {
        setSelectedIds([]);
      }
    },
    [personnelData],
  );
  const handleSelectionChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((previous) =>
      checked
        ? [...previous, id]
        : previous.filter((selectedId) => selectedId !== id),
    );
  }, []);
  const openArchiveDialog = useCallback((id: string) => {
    setSelectedForArchive(id);
    setArchiveDialogOpen(true);
  }, []);
  const openRestoreDialog = useCallback((id: string) => {
    setSelectedForArchive(id);
    setRestoreDialogOpen(true);
  }, []);
  const handleBulkArchive = useCallback(() => {
    if (selectedIds.length > 0) {
      setSelectedForArchive(selectedIds.join(","));
      setArchiveDialogOpen(true);
    }
  }, [selectedIds]);
  const handleArchiveViewToggle = useCallback(() => {
    setShowArchived((current) => !current);
    setPage(1);
    setSelectedIds([]);
  }, []);
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);
  const columns = useMemo<Column<PersonnelPerson>[]>(() => {
    const allSelected =
      selectedIds.length === (personnelData?.results.length || 0) &&
      (personnelData?.results.length || 0) > 0;
    const someSelected =
      selectedIds.length > 0 &&
      selectedIds.length < (personnelData?.results.length || 0);
    return [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            aria-label={sourceText("Select all")}
          />
        ),
        className: "w-12",
      },
      {
        key: "avatar",
        header: "",
        render: (_, row) => (
          <TooltipProvider>
            <Tooltip
              content={
                <>
                  <p className="font-medium">{row.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.email || sourceText("No email")}
                  </p>
                </>
              }
            >
              <TooltipTrigger>
                <PersonnelAvatar
                  name={row.full_name}
                  email={row.email}
                  photo={row.photo}
                  size="sm"
                />
              </TooltipTrigger>
            </Tooltip>
          </TooltipProvider>
        ),
        className: "w-16",
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
        key: "full_name",
        header: sourceText("Name"),
        render: (_, row) => (
          <div>
            <p className="font-medium">{row.full_name}</p>
            {row.cin && (
              <p className="text-xs text-muted-foreground">
                <SourceText source="CIN:" trailing />
                {row.cin}
              </p>
            )}
          </div>
        ),
        className: "w-48",
      },
      {
        key: "status",
        header: sourceText("Status"),
        render: (_, row) => (
          <StatusBadge status={row.is_on_leave ? "on_leave" : row.status} variant="personnel" />
        ),
        className: "w-36",
      },
      {
        key: "cnss_situation",
        header: sourceText("CNSS"),
        render: (_, row) => {
          return row.has_active_cnss ? (
            <StatusBadge
              status="DECLARED_BY_THIS_COMPANY"
              variant="cnssSituation"
              showDot
            />
          ) : (
            <StatusBadge
              status="NOT_DECLARED"
              variant="cnssSituation"
              showDot
            />
          );
        },
        className: "w-40",
      },
      {
        key: "completeness",
        header: sourceText("Complete"),
        render: (_, row) => (
          <span
            className={cn(
              "text-sm font-medium",
              row.completeness_percentage >= 80
                ? "text-green-600"
                : row.completeness_percentage >= 50
                  ? "text-yellow-600"
                  : "text-red-600",
            )}
          >
            {row.completeness_percentage}%
          </span>
        ),
        className: "w-24",
      },
      {
        key: "active_employments",
        header: sourceText("Employments"),
        render: (_, row) => (
          <Badge variant="outline" className="text-xs">
            {row.active_employments_count}
            <SourceText source="active" leading trailing />
          </Badge>
        ),
        className: "w-32",
      },
      {
        key: "actions",
        header: sourceText("Actions"),
        render: (_, row) => (
<div className="flex items-center justify-end gap-1">
          <TagAction resourceType="personnel.personnelperson" targetId={row.id} compact />
          <ExpandingActions
            actions={
              row.is_archived
                ? [
                    {
                      permission: "write" as const, label: "Restore",
                      icon: <RotateCcw size={14} />,
                      onClick: () => openRestoreDialog(row.id),
                      variant: "success" as const,
                    },
                    ...(isAdministrator
                      ? [
                          {
                            permission: "delete" as const, label: "Delete permanently",
                            icon: <span>🗑</span>,
                            onClick: () => setDeleteConfirm({ open: true, id: row.id }),
                            variant: "danger" as const,
                          },
                        ]
                      : []),
                  ]
                : [
                    {
                      label: "View",
                      icon: <Eye size={14} />,
                      onClick: () => router.push(`/personnel/personnel/${row.id}`),
                    },
                    {
                      permission: "write" as const, label: "Edit",
                      icon: <Edit size={14} />,
                      onClick: () => router.push(`/personnel/personnel/${row.id}/edit`),
                    },
                    {
                      permission: "write" as const, label: "Archive",
                      icon: <Archive size={14} />,
                      onClick: () => openArchiveDialog(row.id),
                      variant: "warning" as const,
                    },
                  ]
            }
          />
</div>
        ),
        className: "w-20 text-end",
      },
    ];
  }, [
    personnelData,
    selectedIds,
    handleSelectAll,
    openArchiveDialog,
    openRestoreDialog,
    isAdministrator,
    permanentDeleteMutation,
  ]);
  const handleArchive = async () => {
    const ids = selectedForArchive
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    for (const id of ids) {
      await archiveMutation.mutateAsync({ id, reason: archiveReason });
    }
  };
  const handleRestore = async () => {
    const ids = selectedForArchive
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    for (const id of ids) await restoreMutation.mutateAsync(id);
  };
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
              return sourceText("List");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={Briefcase}
        eyebrow="HR management"
        title={sourceText("Personnel")}
        description={sourceText("Manage personnel records, employments, and CNSS declarations across the platform.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            asChild
            size="default"
          >
            <Link href="/personnel/personnel/new">
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Add Personnel" leading trailing />
            </Link>
          </Button>
        </WriteOnly>}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Eye} label={sourceText("Visible records")} value={personnelData?.count || 0} tone="primary" />
          <StatCard icon={RotateCcw} label={sourceText("Active rows")} value={activeRows} tone="emerald" />
          <StatCard icon={Briefcase} label={sourceText("Employments")} value={currentEmployments} tone="indigo" />
          <StatCard icon={CheckCircle} label={sourceText("Avg completeness")} value={`${averageCompleteness}%`} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Personnel operations guide"}
          title={"Keep profiles, employment links and archive state easy to audit"}
          body={"Use this page to keep personnel records complete, tied to the right companies and employments, and easy to recover from archive when needed."}
          items={[
            "Archive old personnel rows instead of deleting them when a future restore might be needed.",
            "Use completeness and employment counts to spot records that need cleanup before payroll or CNSS work.",
            "Export only the filtered subset that matches the operational audience you are reviewing.",
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
                placeholder={sourceText("Search by name, CIN, email, phone, reference, company...")}
                className="ps-10"
              />
            </div>
            <FilterPopover
              groups={[
                { key: "status", label: sourceText("Status"), options: [
                  { value: "active", label: sourceText("Active") },
                  { value: "inactive", label: sourceText("Inactive") },
                  { value: "suspended", label: sourceText("Suspended") },
                  { value: "terminated", label: sourceText("Terminated") },
                  { value: "archived", label: sourceText("Archived") },
                  { value: "on_leave", label: sourceText("On Leave") },
                ]},
                { key: "company", label: sourceText("Company"), options: companyFilterOptions((companies as any)?.results || companies || [], sourceText("Tout le groupe")) },
              ]}
              selected={filterSelected}
              onSelectedChange={(next) => { setFilterSelected(next); setPage(1); }}
              onReset={() => { setFilterSelected({}); setPage(1); }}
            />
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={handleArchiveViewToggle}
              className="shrink-0 gap-2"
            >
              <Archive className="h-4 w-4" />
              {showArchived ? sourceText("View active") : `${sourceText("View archive")} (${archivedCount})`}
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
            <FilteredExportButton
              prefix="personnel"
              allowMulti
              extraParams={{
                search: search || undefined,
                company: companyFilter || undefined,
                archive_state: archiveStateForView(showArchived),
              }}
              options={[
                { value: "active", label: sourceText("Actifs seulement"), slug: "actifs" },
                { value: "inactive", label: sourceText("Inactifs seulement"), slug: "inactifs" },
                { value: "suspended", label: sourceText("Suspended"), slug: "suspendus" },
                { value: "terminated", label: sourceText("Terminated"), slug: "termines" },
                { value: "archived", label: sourceText("Archived"), slug: "archives" },
                { value: "on_leave", label: sourceText("On Leave"), slug: "en_conge" },
              ]}
              onExport={(params) => personnelApi.export(params, "xlsx")}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <EmptyState
              icon={<span className="h-12 w-12 text-red-500">⚠️</span>}
              title={sourceText("Failed to load personnel")}
              description={error.message}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  <SourceText source="Retry" leading trailing />
                </Button>
              }
            />
          ) : (personnelData?.results || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
              {showArchived
                ? sourceText("No archived personnel found")
                : sourceText("No active personnel found")}
            </div>
          ) : (
            <>
              {viewMode === "card" ? (
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(personnelData?.results || []).map((row) => (
                    <div
                      key={row.id}
                      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={(e) => handleSelectionChange(row.id, e.target.checked)}
                            className="h-4 w-4 shrink-0 rounded border-border text-primary"
                          />
                          <PersonnelAvatar name={row.full_name} email={row.email} photo={row.photo} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight text-foreground">{row.full_name}</p>
                            {row.email && <p className="truncate text-xs text-muted-foreground">{row.email}</p>}
                          </div>
                        </div>
                        <StatusBadge status={row.is_on_leave ? "on_leave" : row.status} variant="personnel" />
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{row.reference}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{row.cin || sourceText("—")}</span>
                        <span className={row.completeness_percentage >= 80 ? "text-emerald-600" : row.completeness_percentage >= 50 ? "text-amber-600" : "text-rose-600"}>
                          {row.completeness_percentage}%
                        </span>
                      </div>
                      <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                        <TagAction resourceType="personnel.personnelperson" targetId={row.id} compact />
                        <ExpandingActions
                          actions={row.is_archived ? [
                            { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}`) },
                            { label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const, permission: "write" as const },
                            ...(isAdministrator ? [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => setDeleteConfirm({ open: true, id: row.id }), variant: "danger" as const, permission: "delete" as const }] : []),
                          ] : [
                            { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}`) },
                            { label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}/edit`), permission: "write" as const },
                            { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const, permission: "write" as const },
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
                      <TableHead>{sourceText("Employee")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Reference")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{sourceText("Status")}</TableHead>
                      <TableHead className="hidden xl:table-cell">{sourceText("CNSS")}</TableHead>
                      <TableHead className="hidden xl:table-cell">{sourceText("CIN")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-center">{sourceText("Profile")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(personnelData?.results || []).map((row) => {
                      const checked = selectedIds.includes(row.id);
                      return (
                        <TableRow className={cn("row-hover", checked ? "bg-primary/5" : "", density === "compact" ? "[&>td]:py-1" : density === "dense" ? "[&>td]:py-0.5" : "[&>td]:py-3")} key={row.id}>
                          <TableCell className="pr-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => handleSelectionChange(row.id, e.target.checked)}
                              className="h-4 w-4 rounded border-border text-primary"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <PersonnelAvatar name={row.full_name} email={row.email} photo={row.photo} size="sm" />
                              <div>
                                <p className="font-medium text-foreground">{row.full_name}</p>
                                {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                            {row.reference}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <StatusBadge status={row.is_on_leave ? "on_leave" : row.status} variant="personnel" />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            {row.has_active_cnss ? (
                              <StatusBadge status="DECLARED_BY_THIS_COMPANY" variant="cnssSituation" showDot />
                            ) : (
                              <StatusBadge status="NOT_DECLARED" variant="cnssSituation" showDot />
                            )}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            {row.cin ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-xs">{row.cin}</span>
                                <CopyButton value={row.cin} size="xs" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">{sourceText("—")}</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-center">
                            <span
                              className={`text-sm font-semibold ${
                                row.completeness_percentage >= 80
                                  ? "text-emerald-600"
                                  : row.completeness_percentage >= 50
                                  ? "text-amber-600"
                                  : "text-rose-600"
                              }`}
                            >
                              {row.completeness_percentage}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <TagAction resourceType="personnel.personnelperson" targetId={row.id} compact />
                              <ExpandingActions
                                actions={row.is_archived ? [
                                  { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}`) },
                                  { label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const, permission: "write" as const },
                                  ...(isAdministrator ? [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => setDeleteConfirm({ open: true, id: row.id }), variant: "danger" as const, permission: "delete" as const }] : []),
                                ] : [
                                  { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}`) },
                                  { label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/personnel/${row.id}/edit`), permission: "write" as const },
                                  { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const, permission: "write" as const },
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
              {personnelData && personnelData.count > pageSize && (
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil((personnelData?.count || 0) / pageSize)}
                  totalCount={personnelData?.count || 0}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Permanent Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
        onConfirm={() => {
          if (deleteConfirm.id) permanentDeleteMutation.mutate(deleteConfirm.id);
          setDeleteConfirm({ open: false, id: null });
        }}
        title={sourceText("Delete Personnel Permanently")}
        description={sourceText("Permanently delete this archived personnel record?")}
        confirmLabel={sourceText("Delete")}
        variant="destructive"
        isLoading={permanentDeleteMutation.isPending}
      />

      {/* Archive Dialog */}
      <ConfirmDialog
        isOpen={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={handleArchive}
        title={
          selectedIds.length > 1
            ? `${sourceText("Archive selected personnel")} (${selectedIds.length})`
            : sourceText("Archive personnel")
        }
        description={
          selectedIds.length > 1
            ? `${sourceText("Are you sure you want to archive selected personnel records? This action can be reversed.")} (${selectedIds.length})`
            : sourceText(
                "Are you sure you want to archive this personnel record? This action can be reversed later.",
              )
        }
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Cancel")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />

      {/* Restore Dialog */}
      <ConfirmDialog
        isOpen={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={handleRestore}
        title={
          selectedIds.length > 1
            ? sourceText("Restore selected personnel")
            : sourceText("Restore personnel")
        }
        description={
          selectedIds.length > 1
            ? sourceText(
                "Are you sure you want to restore the selected archived personnel records?",
              )
            : sourceText(
                "Are you sure you want to restore this archived personnel record?",
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
