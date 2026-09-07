"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  AtSign,
  Bell,
  Briefcase,
  Building2,
  CalendarRange,
  ChevronRight,
  FileText,
  FolderClock,
  Receipt,
  ShieldAlert,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SourceText } from "@/components/i18n/SourceText";
import { ExecutiveOverview } from "@/features/dashboard/components/ExecutiveOverview";
import { DashboardCharts } from "@/features/dashboard/components/DashboardCharts";
import { dashboardApi, type OperationalSnapshot, type UpcomingDeadline } from "@/features/dashboard/api";
import { collaborationApi } from "@/features/collaboration/api";
import { dashboardApi as personnelDashboardApi } from "@/features/personnel/api";
import { useCompanyStatistics } from "@/features/companies/hooks";
import { KpiCard } from "@/components/ui/kpi-card";
import { StaggerList, StaggerItem } from "@/components/ui/stagger-list";
import { Reveal } from "@/components/ui/reveal";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney, useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";
import { getEffectiveRoles } from "@/lib/navigation";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { PulseIndicator } from "@/components/ui/pulse-indicator";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { AnimatedCard } from "@/components/ui/animated-card";
import { GradientCard } from "@/components/ui/gradient-card";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Stagger, FadeIn } from "@/components/ui/stagger";
import { MovingBorder } from "@/components/ui/moving-border";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShineBorder } from "@/components/ui/shine-border";

type ActionTile = {
  href: string;
  title: string;
  description: string;
  value: number;
  icon: typeof Bell;
  tone: string;
  spotlightColor?: string;
};

type QuickLink = {
  href: string;
  title: string;
  description: string;
  icon: typeof Users;
};

function localeTag(locale: "fr" | "en" | "ar") {
  return locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB";
}

