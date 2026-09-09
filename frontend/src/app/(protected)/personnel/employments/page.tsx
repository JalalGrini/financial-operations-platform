"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { companyDisplayName, companyFilterOptions } from "@/lib/company-scope";
import { FilteredExportButton } from "@/components/ui/filtered-export-button";
import { employmentPayoutLabel } from "@/features/personnel/components/EmploymentPayoutFields";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { FilterPopover } from "@/components/ui/filter-popover";
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
  Briefcase,
  Building2,
  Trash2,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEmploymentList,
  useArchiveEmployment,
  useRestoreEmployment,
  usePermanentDeleteEmployment,
  useCompanies,
  usePersonnelSelect,
} from "@/features/personnel/hooks";
import { employmentApi } from "@/features/personnel/api";
import { toast } from "@/components/ui/toast";
import {
  ContractType,
  EmploymentStatus,
  Employment,
  PersonnelPerson,
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
import { Breadcrumb } from "@/components/ui/page-components";
import {
  StatusBadge,
  CurrencyDisplay,
  DateDisplay,
  PersonnelAvatar,
} from "@/features/personnel/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const contractTypeLabels: Record<ContractType, string> = {
  [ContractType.PERMANENT]: sourceText("Permanent"),
  [ContractType.FIXED_TERM]: sourceText("Fixed term"),
  [ContractType.TEMPORARY]: sourceText("Temporary"),
  [ContractType.INTERNSHIP]: sourceText("Internship"),
  [ContractType.APPRENTICESHIP]: sourceText("Apprenticeship"),
  [ContractType.SEASONAL]: sourceText("Seasonal"),
  [ContractType.PART_TIME]: sourceText("Part time"),
  [ContractType.OTHER]: sourceText("Other"),
};

