"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDate,
  formatMoney,
  useExperience,
  type Locale,
} from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";
import { dashboardApi, type CurrencyAmountMap } from "../api";

function amount(value: number | null, currency: string, locale: Locale) {
  if (value === null) return "—";
  try {
    return formatMoney(value, currency, locale);
  } catch {
    return `${value.toLocaleString(locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB")} ${currency}`;
  }
}
function month(value: string, locale: Locale) {
  const normalized = /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T12:00:00`
    : value;
  try {
    return formatDate(normalized, locale, { month: "short" });
  } catch {
    return value;
  }
}
function exact(map: CurrencyAmountMap | undefined, currency: string) {
  const raw = map?.[currency];
  const value = raw === undefined ? 0 : Number.parseFloat(raw);
  return Number.isNaN(value) ? 0 : value;
}

const reportStatusLabels: Record<string, string> = {
  approved: sourceText("Approved"),
  pending_review: sourceText("Pending review"),
  rejected: sourceText("Rejected"),
  outdated: sourceText("Outdated"),
  preview: sourceText("Preview"),
  draft: sourceText("Draft"),
};

function Kpi({
  title,
  map,
  tone,
  locale,
}: {
  title: string;
  map?: CurrencyAmountMap;
  tone: "up" | "down" | "net";
  locale: Locale;
}) {
  const Icon =
    tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : Scale;
  const tones = {
    up: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    down: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    net: "bg-primary/10 text-primary",
  } as const;
  const entries = Object.entries(map || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-semibold leading-5 text-muted-foreground">
            {title}
          </p>
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              tones[tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        {entries.length ? (
          <div className="space-y-1.5">
            {entries.map(([currency, raw]) => {
              const value = Number.parseFloat(raw);
              return (
                <div
                  key={currency}
                  className="break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl"
                >
                  {amount(Number.isNaN(value) ? null : value, currency, locale)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-2xl font-bold">—</div>
        )}
        <p className="mt-auto text-xs leading-5 text-muted-foreground">
          <SourceText source="Amounts remain separated by currency." />
        </p>
      </CardContent>
    </Card>
  );
}
function Skeleton() {
  return (
    <Card className="h-40" aria-hidden="true">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex justify-between">
          <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
          <div className="size-10 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-7 w-36 animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}

export function ExecutiveOverview() {
  const { locale } = useExperience();
  const kpiQuery = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => dashboardApi.kpis(),
    staleTime: 120000,
  });
  const chartQuery = useQuery({
    queryKey: ["dashboard", "charts", 12],
    queryFn: () => dashboardApi.charts({ months: 12 }),
    staleTime: 120000,
  });
  const points = chartQuery.data?.monthly_cash_flow || [];
  const currencies = Array.from(
    new Set(
      points.flatMap((point) => [
        ...Object.keys(point.income),
        ...Object.keys(point.expense),
      ]),
    ),
  ).sort();
  const statuses = kpiQuery.data?.report_status || {};
  const retry = () =>
    void Promise.all([kpiQuery.refetch(), chartQuery.refetch()]);
  return (
    <section className="space-y-4" aria-labelledby="financial-overview-title">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="size-4" />
        </span>
        <h2 id="financial-overview-title" className="text-lg font-semibold">
          <SourceText source="Financial Overview" />
        </h2>
      </div>
      {(kpiQuery.isError || chartQuery.isError) && (
        <Alert variant="destructive" className="bg-destructive/5">
          <AlertCircle className="size-4" />
          <AlertTitle>
            <SourceText source="Unable to load financial overview." />
          </AlertTitle>
          <AlertDescription className="mt-3">
            <Button variant="outline" size="sm" onClick={retry}>
              <RefreshCw className="size-4" />
              <SourceText source="Try again" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className={cn("grid gap-4 grid-cols-2 md:grid-cols-4")}>
        {kpiQuery.isLoading ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          <>
            <Kpi
              title={sourceText("Revenue (posted records)")}
              map={kpiQuery.data?.revenue}
              tone="up"
              locale={locale}
            />
            <Kpi
              title={sourceText("Expenses (posted records)")}
              map={kpiQuery.data?.expenses}
              tone="down"
              locale={locale}
            />
            <Kpi
              title={sourceText("Net")}
              map={kpiQuery.data?.net}
              tone="net"
              locale={locale}
            />
          </>
        )}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              <SourceText source="Monthly Cash Flow (12 months)" />
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            {chartQuery.isLoading ? (
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            ) : currencies.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-muted/20 px-4 text-center">
                <p className="max-w-md text-sm leading-6 text-muted-foreground">
                  <SourceText source="No posted financial records yet — create and post records to see cash flow." />
                </p>
              </div>
            ) : (
              <div className="space-y-7">
                {currencies.map((currency) => {
                  const series = points.map((point) => ({
                    month: point.month,
                    income: exact(point.income, currency),
                    expense: exact(point.expense, currency),
                  }));
                  const max = Math.max(
                    1,
                    ...series.flatMap((p) => [p.income, p.expense]),
                  );
                  return (
                    <div key={currency} className="min-w-0">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {currency}
                      </p>
                      <div className="efop-table-scroll overflow-x-auto pb-2">
                        <div className="flex h-44 min-w-max items-end gap-2 sm:gap-3">
                          {series.map((point) => (
                            <div
                              key={`${currency}-${point.month}`}
                              className="flex w-10 shrink-0 flex-col items-center gap-2 sm:w-12"
                            >
                              <div className="flex h-32 w-full items-end justify-center gap-1 rounded-lg bg-muted/25 px-1 pt-2">
                                <div
                                  className="w-2.5 rounded-t bg-emerald-500 transition-[height] duration-500 motion-reduce:transition-none sm:w-3"
                                  style={{
                                    height: `${Math.max(3, (point.income / max) * 100)}%`,
                                  }}
                                  title={`${sourceText("Income")}: ${amount(point.income, currency, locale)}`}
                                />
                                <div
                                  className="w-2.5 rounded-t bg-rose-500 transition-[height] duration-500 motion-reduce:transition-none sm:w-3"
                                  style={{
                                    height: `${Math.max(3, (point.expense / max) * 100)}%`,
                                  }}
                                  title={`${sourceText("Expenses")}: ${amount(point.expense, currency, locale)}`}
                                />
                              </div>
                              <span className="text-[0.6875rem] font-medium text-muted-foreground">
                                {month(point.month, locale)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-emerald-500" />
                <SourceText source="Income" />
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-rose-500" />
                <SourceText source="Expenses" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              <SourceText source="Reports by Status" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpiQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-10 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : Object.keys(statuses).length === 0 ? (
              <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-muted/20 px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  <SourceText source="No reports generated yet." />
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(statuses).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex min-h-11 items-center justify-between gap-4 rounded-xl bg-muted/45 px-3.5 py-2.5"
                  >
                    <span className="text-sm font-medium capitalize">
                      {reportStatusLabels[status] || status}
                    </span>
                    <span className="rounded-lg bg-background px-2.5 py-1 text-sm font-bold tabular-nums shadow-sm ring-1 ring-border/70">
                      {count.toLocaleString(
                        locale === "ar"
                          ? "ar-MA"
                          : locale === "fr"
                            ? "fr-MA"
                            : "en-GB",
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