function formatDashboardDate(value: string | Date, locale: "fr" | "en" | "ar") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDashboardDateTime(
  value: string | Date | null | undefined,
  locale: "fr" | "en" | "ar",
) {
  if (!value) return sourceText("—");
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDashboardNumber(value: number, locale: "fr" | "en" | "ar") {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

// Animated action tile — replaces the plain Card
function DashboardActionTile({ tile, index }: { tile: ActionTile; index: number }) {
  const { locale } = useExperience();
  const Icon = tile.icon;
  return (
    <AnimatedCard delay={index * 0.06} className="h-full">
      <Link href={tile.href} className="group block h-full">
        <div className="flex h-full items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {tile.title}
            </div>
            <div className="text-3xl font-black tracking-tight tabular-nums text-foreground">
              <NumberTicker value={String(tile.value)} />
            </div>
            <p className="max-w-[24ch] text-sm leading-6 text-muted-foreground">
              {tile.description}
            </p>
          </div>
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${tile.tone}`}
          >
            <Icon className="size-5" />
          </div>
        </div>
      </Link>
    </AnimatedCard>
  );
}

function PulseMetric({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  const { locale } = useExperience();
  return (
    <KpiCard
      label={title}
      value={formatDashboardNumber(value, locale)}
      description={description}
    />
  );
}

function QuickAction({ link, index }: { link: QuickLink; index: number }) {
  const Icon = link.icon;
  return (
    <FadeIn>
      <Link href={link.href} className="group block">
        <div className="flex h-full items-start gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md row-hover">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Icon className="size-5" />
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-foreground transition-colors group-hover:text-primary">
              {link.title}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {link.description}
            </p>
          </div>
          <ChevronRight className="ms-auto mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        </div>
      </Link>
    </FadeIn>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { locale } = useExperience();
  const currentLocale = localeTag(locale);
  const roles = getEffectiveRoles(user);
  const canOperate = roles.some(
    (role) => role === "Administrator" || role === "Assistant",
  );
  const isDirectorOnly =
    roles.length > 0 && roles.every((role) => role === "Director");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const operationalQuery = useQuery({
    queryKey: ["dashboard", "operational"],
    queryFn: () => dashboardApi.operational(),
  });

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => dashboardApi.overview(),
    staleTime: 120000,
  });
  const personnelQuery = useQuery({
    queryKey: ["personnel", "dashboard", selectedMonth],
    queryFn: () => personnelDashboardApi.getSummary(selectedMonth),
    staleTime: 120000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: collaborationApi.unreadCount,
    staleTime: 60000,
  });
  const mentionsQuery = useQuery({
    queryKey: ["mentions", "mine", "active"],
    queryFn: collaborationApi.mentions,
    staleTime: 60000,
  });
  const { data: companyStats } = useCompanyStatistics();

  const monthOptions = useMemo(() => {
    const tag = currentLocale || "fr-MA";
    const now = new Date();
    return Array.from({ length: 18 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      let label = value;
      try {
        label = new Intl.DateTimeFormat(tag, {
          month: "long",
          year: "numeric",
        }).format(date);
      } catch {
        label = value;
      }
      return { value, label };
    });
  }, [currentLocale]);

  const overview = overviewQuery.data;
  const summary = personnelQuery.data;
  const unreadNotifications = notificationsQuery.data?.count ?? 0;
  const activeMentions = (
    mentionsQuery.data?.results ??
    mentionsQuery.data ??
    []
  ).length;
  const pendingReview = overview?.report_status?.pending_review ?? 0;
  const pendingPayroll = summary?.pendingPayments ?? 0;
  const notDeclared = summary?.notDeclared ?? 0;
  const incompleteProfiles = summary?.incomplete ?? 0;
  const recentRecords = overview?.recent_records ?? [];

  const actionTiles: ActionTile[] = [
    {
      href: "/reports",
      title: sourceText("Pending review"),
      description: sourceText("Review reports awaiting validation and publication."),
      value: pendingReview,
      icon: FolderClock,
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      spotlightColor: "rgba(245, 158, 11, 0.15)",
    },
    {
      href: "/notifications",
      title: sourceText("Unread notifications"),
      description: sourceText("Open alerts, mentions and workflow updates requiring acknowledgement."),
      value: unreadNotifications,
      icon: Bell,
      tone: "bg-primary/10 text-primary",
      spotlightColor: "rgba(57, 73, 136, 0.15)",
    },
    {
      href: "/tagged",
      title: sourceText("Tagged for me"),
      description: sourceText("Track active assignments and records that were explicitly routed to you."),
      value: activeMentions,
      icon: AtSign,
      tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      spotlightColor: "rgba(139, 92, 246, 0.15)",
    },
    {
      href: "/personnel/payroll",
      title: sourceText("Pending payroll payments"),
      description: sourceText("Monthly payroll records still waiting for payment completion."),
      value: pendingPayroll,
      icon: FileText,
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      spotlightColor: "rgba(16, 185, 129, 0.15)",
    },
    {
      href: "/personnel/cnss",
      title: sourceText("Pending CNSS actions"),
      description: sourceText("Employees still missing CNSS declaration coverage for operational follow-up."),
      value: notDeclared,
      icon: ShieldAlert,
      tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
      spotlightColor: "rgba(244, 63, 94, 0.15)",
    },
    {
      href: "/personnel/personnel",
      title: sourceText("Incomplete personnel files"),
      description: sourceText("Profiles that still require missing identity, contact or payroll information."),
      value: incompleteProfiles,
      icon: Users,
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      spotlightColor: "rgba(14, 165, 233, 0.15)",
    },
  ];

  const quickLinks: QuickLink[] = canOperate
    ? [
        {
          href: "/personnel/personnel/new",
          title: sourceText("Add Personnel"),
          description: sourceText("Create a new personnel record with the French-first guided workflow."),
          icon: Users,
        },
        {
          href: "/financial-records",
          title: sourceText("Financial Records"),
          description: sourceText("Review ledger-ready documents, posting status and attached evidence."),
          icon: Receipt,
        },
        {
          href: "/reports",
          title: sourceText("Reports Registry"),
          description: sourceText("Follow versions, approvals and ready files for generated reports."),
          icon: FileText,
        },
        {
          href: "/companies",
          title: sourceText("Companies"),
          description: sourceText("Open company workspaces, balances and operational context."),
          icon: Building2,
        },
      ]
    : [
        {
          href: "/reports",
          title: sourceText("Reports Registry"),
          description: sourceText("Review approved reporting outputs and lifecycle status by period."),
          icon: FileText,
        },
        {
          href: "/financial-records",
          title: sourceText("Financial Records"),
          description: sourceText("Inspect posted records, categories and recent accounting movement."),
          icon: Receipt,
        },
        {
          href: "/notifications",
          title: sourceText("Notifications"),
          description: sourceText("Open unread alerts and follow the latest workflow events."),
          icon: Bell,
        },
        {
          href: "/tagged",
          title: sourceText("Tagged for me"),
          description: sourceText("Open assignments that were sent to you for follow-up or validation."),
          icon: AtSign,
        },
      ];

  const primaryActionHref = canOperate ? "/personnel/personnel/new" : "/reports";
  const primaryActionLabel = canOperate ? sourceText("Add Personnel") : sourceText("Reports Registry");

  return (
    <div className="space-y-5">

      {/* ─── Command Header ─── */}
      <BlurFade delay={0}>
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--card))_55%,hsl(var(--accent)/0.28))] shadow-[0_8px_32px_rgba(15,23,42,0.07)]">
          <BorderBeam duration={6} colorFrom="hsl(var(--primary))" colorTo="hsl(197,100%,41%)" width={120} />
          <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
            {/* Left: greeting + actions */}
            <div className="flex flex-col justify-between gap-5 p-5 lg:p-7">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <PulseIndicator color="green" size="sm" />
                    <CalendarRange className="size-3.5" />
                    <SourceText source="Command center" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDashboardDate(new Date(), locale)}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  {user?.full_name
                    ? (<><SourceText source="Good day" />, {user.full_name.split(" ")[0]}.</>)
                    : <SourceText source="Dashboard" />}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  <SourceText source="Operational cockpit for Groupe 3.R.B — finance, payroll, CNSS, notifications and ledger movement." />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MovingBorder duration={2800} borderRadius="0.625rem" containerClassName="rounded-[0.625rem]">
                  <Button asChild size="sm" className="relative z-10">
                    <Link href={primaryActionHref}>
                      {primaryActionLabel}
                      <ArrowRight className="ms-2 size-3.5" />
                    </Link>
                  </Button>
                </MovingBorder>
                <Button asChild variant="outline" size="sm">
                  <Link href="/notifications">
                    <Bell className="me-2 size-3.5" />
                    <SourceText source="Notifications" />
                    {unreadNotifications > 0 && (
                      <span className="ms-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                      </span>
                    )}
                  </Link>
                </Button>
                {isDirectorOnly && (
                  <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
                    <SourceText source="Director view — review &amp; oversight" />
                  </span>
                )}
              </div>
            </div>

            {/* Right: watchlist with animated numbers */}
            <div className="border-t border-border/50 bg-muted/20 p-5 lg:border-s lg:border-t-0 lg:p-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  <SourceText source="Operational watchlist" />
                </p>
                <select
                  id="dashboard-month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label={sourceText("Select a month")}
                >
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: sourceText("Companies"),       value: companyStats?.total_companies ?? 0,  tone: "text-primary" },
                  { label: sourceText("Active employees"), value: summary?.activeEmployees ?? 0,        tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: sourceText("Payroll records"),  value: summary?.monthlyPayroll ?? 0,         tone: "text-brand-blue-600" },
                  { label: sourceText("CNSS declared"),    value: summary?.cnssDeclared ?? 0,          tone: "text-amber-600 dark:text-amber-400" },
                ].map((metric) => (
                  <SpotlightCard key={metric.label} className="rounded-xl border border-border/60 bg-background/70 p-3">
                    <p className={`text-xl font-black tabular-nums ${metric.tone}`}>
                      <NumberTicker value={String(metric.value)} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{metric.label}</p>
                  </SpotlightCard>
                ))}
              </div>
            </div>
          </div>
        </section>
      </BlurFade>

      {/* ─── Action tiles ─── */}
      <BlurFade delay={0.08}>
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              <AnimatedGradientText>
                <SourceText source="Action center" />
              </AnimatedGradientText>
            </h2>
            <p className="text-xs text-muted-foreground">
              <SourceText source="What changed, what is pending and where to go next." />
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {actionTiles.map((tile, i) => (
              <DashboardActionTile key={tile.title} tile={tile} index={i} />
            ))}
          </div>
        </section>
      </BlurFade>

      {/* ─── Operational snapshot ─── */}
      <ScrollReveal delay={100}>
        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-foreground">
              <AnimatedGradientText>
                <SourceText source="Operational snapshot" />
              </AnimatedGradientText>
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {/* Headcount */}
            <SpotlightCard className="rounded-2xl border border-border/70 bg-card/80 p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <p className="text-sm font-semibold"><SourceText source="Personnel headcount" /></p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 pb-4 px-2">
                <div className="pe-3 text-center">
                  <p className="text-2xl font-black tabular-nums"><NumberTicker value={String(operationalQuery.data?.headcount?.total ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Total" /></p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400"><NumberTicker value={String(operationalQuery.data?.headcount?.active ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Active" /></p>
                </div>
                <div className="ps-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400"><NumberTicker value={String(operationalQuery.data?.headcount?.on_leave ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="On leave" /></p>
                </div>
              </div>
            </SpotlightCard>
            {/* Deadline watch */}
            <SpotlightCard className="rounded-2xl border border-border/70 bg-card/80 p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <CalendarRange className="size-4 text-primary" />
                <p className="text-sm font-semibold"><SourceText source="Deadline watch" /></p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/50 pb-4 px-2">
                <div className="pe-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-destructive"><NumberTicker value={String(operationalQuery.data?.deadlines_count?.overdue ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Overdue" /></p>
                </div>
                <div className="ps-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400"><NumberTicker value={String(operationalQuery.data?.deadlines_count?.this_week ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="This week" /></p>
                </div>
              </div>
            </SpotlightCard>
            {/* Transfers */}
            <SpotlightCard className="rounded-2xl border border-border/70 bg-card/80 p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <ArrowLeftRight className="size-4 text-primary" />
                <p className="text-sm font-semibold"><SourceText source="Transfers" /></p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 pb-4 px-2">
                <div className="pe-3 text-center">
                  <p className="text-2xl font-black tabular-nums"><NumberTicker value={String(operationalQuery.data?.transfers_summary?.total ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Total" /></p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-primary"><NumberTicker value={String(operationalQuery.data?.transfers_summary?.confirmed ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Confirmed" /></p>
                </div>
                <div className="ps-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-muted-foreground"><NumberTicker value={String(operationalQuery.data?.transfers_summary?.draft ?? 0)} /></p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><SourceText source="Draft" /></p>
                </div>
              </div>
            </SpotlightCard>
          </div>
        </section>
      </ScrollReveal>

      {/* ─── Upcoming deadlines ─── */}
      {(operationalQuery.data?.upcoming_deadlines?.length ?? 0) > 0 && (
        <Reveal delay={0.05}>
          <section>
            <ScrollReveal>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                <AnimatedGradientText><SourceText source="Next 14 days" /></AnimatedGradientText>
              </h2>
            </ScrollReveal>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80">
              {operationalQuery.data?.upcoming_deadlines?.map((dl: UpcomingDeadline, index: number) => (
                <Link
                  key={dl.id}
                  href={`/deadlines/${dl.id}/edit`}
                  className={[
                    "flex items-center justify-between gap-4 px-5 py-3.5",
                    "row-hover transition-colors hover:bg-accent/40",
                    index > 0 ? "border-t border-border/50" : "",
                  ].join(" ")}
                >
                  <span className="font-medium text-sm text-foreground">{dl.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{dl.due_date}</span>
                    <span className={[
                      "text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      dl.priority === "high" ? "bg-destructive/10 text-destructive" :
                      dl.priority === "medium" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                      "bg-muted text-muted-foreground",
                    ].join(" ")}>{dl.priority}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ─── Financial Charts ─── */}
      <Reveal>
        <section aria-labelledby="charts-heading" className="space-y-3">
          <ScrollReveal>
            <h2 id="charts-heading" className="text-sm font-semibold text-muted-foreground">
              <AnimatedGradientText>{sourceText("Financial Overview")}</AnimatedGradientText>
            </h2>
          </ScrollReveal>
          <DashboardCharts />
        </section>
      </Reveal>

      <ExecutiveOverview />

      {/* ─── Recent records + Quick actions ─── */}
      <Reveal delay={0.08}>
        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Recent financial records */}
          <ShineBorder className="rounded-2xl">
            <Card className="border-0 shadow-none rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  <AnimatedGradientText><SourceText source="Recent financial records" /></AnimatedGradientText>
                </CardTitle>
                <CardDescription>
                  <SourceText source="Latest posted records from the ledger API." />
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overviewQuery.isError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
                    <SourceText source="Failed to load records. Please refresh." />
                  </div>
                ) : overviewQuery.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3.5 animate-pulse">
                        <div className="size-8 shrink-0 rounded-lg bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-36 rounded bg-muted" />
                          <div className="h-2.5 w-24 rounded bg-muted/60" />
                        </div>
                        <div className="h-5 w-16 rounded-full bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : recentRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center">
                    <Receipt className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      <SourceText source="No recent financial records to display yet." />
                    </p>
                  </div>
                ) : (
                  <Stagger className="space-y-2">
                    {recentRecords.map((record) => (
                      <FadeIn key={record.id}>
                        <Link
                          href={`/financial-records/${record.id}`}
                          className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3.5 row-hover transition hover:border-primary/20 hover:bg-accent/30"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="truncate font-semibold text-sm text-foreground">{record.reference}</div>
                            <div className="text-xs text-muted-foreground">
                              {record.company_name}{record.record_type_name ? ` · ${record.record_type_name}` : ""}
                            </div>
                          </div>
                          <div className="text-end space-y-0.5">
                            <div className="text-sm font-bold tabular-nums text-foreground">
                              {formatMoney(record.total_amount, record.currency, locale)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDashboardDate(record.record_date, locale)}
                            </div>
                          </div>
                        </Link>
                      </FadeIn>
                    ))}
                  </Stagger>
                )}
              </CardContent>
            </Card>
          </ShineBorder>

          {/* Quick actions */}
          <div className="space-y-2">
            <ScrollReveal>
              <div className="mb-1">
                <h2 className="text-base font-semibold text-foreground">
                  <AnimatedGradientText><SourceText source="Quick actions" /></AnimatedGradientText>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <SourceText source="Role-specific deep links for your current workflow." />
                </p>
              </div>
            </ScrollReveal>
            <Stagger className="grid gap-2">
              {quickLinks.map((link, i) => (
                <QuickAction key={link.href} link={link} index={i} />
              ))}
            </Stagger>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
