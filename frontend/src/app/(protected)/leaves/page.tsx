"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, RefreshCw, Loader2, Calendar, CheckCircle2,
  ArrowRight, TrendingUp, History, FileEdit, Search,
  Archive, Eye, RotateCcw, Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { SkeletonTable } from "@/components/ui/page-skeletons";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { leavesApi, Leave, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS, LEAVE_TYPES } from "@/features/leaves/api";
import { cn } from "@/lib/utils";
import { companyDisplayName, companyFieldToApi } from "@/lib/company-scope";
import { useCompanies } from "@/features/personnel/hooks";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi } from "@/features/exports/api";
import { BlurFade } from "@/components/ui/blur-fade";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Stagger, FadeIn } from "@/components/ui/stagger";
import { PulseIndicator } from "@/components/ui/pulse-indicator";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";

// ── Smart tab classification ────────────────────────────────────────────
type TabId = "current" | "soon" | "future" | "past" | "draft" | "all";

const TABS: { id: TabId; labelKey: string; icon: React.ElementType; color: string; pulseColor?: "green" | "amber" | "blue" }[] = [
  { id: "current", labelKey: "Currently on Leave", icon: CheckCircle2, color: "text-emerald-600", pulseColor: "green" },
  { id: "soon",    labelKey: "Starting Soon",       icon: TrendingUp,  color: "text-amber-600",  pulseColor: "amber" },
  { id: "future",  labelKey: "Upcoming",            icon: Calendar,    color: "text-blue-600",   pulseColor: "blue" },
  { id: "past",    labelKey: "Past Leaves",         icon: History,     color: "text-gray-500" },
  { id: "draft",   labelKey: "Drafts",              icon: FileEdit,    color: "text-purple-600" },
  { id: "all",     labelKey: "All",                 icon: ArrowRight,  color: "text-foreground" },
];

function classifyLeave(leave: Leave, today: string): TabId {
  if (leave.status === "draft") return "draft";
  if (leave.status === "cancelled") return "past";
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7Str = in7Days.toISOString().split("T")[0];
  if (leave.end_date <= today) return "past";
  if (leave.start_date <= today && leave.end_date > today) return "current";
  if (leave.start_date > today && leave.start_date <= in7Str) return "soon";
  return "future";
}

function getLeaveTypeLabel(lv: string) {
  return LEAVE_TYPES.find((t) => t.value === lv)?.label ?? lv;
}

