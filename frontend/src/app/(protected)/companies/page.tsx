"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { TagAction } from "@/components/collaboration/TagAction";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Plus,
  Search,
  Filter,
  Building2,
  Archive,
  Eye,
  Edit,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RotateCcw,
  PauseCircle,
} from "lucide-react";
import {
  useCompanies,
  useArchiveCompany,
  useRestoreCompany,
  useDeleteCompany,
  useCompanyStatistics,
} from "@/features/companies/hooks";
import { CompanyStatus } from "@/features/companies/types";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { format } from "date-fns";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi } from "@/features/exports/api";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { ConfirmDialog } from "@/features/personnel/components/common";
const statusConfig: Record<
  CompanyStatus,
  {
    label: string;
    className: string;
  }
> = {
  active: {
    get label() {
      return sourceText("Active");
    },
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  inactive: {
    get label() {
      return sourceText("Inactive");
    },
    className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
  suspended: {
    get label() {
      return sourceText("Suspended");
    },
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  archived: {
    get label() {
      return sourceText("Archived");
    },
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};
export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [viewMode, setViewMode] = useViewMode("companies", "table");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [isArchived, setIsArchived] = useState(
    searchParams.get("archive_state") === "archived",
  );
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const {
    data: companiesData,
    isLoading,
    error,
    refetch,
  } = useCompanies({
    search: search || undefined,
    status: status || undefined,
    archive_state: isArchived ? "archived" : "active",
    page,
    page_size: 10,
    ordering: "-created_at",
  });
  const { data: stats, isLoading: statsLoading } = useCompanyStatistics();
  const totalCompanies = stats?.total_companies ?? 0;
  const activeCompanies = stats?.active_companies ?? 0;
  const archivedCompanies = stats?.archived_companies ?? 0;
  const inactiveCompanies = Math.max(0, totalCompanies - activeCompanies);
  const archiveMutation = useArchiveCompany();
  const restoreMutation = useRestoreCompany();
  const deleteMutation = useDeleteCompany();
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; id: string | null; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, id: null, action: null });
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (isArchived) params.set("archive_state", "archived");
    params.set("page", "1");
    router.push(`/companies?${params.toString()}`);
  };
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/companies?${params.toString()}`);
  };
  const handleArchive = (id: string) => setActionConfirm({ open: true, id, action: 'archive' });
  const handleRestore = (id: string) => setActionConfirm({ open: true, id, action: 'restore' });
  const handleDelete = (id: string) => setActionConfirm({ open: true, id, action: 'delete' });
  const executeConfirmedAction = async () => {
    const { action, id } = actionConfirm;
    setActionConfirm({ open: false, id: null, action: null });
    if (!id) return;
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id, reason: "Archived by user" });
        refetch();
      } catch (err) {
        alert(sourceText("Failed to archive company"));
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(id);
        refetch();
      } catch (err) {
        alert(sourceText("Failed to restore company"));
      }
    } else if (action === 'delete') {
      try {
        await deleteMutation.mutateAsync(id);
        refetch();
      } catch (err) {
        alert(sourceText("Failed to delete company"));
      }
    }
  };
  const getCity = (address: string) => {
    const parts = address.split(",");
    return parts[parts.length - 1]?.trim() || "—";
  };
  return (
    <div className="space-y-6">
      {/* Hero */}
      <PageHero
        icon={Building2}
        eyebrow="Entity registry"
        title={sourceText("Companies")}
        description={sourceText("Manage, search, archive and restore your company entities from the central registry.")}
        action={<div className="flex flex-wrap items-center gap-2">
          <ExportButton
            variant="onHeroOutline"
            filenameStem="companies_export"
            onExport={(format) =>
              listExportApi("companies").download(
                {
                  ordering: "-created_at",
                  search: search || undefined,
                  status: status || undefined,
                  archive_state: isArchived ? "archived" : "active",
                },
                format,
              )
            }
          />
          <WriteOnly>
            <Link href="/companies/new">
              <Button variant="onHero">
                <Plus className="h-4 w-4 me-2" />
                <SourceText source="New Company" leading trailing />
              </Button>
            </Link>
          </WriteOnly>
        </div>}
      />

      <div className={STAT_CARDS_GRID}>
        <StatCard
          icon={Building2}
          label={sourceText("Total Companies")}
          value={totalCompanies}
          tone="primary"
          loading={statsLoading}
        />
        <StatCard
          icon={Building2}
          label={sourceText("Active")}
          value={activeCompanies}
          tone="emerald"
          loading={statsLoading}
        />
        <StatCard
          icon={PauseCircle}
          label={sourceText("Inactive")}
          value={inactiveCompanies}
          tone="amber"
          loading={statsLoading}
        />
        <StatCard
          icon={Archive}
          label={sourceText("Archived")}
          value={archivedCompanies}
          tone="rose"
          loading={statsLoading}
        />
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-4">
          <form
            onSubmit={handleSearch}
            className="flex flex-wrap gap-4 items-center"
          >
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={sourceText("Search companies...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-10"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={sourceText("All Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  <SourceText source="All Status" />
                </SelectItem>
                <SelectItem value="active">
                  <SourceText source="Active" />
                </SelectItem>
                <SelectItem value="inactive">
                  <SourceText source="Inactive" />
                </SelectItem>
                <SelectItem value="suspended">
                  <SourceText source="Suspended" />
                </SelectItem>
                <SelectItem value="archived">
                  <SourceText source="Archived" />
                </SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline">
              <Filter className="h-4 w-4 me-2" />
              <SourceText source="Filter" leading trailing />
            </Button>
            <Button
              type="button"
              variant={isArchived ? "primary" : "outline"}
              onClick={() => {
                setIsArchived((value) => !value);
                setStatus("");
                setPage(1);
              }}
            >
              {isArchived
                ? sourceText("Back to Active Companies")
                : `${sourceText("Show Archived")} (${stats?.archived_companies || 0})`}
            </Button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </form>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">
              <SourceText source="Failed to load companies" leading trailing />
            </div>
          ) : companiesData?.results.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">
                <SourceText source="No companies found" />
              </h3>
              <p className="text-muted-foreground">
                <SourceText
                  source="Get started by creating a new company."
                  leading
                  trailing
                />
              </p>
            </div>
          ) : (
            <>
          {viewMode === "card" ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {(companiesData?.results || []).map((company) => (
                <div
                  key={company.id}
                  onClick={() => router.push(`/companies/${company.id}`)}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition hover:shadow-md hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground leading-tight">{company.name}</p>
                    {company.is_archived
                      ? <Badge variant="outline" className="text-amber-600 shrink-0">{sourceText("Archived")}</Badge>
                      : <Badge variant="outline" className="text-emerald-600 shrink-0">{sourceText("Active")}</Badge>}
                  </div>
                  {company.trade_name && <p className="text-xs text-muted-foreground">{company.trade_name}</p>}
                  {company.address && <p className="text-xs text-muted-foreground truncate">{company.address}</p>}
                  <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                    {company.vat_number && <span><span className="font-medium">{sourceText("Identifiant Commun de l'Entreprise")}:</span> {company.vat_number}</span>}
                    {company.registration_number && <span><span className="font-medium">{sourceText("RC")}:</span> {company.registration_number}</span>}
                  </div>
                  <div className="mt-auto flex items-center justify-end gap-1 pt-1" onClick={(event) => event.stopPropagation()}>
                    {!company.is_archived && (
                      <TagAction resourceType="companies.company" targetId={company.id} compact />
                    )}
                    <ExpandingActions
                      actions={[
                        { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/companies/${company.id}`) },
                        ...(!company.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/companies/${company.id}/edit`), permission: "write" as const }] : []),
                        ...(!company.is_archived ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => handleArchive(company.id), variant: "warning" as const, permission: "write" as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => handleRestore(company.id), variant: "success" as const, permission: "write" as const }]),
                        ...(company.is_archived && isAdministrator ? [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => handleDelete(company.id), variant: "danger" as const, permission: "delete" as const }] : []),
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{sourceText("Company")}</TableHead>
                      <TableHead className="hidden md:table-cell">{sourceText("Identifiant Commun de l'Entreprise")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{sourceText("RC")}</TableHead>
                      <TableHead className="hidden xl:table-cell">{sourceText("Address")}</TableHead>
                      <TableHead>{sourceText("Status")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(companiesData?.results || []).map((company) => (
                      <TableRow className="row-hover" key={company.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{company.name}</p>
                            {company.trade_name && <p className="text-xs text-muted-foreground">{company.trade_name}</p>}
                          </div>
                        </TableCell>
                        {/* Field names follow the Company API and this app's own
                            create form (companies/new): ICE is `vat_number`
                            ("Identifiant Commun de l'Entreprise") and RC is `registration_number`
                            ("RC number"). This view previously read legal_form/
                            ice/rc/city, none of which the serializer returns, so
                            all four cells rendered the em-dash fallback. There is
                            no city field, so the last column shows `address`. */}
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {company.vat_number || sourceText("—")}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                          {company.registration_number || sourceText("—")}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                          {company.address || sourceText("—")}
                        </TableCell>
                        <TableCell>
                          {company.is_archived ? (
                            <Badge variant="outline" className="text-amber-600">{sourceText("Archived")}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600">{sourceText("Active")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Archived rows get Restore, not Tag/Edit.
                            *
                            * `handleRestore` and `handleDelete` were both defined
                            * in this file and called from nowhere - the live table
                            * rendered Tag / View / Edit regardless of archive
                            * state, so "Show archived" listed rows whose only two
                            * useful actions were unreachable and whose Edit link
                            * the API refuses.
                            *
                            * Tag is dropped on archived rows too: tagging routes a
                            * colleague to a record for follow-up, and the thing to
                            * do with an archived company is restore it first.
                            *
                            * Permanent delete stays Administrator-only, which is
                            * why it is gated on `isAdministrator` rather than
                            * WriteOnly - an Assistant archives, an Administrator
                            * destroys. */}
                          <div className="flex items-center justify-end gap-1">
                            {!company.is_archived && (
                              <TagAction resourceType="companies.company" targetId={company.id} compact />
                            )}
                            <ExpandingActions
                              actions={[
                                { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/companies/${company.id}`) },
                                ...(!company.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/companies/${company.id}/edit`), permission: "write" as const }] : []),
                                ...(!company.is_archived ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => handleArchive(company.id), variant: "warning" as const, permission: "write" as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => handleRestore(company.id), variant: "success" as const, permission: "write" as const }]),
                                ...(company.is_archived && isAdministrator ? [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => handleDelete(company.id), variant: "danger" as const, permission: "delete" as const }] : []),
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

              {companiesData && companiesData.count > 10 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    <SourceText source="Showing" leading trailing />
                    {(page - 1) * 10 + 1}
                    <SourceText source="to" leading />{" "}
                    {Math.min(page * 10, companiesData.count)}
                    <SourceText source="of" leading /> {companiesData.count}
                    <SourceText source="companies" leading trailing />
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page * 10 >= companiesData.count}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, id: null, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive Company") :
          actionConfirm.action === 'restore' ? sourceText("Restore Company") :
          sourceText("Delete Company")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this company?") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this company?") :
          sourceText("Are you sure you want to permanently delete this company? This cannot be undone.")
        }
        confirmLabel={
          actionConfirm.action === 'archive' ? sourceText("Archive") :
          actionConfirm.action === 'restore' ? sourceText("Restore") :
          sourceText("Delete")
        }
        variant={actionConfirm.action === 'delete' ? "destructive" : "default"}
        isLoading={archiveMutation.isPending || restoreMutation.isPending || deleteMutation.isPending}
      />
    </div>
  );
}