"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { TagAction } from "@/components/collaboration/TagAction";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  Edit,
  Eye,
  Filter,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { FilterPopover } from "@/components/ui/filter-popover";
import { inventoryApi } from "@/features/inventory/api";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/features/companies/hooks";
import { useAuth } from "@/hooks/useAuth";
import { useExperience } from "@/lib/experience";
import { getEffectiveRoles } from "@/lib/navigation";
import { operationError } from "@/lib/form-errors";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { SourceText } from "@/components/i18n/SourceText";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Pagination } from "@/features/personnel/components/common";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import { WriteOnly } from "@/components/auth/WriteOnly";

function itemTypeLabel(value: string) {
  return value === "fixed_asset"
    ? sourceText("Fixed asset")
    : sourceText("Consumable");
}

function statusLabel(value: string) {
  switch (value) {
    case "available": return sourceText("Available");
    case "assigned": return sourceText("Assigned");
    case "in_use": return sourceText("In use");
    case "maintenance": return sourceText("Maintenance");
    case "damaged": return sourceText("Damaged");
    case "disposed": return sourceText("Disposed");
    default: return value.replaceAll("_", " ");
  }
}

function statusVariant(value: string): "default" | "outline" | "secondary" | "destructive" {
  switch (value) {
    case "available": return "default";
    case "in_use":
    case "assigned": return "secondary";
    case "damaged":
    case "disposed": return "destructive";
    default: return "outline";
  }
}

function formatNumber(value: number, locale: "en" | "fr" | "ar") {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
  ).format(value);
}