export default function LeavesListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("current");
  const [search, setSearch]       = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const companyParam = companyFieldToApi(companyFilter);
  const { data: companies } = useCompanies();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["leaves", "all", companyParam],
    queryFn: () =>
      leavesApi.list(companyParam ? { company: companyParam } : undefined),
    staleTime: 30_000,
  });

  const allLeaves: Leave[] = data?.results ?? [];
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const filtered = useMemo(() => allLeaves.filter((l) => {
    if (typeFilter && l.leave_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (l.personnel_name ?? "").toLowerCase().includes(q) ||
        getLeaveTypeLabel(l.leave_type).toLowerCase().includes(q)
      );
    }
    return true;
  }), [allLeaves, search, typeFilter]);

  const grouped = useMemo(() => {
    const g: Record<TabId, Leave[]> = {
      current: [], soon: [], future: [], past: [], draft: [], all: filtered,
    };
    filtered.forEach((l) => { g[classifyLeave(l, today)].push(l); });
    return g;
  }, [filtered, today]);

  const displayed = grouped[activeTab];

  const statAll      = allLeaves.length;
  const statActive   = grouped.current.length;
  const statUpcoming = grouped.soon.length + grouped.future.length;
  const statDraft    = grouped.draft.length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <BlurFade delay={0}>
        <PageHero
          icon={Calendar}
          eyebrow="HR management"
          title={sourceText("Leave Management")}
          description={sourceText("Track, approve and manage personnel leave requests across all statuses.")}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton
                variant="onHeroOutline"
                filenameStem="leaves_export"
                onExport={(format) => listExportApi("leaves").download({}, format)}
              />
              <WriteOnly>
                <Button variant="onHero" onClick={() => router.push("/leaves/new")}>
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="New Leave" leading trailing />
                </Button>
              </WriteOnly>
            </div>
          }
        />
      </BlurFade>

      {/* Stat strip */}
      <ScrollReveal delay={80}>
        <Stagger className={STAT_CARDS_GRID}>
          <FadeIn><StatCard icon={Calendar}     label={sourceText("Total leaves")}    value={statAll}      tone="primary" /></FadeIn>
          <FadeIn><StatCard icon={CheckCircle2} label={sourceText("Currently active")} value={statActive}   tone="emerald" /></FadeIn>
          <FadeIn><StatCard icon={TrendingUp}   label={sourceText("Upcoming")}         value={statUpcoming} tone="amber" /></FadeIn>
          <FadeIn><StatCard icon={FileEdit}     label={sourceText("Drafts")}           value={statDraft}    tone="rose" /></FadeIn>
        </Stagger>
      </ScrollReveal>

      {/* Table card */}
      <ScrollReveal delay={120}>
        <Card>
          <CardHeader className="pb-4">
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={sourceText("Search by name or type…")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={sourceText("All Leave Types")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=""><SourceText source="All Leave Types" /></SelectItem>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={sourceText("Tout le groupe")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=""><SourceText source="Tout le groupe" /></SelectItem>
                  {(companies ?? []).map((company) => (
                    <SelectItem key={company.id} value={String(company.id)}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-lg"
                onClick={() => refetch()} disabled={isLoading} title={sourceText("Refresh")}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </form>

            {/* ✨ Animated tab strip — spring indicator */}
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = grouped[tab.id].length;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-150",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {isActive && tab.pulseColor && (
                      <PulseIndicator color={tab.pulseColor} size="sm" />
                    )}
                    {!isActive || !tab.pulseColor ? (
                      <Icon className={cn("h-3 w-3", isActive ? "" : tab.color)} />
                    ) : null}
                    <SourceText source={tab.labelKey} />
                    {count > 0 && (
                      <motion.span
                        key={count}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                          isActive ? "bg-white/20" : "bg-muted",
                        )}
                      >
                        {count}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SkeletonTable rows={5} />
                </motion.div>
              ) : displayed.length === 0 ? (
                <motion.div key={`empty-${activeTab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }} className="py-16 text-center">
                  <Calendar className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    <SourceText source="No leave records found." />
                  </p>
                </motion.div>
              ) : (
                <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="overflow-x-auto"><Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead><SourceText source="Personnel" /></TableHead>
                        <TableHead className="hidden xl:table-cell"><SourceText source="Company" /></TableHead>
                        <TableHead className="hidden md:table-cell"><SourceText source="Leave Type" /></TableHead>
                        <TableHead><SourceText source="Dates" /></TableHead>
                        <TableHead className="hidden lg:table-cell"><SourceText source="Duration" /></TableHead>
                        <TableHead><SourceText source="Status" /></TableHead>
                        <TableHead className="hidden lg:table-cell"><SourceText source="Timeline" /></TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayed.map((leave, idx) => {
                        const tab = classifyLeave(leave, today);
                        return (
                          <motion.tr
                            key={leave.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="row-hover group border-b border-border/50 transition-colors hover:bg-accent/30"
                          >
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                {tab === "current" && <PulseIndicator color="green" size="sm" />}
                                {tab === "soon" && <PulseIndicator color="amber" size="sm" />}
                                {leave.personnel_name ?? `#${leave.personnel}`}
                              </span>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                              {companyDisplayName(leave.company_name, sourceText("Tout le groupe"))}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {getLeaveTypeLabel(leave.leave_type)}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="flex flex-col gap-0.5">
                                <span>{leave.start_date}</span>
                                <span className="text-muted-foreground text-xs">→ {leave.end_date}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">
                              {leave.duration_days} <span className="text-muted-foreground text-xs"><SourceText source="days" /></span>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-xs", LEAVE_STATUS_COLORS[leave.status])}>
                                {LEAVE_STATUS_LABELS[leave.status] ?? leave.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {tab === "current" && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" /> <SourceText source="Currently on Leave" />
                                </span>
                              )}
                              {tab === "soon" && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                                  <TrendingUp className="h-3 w-3" /> <SourceText source="Starting Soon" />
                                </span>
                              )}
                              {tab === "past" && <span className="text-xs text-muted-foreground"><SourceText source="Ended" /></span>}
                              {tab === "draft" && <span className="text-xs text-purple-600"><SourceText source="Awaiting approval" /></span>}
                            </TableCell>
                            <TableCell className="text-end">
                              <ExpandingActions
                                actions={[
                                  { label: sourceText("View"),   icon: <Eye size={14} />,      onClick: () => router.push(`/leaves/${leave.id}`) },
                                  { label: sourceText("Edit"),   icon: <FileEdit size={14} />,  onClick: () => router.push(`/leaves/${leave.id}/edit`), permission: "write" as const },
                                  { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => leavesApi.delete(leave.id).then(() => qc.invalidateQueries({ queryKey: ["leaves"] })), variant: "warning" as const, permission: "write" as const },
                                ]}
                              />
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </TableBody>
                  </Table></div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </ScrollReveal>
    </div>
  );
}