export default function EmploymentsListPage() {
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const [search, setSearch] = useState("");
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({});
  const statusFilter = filterSelected.status?.[0] ?? "";
  const companyFilter = filterSelected.company?.[0] ?? "";
  const personFilter = filterSelected.person?.[0] ?? "";
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<keyof Employment | string>("hire_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact" | "dense">(
    "comfortable",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [selectedForArchive, setSelectedForArchive] = useState<string>("");
  const [archiveReason, setArchiveReason] = useState("");
  const {
    data: employmentsData,
    isLoading,
    error,
    refetch,
  } = useEmploymentList({
    page,
    page_size: pageSize,
    search,
    status: statusFilter || undefined,
    company: companyFilter || undefined,
    person: personFilter || undefined,
    ordering: `${sortOrder === "desc" ? "-" : ""}${sortBy}`,
    archive_state: showArchived ? "archived" : "active",
  });
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const archiveMutation = useArchiveEmployment({
    onSuccess: () => {
      refetch();
      setArchiveDialogOpen(false);
      setSelectedForArchive("");
      setArchiveReason("");
    },
  });
  const permanentDeleteMutation = usePermanentDeleteEmployment({
    onSuccess: () => {
      refetch();
      toast.success(sourceText("Employment permanently deleted"));
    },
    onError: (error) => toast.error(sourceText(error.message)),
  });
  const restoreMutation = useRestoreEmployment({
    onSuccess: () => {
      refetch();
      setRestoreDialogOpen(false);
      setSelectedForArchive("");
    },
  });
  const handleSort = useCallback(
    (key: keyof Employment | string) => {
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
        setSelectedIds(employmentsData?.results.map((e) => e.id) || []);
      } else {
        setSelectedIds([]);
      }
    },
    [employmentsData],
  );
  const handleSelectionChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((selectedId) => selectedId !== id),
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
  const columns = useMemo<Column<Employment>[]>(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={
              selectedIds.length === (employmentsData?.results.length || 0) &&
              (employmentsData?.results.length || 0) > 0
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
          <span className="font-medium">{companyDisplayName(row.company_name, sourceText("Tout le groupe"))}</span>
        ),
        className: "w-40",
      },
      {
        key: "job_title",
        header: sourceText("Job Title"),
        render: (_, row) => <span>{row.job_title || sourceText("—")}</span>,
        className: "w-36",
      },
      {
        key: "department",
        header: sourceText("Department"),
        render: (_, row) => <span>{row.department || sourceText("—")}</span>,
        className: "w-36",
      },
      {
        key: "employment_status",
        header: sourceText("Status"),
        render: (_, row) => (
          <StatusBadge
            status={row.is_on_leave ? EmploymentStatus.ON_LEAVE : row.employment_status}
            variant="employment"
          />
        ),
        className: "w-36",
      },
      {
        key: "contract_type",
        header: sourceText("Contract"),
        render: (_, row) => (
          <Badge variant="outline" className="text-xs">
            {row.contract_type
              ? contractTypeLabels[row.contract_type as ContractType] ||
                row.contract_type
              : sourceText("—")}
          </Badge>
        ),
        className: "w-32",
      },
      {
        key: "hire_date",
        header: sourceText("Hire Date"),
        render: (_, row) => <DateDisplay date={row.hire_date} format="short" />,
        className: "w-32",
      },
      {
        key: "actions",
        header: sourceText("Actions"),
        render: (_, row) => (
<div className="flex items-center justify-end gap-1">
          <TagAction resourceType="personnel.employment" targetId={row.id} compact />
          <ExpandingActions
              actions={row.is_archived ? [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const }, ...(isAdministrator ? [{ permission: "delete" as const, label: "Delete permanently", icon: <span>🗑</span>, onClick: () => setDeleteConfirm({ open: true, id: row.id }), variant: "danger" as const }] : [])] : [{ label: "View", icon: <Eye size={14} />, onClick: () => router.push(`/personnel/employments/${row.id}`) }, { permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/employments/${row.id}/edit`) }, { permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const }]}
            />
</div>
        ),
        className: "w-20 text-end",
      },
    ],
    [
      employmentsData,
      selectedIds,
      handleSelectAll,
      openArchiveDialog,
      openRestoreDialog,
      isAdministrator,
      permanentDeleteMutation,
    ],
  );
  const visibleRows = employmentsData?.results || [];
  const activeCount = visibleRows.filter(
    (row) => row.employment_status === EmploymentStatus.ACTIVE,
  ).length;
  const archivedCount = visibleRows.filter((row) => row.is_archived).length;
  const companyCount = new Set(
    visibleRows.map((row) => row.company).filter(Boolean),
  ).size;

  const handleArchive = () => {
    if (selectedForArchive) {
      archiveMutation.mutate({ id: selectedForArchive, reason: archiveReason });
    }
  };
  const handleRestore = () => {
    if (selectedForArchive) {
      restoreMutation.mutate(selectedForArchive);
    }
  };
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);
  if (isLoading && !employmentsData) {
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
              return sourceText("Employments");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={Briefcase}
        eyebrow="Contracts & assignments"
        title={sourceText("Employments")}
        description={sourceText("Manage employment records, contracts, and job assignments across all companies.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            onClick={() => router.push("/personnel/employments/new")}
            size="default"
          >
            <Plus className="me-2 h-4 w-4" />
            <SourceText source="Add Employment" leading trailing />
          </Button>
        </WriteOnly>}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Briefcase} label={sourceText("Visible employments")} value={employmentsData?.count ?? 0} tone="primary" />
          <StatCard icon={Building2} label={sourceText("Active")} value={activeCount} tone="emerald" />
          <StatCard icon={Building2} label={sourceText("Companies in view")} value={companyCount} tone="indigo" />
          <StatCard icon={Archive} label={sourceText("Archived")} value={archivedCount} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Employment operations guide"}
          title={"Keep contracts, status and assignments easy to audit"}
          body={"Use this list to monitor active contracts, isolate archived records and open each employment only when you need full contract detail or edits."}
          items={[
            "Filter by company or person before archiving to avoid cross-record mistakes.",
            "Leave archived employments recoverable unless a permanent delete is truly required.",
            "Review contract type and status together so personnel workflows stay aligned.",
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
                placeholder={sourceText("Search by person, company, job title, reference...")}
                className="ps-10"
              />
            </div>
            <FilterPopover
              groups={[
                { key: "status", label: sourceText("Employment Status"), options: [
                  { value: "active", label: sourceText("Active") },
                  { value: "inactive", label: sourceText("Inactive") },
                  { value: "on_leave", label: sourceText("On Leave") },
                  { value: "suspended", label: sourceText("Suspended") },
                  { value: "terminated", label: sourceText("Terminated") },
                ]},
                { key: "company", label: sourceText("Company"), options: companyFilterOptions((companies as any)?.results || companies || [], sourceText("Tout le groupe")) },
                { key: "person", label: sourceText("Person"), options: ((personnelOptions as any)?.results || personnelOptions || []).map((p: any) => ({ value: p.id, label: p.full_name || p.name })) },
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
              {showArchived ? sourceText("View active employments") : sourceText("View employment archive")  }
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
            <FilteredExportButton
              prefix="employments"
              allowMulti
              extraParams={{
                search: search || undefined,
                company: companyFilter || undefined,
                person: personFilter || undefined,
              }}
              options={[
                { value: "active", label: sourceText("Actifs seulement"), slug: "actifs" },
                { value: "inactive", label: sourceText("Inactifs seulement"), slug: "inactifs" },
                { value: "on_leave", label: sourceText("On Leave"), slug: "en_conge" },
                { value: "suspended", label: sourceText("Suspended"), slug: "suspendus" },
                { value: "resigned", label: sourceText("Resigned"), slug: "demission" },
                { value: "terminated", label: sourceText("Terminated"), slug: "termines" },
              ]}
              onExport={(params) =>
                employmentApi.export(
                  {
                    search: params.search,
                    company: params.company,
                    person: params.person,
                    employment_status: params.status,
                  },
                  "xlsx",
                )
              }
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <EmptyState
              icon={<span className="h-12 w-12 text-red-500">⚠️</span>}
              title={sourceText("Failed to load employments")}
              description={sourceText(error.message)}
              action={
                <Button onClick={() => refetch()} variant="outline">
                  <SourceText source="Retry" leading trailing />
                </Button>
              }
            />
          ) : (employmentsData?.results || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
              <SourceText source="No employments found" leading trailing />
            </div>
          ) : (
            <>
              <div className="overflow-hidden">
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{sourceText("Employee")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Position")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{sourceText("Company")}</TableHead>
                      <TableHead>{sourceText("Status")}</TableHead>
                      <TableHead className="hidden xl:table-cell">{sourceText("Payment")}</TableHead>
                      <TableHead className="hidden xl:table-cell text-end">{sourceText("Salary")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(employmentsData?.results || []).map((row) => (
                      <TableRow className="row-hover" key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{row.person_name || sourceText("—")}</p>
                            <p className="text-xs text-muted-foreground">{row.employee_reference || row.reference}</p>
                          </div>
                        </TableCell>
                        {/* Reads the fields the Employment API actually returns.
                            This view previously used employee_name/position_name/
                            status/gross_salary, none of which exist on the
                            serializer, so those cells always rendered undefined. */}
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.job_title || sourceText("—")}</TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{companyDisplayName(row.company_name, sourceText("Tout le groupe"))}</TableCell>
                        <TableCell><StatusBadge status={row.is_on_leave ? EmploymentStatus.ON_LEAVE : row.employment_status} variant="employment" /></TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{employmentPayoutLabel(row.payout_method, row.rib)}</TableCell>
                        <TableCell className="hidden xl:table-cell text-end"><Amount value={(row.current_salary ?? row.current_salary_detail)?.fixed_monthly_gross_salary ?? 0} currency="MAD" size="sm" /></TableCell>
                        <TableCell>
                          {/* Same defect class as the CNSS list: this is the table
                            * that actually renders, and it offered Edit on an
                            * archived row (which the API refuses) with no
                            * <WriteOnly>, so a Director got a 403. The `columns`
                            * definition above branches correctly and is not what
                            * draws these cells. View stays ungated because reading
                            * is allowed for every role. */}
                          <div className="flex items-center justify-end gap-1">
                            <TagAction resourceType="personnel.employment" targetId={row.id} compact />
                            <ExpandingActions
                              actions={row.is_archived ? [
                                { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/employments/${row.id}`) },
                                { label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => openRestoreDialog(row.id), variant: "success" as const, permission: "write" as const },
                                ...(isAdministrator ? [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => setDeleteConfirm({ open: true, id: row.id }), variant: "danger" as const, permission: "delete" as const }] : []),
                              ] : [
                                { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/personnel/employments/${row.id}`) },
                                { label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/personnel/employments/${row.id}/edit`), permission: "write" as const },
                                { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => openArchiveDialog(row.id), variant: "warning" as const, permission: "write" as const },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </div>
              {employmentsData && employmentsData.count > pageSize && (
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(
                    (employmentsData?.count || 0) / pageSize,
                  )}
                  totalCount={employmentsData?.count || 0}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Archive Dialog */}
      <ConfirmDialog
        isOpen={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={handleArchive}
        title={
          selectedIds.length > 1
            ? `${sourceText("Archive employments prompt prefix")} ${selectedIds.length} ${sourceText("Archive employments prompt suffix")}`
            : sourceText("Archive employment")
        }
        description={
          selectedIds.length > 1
            ? `${sourceText("Archive employment records prompt prefix")} ${selectedIds.length} ${sourceText("Archive employment records prompt suffix")}`
            : sourceText(
                "Are you sure you want to archive this employment record? This action can be reversed.",
              )
        }
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Cancel")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />

      {/* Permanent Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
        onConfirm={() => {
          if (deleteConfirm.id) permanentDeleteMutation.mutate(deleteConfirm.id);
          setDeleteConfirm({ open: false, id: null });
        }}
        title={sourceText("Delete Employment Permanently")}
        description={sourceText("Permanently delete this archived employment?")}
        confirmLabel={sourceText("Delete")}
        variant="destructive"
        isLoading={permanentDeleteMutation.isPending}
      />

      {/* Restore Dialog */}
      <ConfirmDialog
        isOpen={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={handleRestore}
        title={
          selectedIds.length > 1
            ? `${sourceText("Restore employments prompt prefix")} ${selectedIds.length} ${sourceText("Restore employments prompt suffix")}`
            : sourceText("Restore employment")
        }
        description={
          selectedIds.length > 1
            ? `${sourceText("Restore employment records prompt prefix")} ${selectedIds.length} ${sourceText("Restore employment records prompt suffix")}`
            : sourceText(
                "Are you sure you want to restore this archived employment record?",
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