export default function InventoryPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { locale } = useExperience();
  const isAdmin = getEffectiveRoles(user).includes("Administrator");
  const [viewMode, setViewMode] = useViewMode("inventory", "table");
  const [search, setSearch] = useState(""),
    [company, setCompany] = useState(""),
    [type, setType] = useState(""),
    [statusTab, setStatusTab] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1);

  const INVENTORY_STATUS_TABS = [
    { id: "", label: sourceText("All") },
    { id: "available", label: sourceText("Available") },
    { id: "assigned", label: sourceText("Assigned") },
    { id: "in_use", label: sourceText("In use") },
    { id: "maintenance", label: sourceText("Maintenance") },
    { id: "damaged", label: sourceText("Damaged") },
  ];

  const params = {
    page,
    page_size: 25,
    search,
    company,
    item_type: type,
    archive_state: archived ? "archived" : "active",
    ...(statusTab ? { status: statusTab } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory-items", params],
    queryFn: () => inventoryApi.listItems(params),
    placeholderData: (prev: any) => prev,
  });

  const tabCounts = (data?.results ?? []).reduce((acc: Record<string, number>, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const { data: companies } = useCompanies({ page_size: 500, archive_state: "active" });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory-items"] });

  const archive = useMutation({
    mutationFn: (id: string) => inventoryApi.archiveItem(id, sourceText("Archived from Inventory")),
    onSuccess: () => { invalidate(); toast.success(sourceText("Item archived")); },
    onError: (e) => toast.error(operationError(sourceText("Archive"), e)),
  });

  const restore = useMutation({
    mutationFn: inventoryApi.restoreItem,
    onSuccess: () => { invalidate(); toast.success(sourceText("Item restored")); },
    onError: (e) => toast.error(operationError(sourceText("Restore"), e)),
  });

  const purge = useMutation({
    mutationFn: inventoryApi.permanentDeleteItem,
    onSuccess: () => { invalidate(); toast.success(sourceText("Item deleted permanently")); },
    onError: (e) => toast.error(operationError(sourceText("Delete"), e)),
  });

  const download = async () => {
    try {
      const blob = await inventoryApi.exportItems(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(operationError(sourceText("Export inventory"), e));
    }
  };

  const totalItems = data?.count ?? 0;
  const results = data?.results ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        icon={Package}
        eyebrow="Asset management"
        title={sourceText("Inventory")}
        description={sourceText("Fixed assets and consumable supplies across all companies — track status, location and movement history.")}
        action={<WriteOnly>
          <div className="flex gap-2">
            <Button
              variant="onHeroOutline"
              onClick={download}
            >
              <Download className="me-2 h-4 w-4" />
              <SourceText source="Export" leading trailing />
            </Button>
            <Button variant="onHero" asChild>
              <Link href="/inventory/new">
                <Plus className="me-2 h-4 w-4" />
                <SourceText source="Add item" leading trailing />
              </Link>
            </Button>
          </div>
        </WriteOnly>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Package} label={sourceText("Total items")} value={totalItems} tone="primary" />
        <StatCard icon={Archive} label={sourceText("Archived view")} value={archived ? totalItems : 0} tone="amber" />
        <StatCard icon={RotateCcw} label={sourceText("Active view")} value={archived ? 0 : totalItems} tone="emerald" />
      </section>

      {/* === Table Card with unified CardHeader: search + selects + archived + refresh + status tabs === */}
      <Card>
        <CardHeader className="pb-4">
          {/* Row 1: search + company + type + archived toggle + refresh */}
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={sourceText("Search name, reference, tag, location…")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="ps-10"
              />
            </div>
            <Select value={company || "all"} onValueChange={(v) => { setCompany(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={sourceText("All companies")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><SourceText source="All companies" /></SelectItem>
                {companies?.results.map((co) => (
                  <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type || "all"} onValueChange={(v) => { setType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={sourceText("All types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><SourceText source="All types" /></SelectItem>
                <SelectItem value="fixed_asset"><SourceText source="Fixed assets" /></SelectItem>
                <SelectItem value="consumable"><SourceText source="Consumables" /></SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={archived ? "secondary" : "outline"}
              className="shrink-0"
              onClick={() => { setArchived((v) => !v); setPage(1); }}
            >
              <RotateCcw className="me-2 h-4 w-4" />
              {archived ? sourceText("Back to Active") : sourceText("Show Archived")}
            </Button>
            {/* Refresh — mini square icon button matching Companies pattern */}
            <Button
              type="button" variant="outline" size="icon"
              className="h-10 w-10 shrink-0 rounded-lg"
              onClick={() => qc.invalidateQueries({ queryKey: ["inventory-items"] })}
              title={sourceText("Refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </form>

          {/* Row 2: smart status tab strip */}
          <div className="mt-3 flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1 overflow-x-auto">
            {INVENTORY_STATUS_TABS.map((tab) => {
              const count = tab.id ? (tabCounts[tab.id] ?? 0) : results.length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setStatusTab(tab.id); setPage(1); }}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                    statusTab === tab.id
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={cn(
                      "ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                      statusTab === tab.id ? "bg-primary/10 text-primary" : "bg-muted",
                    )}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-0">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0">
                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted/60 animate-pulse" />
                <div className="ms-auto h-5 w-16 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-10 text-center text-red-600">
            {operationError(sourceText("Load inventory"), error)}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>{archived ? sourceText("No archived inventory items found.") : sourceText("No active inventory items found.")}</p>
          </div>
        ) : viewMode === "card" ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((item) => (
              <div key={item.id}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition hover:shadow-md hover:border-primary/30"
                onClick={() => router.push(`/inventory/${item.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground leading-tight">{item.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{item.item_type || "—"}</span>
                </div>
                {item.company_name && <p className="text-xs text-muted-foreground">{item.company_name}</p>}
                {item.location && <p className="text-xs text-muted-foreground">{sourceText("Location")}: {item.location}</p>}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{sourceText("Qty")}: <span className="font-medium text-foreground">{item.quantity ?? "—"}</span></span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_archived ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {item.is_archived ? sourceText("Archived") : sourceText("Active")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{sourceText("Item")}</TableHead>
                <TableHead className="hidden md:table-cell">{sourceText("Company")}</TableHead>
                <TableHead className="hidden lg:table-cell">{sourceText("Type")}</TableHead>
                <TableHead>{sourceText("Status")}</TableHead>
                <TableHead className="hidden xl:table-cell text-end">{sourceText("Qty")}</TableHead>
                <TableHead className="hidden xl:table-cell">{sourceText("Location")}</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((item) => (
                <TableRow className="row-hover group" key={item.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {item.reference}{item.asset_tag ? ` · ${item.asset_tag}` : ""}
                      </p>
                      {item.needs_reorder && (
                        <span className="text-xs font-semibold text-red-600">
                          <SourceText source="Low stock" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {item.company_name || sourceText("—")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {itemTypeLabel(item.item_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-end font-mono text-sm text-foreground xl:table-cell">
                    {formatNumber(Number(item.quantity), locale)} {item.unit}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {item.location || sourceText("—")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <TagAction resourceType="inventory.inventoryitem" targetId={item.id} compact />
                      {item.is_archived ? (
                        <WriteOnly>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title={sourceText("Restore")} onClick={() => restore.mutate(item.id)}>
                            <RotateCcw size={14} />
                          </Button>
                        </WriteOnly>
                      ) : (
                        <WriteOnly>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title={sourceText("Archive")} onClick={() => archive.mutate(item.id)}>
                            <Archive size={14} />
                          </Button>
                        </WriteOnly>
                      )}
                      <ExpandingActions
                        actions={[
                          { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/inventory/${item.id}`) },
                          ...(!item.is_archived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push(`/inventory/${item.id}/edit`), permission: "write" as const }] : []),
                          ...(item.is_archived && isAdmin && [{ label: sourceText("Delete Permanently"), icon: <Trash2 size={14} />, onClick: () => purge.mutate(item.id), variant: "danger" as const, permission: "delete" as const }] || []),
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
        </CardContent>
      </Card>

      {data && data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(data.count / 25)}
          totalCount={data.count}
          pageSize={25}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}