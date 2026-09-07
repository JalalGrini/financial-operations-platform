"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { TagAction } from "@/components/collaboration/TagAction";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftRight,
  Loader2,
  RefreshCw, Plus, CheckCircle2, Clock, Archive, Pencil, Eye, TrendingUp, RotateCcw
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { FilterPopover } from "@/components/ui/filter-popover";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { transfersApi } from "@/features/transfers/api";
import { EntityBalances } from "@/features/transfers/EntityBalances";
import type { CashTransfer } from "@/features/transfers/types";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi } from "@/features/exports/api";
import { useRole } from "@/hooks/useRole";
import { sourceText } from "@/lib/i18n/source-catalog";
import { WriteOnly } from "@/components/auth/WriteOnly";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 28 } } };

function StatusBadge({ status }: { status: string }) {
  return status === "confirmed" ? (
    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
      <CheckCircle2 className="h-3 w-3" /> {sourceText("Confirmed")}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <Clock className="h-3 w-3" /> {sourceText("Draft")}
    </Badge>
  );
}

function TransferActions({ t: _t }: { t: CashTransfer }) { return null; }

export default function TransfersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [filterSelected, setFilterSelected] = useState<Record<string, string[]>>({});
  const [viewMode, setViewMode] = useViewMode("transfers", "card");

  const { data: summaryData } = useQuery({
    queryKey: ["transfers", "summary"],
    queryFn: () => transfersApi.summary(),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transfers", "list", showArchived, filterSelected, search],
    queryFn: () => transfersApi.list({ is_archived: showArchived ? "true" : "false", ...(filterSelected.status?.[0] ? { status: filterSelected.status[0] } : {}), ...(search ? { search } : {}) }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => transfersApi.archive(id),
    onSuccess: () => {
      toast.success("Transfer archived");
      setArchiveTarget(null);
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: () => toast.error("Failed to archive transfer"),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => transfersApi.confirm(id),
    onSuccess: () => { toast.success("Transfer confirmed — amount reflected in budget"); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: () => toast.error("Failed to confirm transfer"),
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => transfersApi.revertToDraft(id),
    onSuccess: () => { toast.success("Transfer reverted to draft"); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: () => toast.error("Failed to revert transfer"),
  });

  // Transfers is readable by every role; only Administrator and Assistant
  // may change anything. The server enforces this in CanManageTransfers -
  // these gates only stop the UI offering an action that would 403.
  const { canWrite } = useRole();

  const transfers = data?.results ?? [];



  return (
    <div className="space-y-6 p-6">
      <PageHero
        eyebrow={sourceText("Finance")}
        title={sourceText("Cash Transfers")}
        description={sourceText("Track money flow between companies and associated persons. Confirmed transfers are deducted from entity budgets.")}
        icon={ArrowLeftRight}
        action={<div className="flex flex-wrap items-center gap-2">
          {/* The transfers list is fetched unfiltered and filtered in the
              browser, so the export is the same unfiltered set. */}
          <ExportButton
            filenameStem="cash_transfers_export"
            onExport={(format) =>
              listExportApi("cashTransfers").download({}, format)
            }
          />
          {canWrite && (
            <Link href="/transfers/new"><Button className="gap-2"><Plus className="h-4 w-4" /> {sourceText("New Transfer")}</Button></Link>
          )}
        </div>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={sourceText("Total")} value={summaryData?.total_count ?? 0} icon={ArrowLeftRight} />
        <StatCard label={sourceText("Drafts")} value={summaryData?.draft_count ?? 0} icon={Clock} tone="amber" />
        <StatCard label={sourceText("Confirmed")} value={summaryData?.confirmed_count ?? 0} icon={CheckCircle2} tone="emerald" />
        <StatCard label={sourceText("Confirmed Volume")} value={`${Number(summaryData?.total_confirmed_volume ?? 0).toLocaleString()} MAD`} icon={TrendingUp} tone="blue" />
      </div>

      {/* Placed above the transfer list: the balance per entity is the question
          this screen is opened to answer, and the list is the supporting detail. */}
      <EntityBalances />

      {/* Transfers list — search + view toggle + refresh customised for this page */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder={sourceText("Search by reference, note, party…")} containerClassName="flex-1 min-w-[200px]" />
            <FilterPopover
              groups={[{ key: "status", label: sourceText("Status"), options: [{ value: "draft", label: sourceText("Draft") }, { value: "confirmed", label: sourceText("Confirmed") }] }]}
              selected={filterSelected}
              onSelectedChange={(next) => setFilterSelected(next)}
              onReset={() => setFilterSelected({})}
            />
            <Button type="button" variant={showArchived ? "secondary" : "outline"} className="shrink-0 gap-2" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="h-4 w-4" />{sourceText("Archived")}
            </Button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-lg"
              onClick={() => refetch()} disabled={isLoading} title={sourceText("Refresh")}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">

      {viewMode === "card" && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {transfers.map(t => (
              <motion.div key={t.id} variants={item} layout>
                <Card className="hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground font-mono">{t.reference}</p>
                        <CardTitle className="text-base mt-0.5">{t.from_label} \u2192 {t.to_label}</CardTitle>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-2xl font-bold tabular-nums">
                      {Number(t.amount).toLocaleString("fr-MA")} <span className="text-sm font-normal text-muted-foreground">{t.currency}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t.transfer_date}</p>
                    {/* A clamped note used to lose its tail with no affordance
                        to read it. ExpandableText only offers "See more" when
                        the text really is clipped. */}
                    {t.note && (
                      <ExpandableText
                        text={t.note}
                        lines={2}
                        label={sourceText("Note")}
                        context={`${t.reference} · ${t.from_label} → ${t.to_label}`}
                        className="text-sm text-muted-foreground"
                      />
                    )}
                    <div className="flex items-center gap-1">
                      <TagAction resourceType="transfers.cashtransfer" targetId={t.id} compact />
                      {canWrite && (<>
                      {t.status === "draft" ? (
                        <Button size="sm" className="gap-1.5 h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => confirmMutation.mutate(t.id)} disabled={confirmMutation.isPending}><CheckCircle2 className="h-3 w-3" /> {sourceText("Confirm")}</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => revertMutation.mutate(t.id)} disabled={revertMutation.isPending}><RotateCcw className="h-3 w-3" /> {sourceText("Revert")}</Button>
                      )}
                      </>)}
                      <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs" onClick={() => router.push(`/transfers/${t.id}`)}><Eye size={14} /> {sourceText("View")}</Button>
                      {canWrite && (<>{!t.is_archived && <Link href={`/transfers/${t.id}/edit`}><span className="sr-only">{sourceText("Edit")}</span></Link>}<ExpandingActions actions={[{ label: sourceText("Edit"), icon: <Pencil size={14} />, onClick: () => router.push(`/transfers/${t.id}/edit`), permission: "write" as const }, { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => setArchiveTarget(t.id), variant: "warning" as const, permission: "write" as const }]} /></>)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {viewMode === "table" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sourceText("Reference")}</TableHead>
                  <TableHead>{sourceText("From")}</TableHead>
                  <TableHead>{sourceText("To")}</TableHead>
                  <TableHead>{sourceText("Amount")}</TableHead>
                  <TableHead>{sourceText("Date")}</TableHead>
                  <TableHead>{sourceText("Status")}</TableHead>
                  <TableHead>{sourceText("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map(t => (
                  <TableRow className="row-hover" key={t.id}>
                    <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                    <TableCell>{t.from_label}</TableCell>
                    <TableCell>{t.to_label}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{Number(t.amount).toLocaleString("fr-MA")} {t.currency}</TableCell>
                    <TableCell>{t.transfer_date}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TagAction resourceType="transfers.cashtransfer" targetId={t.id} compact />
                        <TransferActions t={t} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </div>
        </motion.div>
      )}

      {transfers.length === 0 && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{sourceText("No transfers yet. Create your first one.")}</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!archiveTarget}
        title={sourceText("Archive transfer?")}
        description="This will hide the transfer from the default list. You can restore it later."
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        isLoading={archiveMutation.isPending}
      />
        </CardContent>
      </Card>
    </div>
  );
}
