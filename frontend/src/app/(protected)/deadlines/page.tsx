"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Edit,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  RefreshCw,
  Archive,
  Loader2,
} from "lucide-react";
import { deadlinesApi } from "@/features/deadlines/api";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { DeadlinePeriodTracker } from "@/features/deadlines/PeriodTracker";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { FilterPopover } from "@/components/ui/filter-popover";
import { SearchInput } from "@/components/ui/search-input";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi } from "@/features/exports/api";
import { BlurFade } from "@/components/ui/blur-fade";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Stagger, FadeIn } from "@/components/ui/stagger";
import { PulseIndicator } from "@/components/ui/pulse-indicator";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";


import { sourceText } from "@/lib/i18n/source-catalog";
// ── Status badge colour map ─────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  upcoming:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
  due_soon:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
  overdue:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
  completed:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
  cancelled:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/60",
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-rose-600",
};




// ── Page ────────────────────────────────────────────────────────────────────
export default function DeadlinesPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // Search / filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");




  // Build query string
  const queryString = useMemo(() => {
    const p = new URLSearchParams({ ordering: "due_at", page_size: "100" });
    if (search) p.set("search", search);
    if (filter === "active") p.set("active", "true");
    else if (filter !== "all") p.set("status", filter);
    return "?" + p.toString();
  }, [search, filter]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["deadlines"] });

  // Queries
  const listQuery = useQuery({
    queryKey: ["deadlines", queryString],
    queryFn: () => deadlinesApi.list(queryString),
  });

  // Mutations
  const completeMutation = useMutation({
    mutationFn: deadlinesApi.complete,
    onSuccess: refresh,
  });
  const restoreMutation = useMutation({
    mutationFn: deadlinesApi.reopen,
    onSuccess: refresh,
  });
  const archiveMutation = useMutation({
    mutationFn: deadlinesApi.archive,
    onSuccess: refresh,
  });

  const rows = listQuery.data?.results ?? [];

  // Derived stats. `completed` counts deadlines whose *current* period is done
  // - because completing a recurring deadline no longer jumps `due_at` forward,
  // a monthly obligation handled this month stays counted here for the rest of
  // the month instead of instantly reverting to "upcoming".
  const stats = {
    total: rows.length,
    dueSoon: rows.filter((x) => x.computed_status === "due_soon").length,
    overdue: rows.filter((x) => x.computed_status === "overdue").length,
    completed: rows.filter((x) => x.status === "completed").length,
  };

  // Filter tabs
  const FILTER_TABS = [
    { value: "active", label: "Active" },
    { value: "all", label: "All" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];





  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <PageHero
        icon={CalendarClock}
        eyebrow="Persistent operations planner"
        title={sourceText("Deadlines that survive every session.")}
        description="Create, search, complete and reopen checkpoints stored through the real Django API. Every entry persists in PostgreSQL — refreshing the page changes nothing."
        action={<div className="flex flex-wrap items-center gap-2">
          {/* Export is a read, so it sits outside WriteOnly - Directors export too. */}
          <ExportButton
            variant="onHeroOutline"
            filenameStem="deadlines_export"
            onExport={(format) =>
              listExportApi("deadlines").download(
                {
                  ordering: "due_at",
                  search: search || undefined,
                  ...(filter === "active"
                    ? { active: "true" }
                    : filter !== "all"
                      ? { status: filter }
                      : {}),
                },
                format,
              )
            }
          />
          <WriteOnly>
            <Button variant="onHero" asChild>
              <Link href="/deadlines/new">
                <Plus className="mr-2 h-4 w-4" />
                {sourceText("New deadline")}
              </Link>
            </Button>
          </WriteOnly>
        </div>}
      />

      {/* ── Stat strip ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarClock}
          label={sourceText("Visible")}
          value={stats.total}
          tone="primary"
        />
        <StatCard
          icon={Clock3}
          label={sourceText("Due soon")}
          value={stats.dueSoon}
          tone="amber"
        />
        <StatCard
          icon={CircleAlert}
          label={sourceText("Overdue")}
          value={stats.overdue}
          tone="rose"
        />
        <StatCard
          icon={CheckCircle2}
          label={sourceText("Done this period")}
          value={stats.completed}
          tone="emerald"
        />
      </div>

      {/* ── Queue ── */}
      <section className="rounded-[28px] border border-border/80 bg-card p-5 shadow-sm">
        {/* Queue header + controls */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{sourceText("Deadline queue")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {sourceText("Persistent records — not temporary UI state.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={sourceText("Search by title, category, company, responsible...")}
                  className="ps-10 w-52"
                />
              </div>
              <FilterPopover
                groups={[
                  { key: "filter", label: sourceText("Status"), options: FILTER_TABS.filter(t => t.value).map(t => ({ value: t.value, label: t.label })) },
                ]}
                selected={{ filter: filter ? [filter] : [] }}
                onSelectedChange={(next) => setFilter(next.filter?.[0] ?? "")}
                onReset={() => setFilter("")}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg"
                onClick={() => listQuery.refetch()}
                disabled={listQuery.isLoading}
                title={sourceText("Refresh")}
              >
                {listQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                  filter === tab.value
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="mt-5">
          {listQuery.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">
              {sourceText("Failed to load deadlines. Please refresh and try again.")}
            </div>
          ) : listQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border/60 bg-card p-4"
                />
              ))}
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={CalendarClock}
              title={sourceText("No deadlines match")}
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-sm lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status badge */}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          STATUS_BADGE[row.computed_status] ??
                            STATUS_BADGE.upcoming,
                        )}
                      >
                        {row.computed_status.replace("_", " ")}
                      </span>

                      {/* Priority dot + label */}
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            PRIORITY_DOT[row.priority] ?? "bg-slate-400",
                          )}
                        />
                        {row.priority}
                      </span>
                    </div>

                    <h3 className="font-semibold text-foreground">{row.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {row.company_name || "All companies"}
                      {row.owner_name ? ` · ${row.owner_name}` : ""}
                      {" · "}
                      {new Date(row.due_at).toLocaleString()}
                    </p>

                    {/* Per-period history. `due_at` above stays on the period
                        that was just completed until that date passes, so this
                        is what makes "this month is done" legible. */}
                    <DeadlinePeriodTracker deadline={row} />
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {row.status === "completed" ? (
                      <WriteOnly>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreMutation.mutate(row.id)}
                        disabled={restoreMutation.isPending}
                      >
                        <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                        {sourceText("Reopen")}
                      </Button>
                      </WriteOnly>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => completeMutation.mutate(row.id)}
                        disabled={completeMutation.isPending}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {sourceText("Complete")}
                      </Button>
                    )}
                    <TagAction resourceType="deadlines.deadline" targetId={String(row.id)} compact />
                    <WriteOnly>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" title={sourceText("Archive")} onClick={() => archiveMutation.mutate(row.id)} disabled={archiveMutation.isPending}>
                        <Trash2 size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" asChild title={sourceText("Edit")}>
                        <Link href={`/deadlines/${row.id}/edit`}>
                          <Edit size={14} />
                        </Link>
                      </Button>
                    </WriteOnly>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
