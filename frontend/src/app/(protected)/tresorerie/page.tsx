"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, Loader2, Pencil, Wallet } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminOnly, WriteOnly } from "@/components/auth/WriteOnly";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { formatCurrency } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { BalanceChart, Sparkline } from "@/features/tresorerie/BalanceChart";
import {
  useDailyBudgetHistory,
  useDailyBudgetSparklines,
  useDailyBudgets,
  useUpsertDailyBudget,
} from "@/features/tresorerie/hooks";
import type { BudgetRange, DailyBudgetCard, DailyBudgetHistoryPoint } from "@/features/tresorerie/types";

const RANGES: BudgetRange[] = ["7d", "1m", "1y", "all"];

function rangeLabel(range: BudgetRange) {
  if (range === "7d") return sourceText("7 jours");
  if (range === "1m") return sourceText("1 mois");
  if (range === "1y") return sourceText("1 an");
  return sourceText("Depuis le début");
}

function signedTone(value: number) {
  if (value === 0) return "text-muted-foreground";
  if (Math.sign(value) === 1) return "text-emerald-700 dark:text-emerald-400";
  return "text-destructive";
}

function isGain(value: number) {
  return Math.sign(value) === 1;
}

function numericAmount(point: DailyBudgetHistoryPoint) {
  if (point.amount == null || point.amount === "") return null;
  const value = Number(point.amount);
  return Number.isFinite(value) ? value : null;
}

function periodStats(points: DailyBudgetHistoryPoint[]) {
  const values = points
    .map(numericAmount)
    .filter((value): value is number => value != null);
  if (!values.length) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return {
    current: last,
    change: last - first,
    high: Math.max(...values),
    low: Math.min(...values),
  };
}

function yesterdayDelta(points: DailyBudgetHistoryPoint[] | undefined, todayAmount: number | null) {
  if (todayAmount == null || !points?.length) return null;
  const filled = points
    .map(numericAmount)
    .filter((value): value is number => value != null);
  if (filled.length < 2) return null;
  return todayAmount - filled[filled.length - 2];
}

export default function TresoreriePage() {
  const { data: cards, isLoading, error } = useDailyBudgets();
  const upsert = useUpsertDailyBudget();
  const [range, setRange] = useState<BudgetRange>("1y");
  const [chartCompany, setChartCompany] = useState<string>("");
  const [editing, setEditing] = useState<DailyBudgetCard | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const companyIds = useMemo(
    () => (cards || []).map((card) => card.company),
    [cards],
  );
  const sparkQueries = useDailyBudgetSparklines(companyIds);
  const selectedCompany = chartCompany || cards?.[0]?.company || "";
  const historyQuery = useDailyBudgetHistory(selectedCompany, range);
  const selectedCard = useMemo(
    () => cards?.find((card) => card.company === selectedCompany),
    [cards, selectedCompany],
  );
  const stats = useMemo(
    () => periodStats(historyQuery.data || []),
    [historyQuery.data],
  );

  const openEditor = (card: DailyBudgetCard) => {
    setEditing(card);
    setAmount(card.amount && card.is_filled_today ? String(card.amount) : "");
    setNote(card.is_filled_today ? card.note || "" : "");
  };

  const saveToday = async () => {
    if (!editing) return;
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      toast.error(sourceText("Amount"));
      return;
    }
    try {
      await upsert.mutateAsync({
        company: editing.company,
        amount: parsed,
        note,
      });
      toast.success(sourceText("Save today's budget"));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sourceText("Export failed"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        icon={Wallet}
        eyebrow={sourceText("Trésorerie")}
        title={sourceText("Trésorerie")}
        description={sourceText("Daily bank balances")}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(cards || []).map((card, index) => {
            const todayValue = card.amount == null ? null : Number(card.amount);
            const delta = yesterdayDelta(sparkQueries[index]?.data, todayValue);
            return (
              <Card
                key={card.company}
                padding="sm"
                className={cn(
                  "cursor-pointer transition-shadow hover:shadow-md",
                  selectedCompany === card.company
                    ? "ring-2 ring-primary/40"
                    : "border-border/70",
                  !card.is_filled_today && "bg-amber-50/40 dark:bg-amber-950/20",
                )}
                role="button"
                tabIndex={0}
                onClick={() => setChartCompany(card.company)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setChartCompany(card.company);
                  }
                }}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{card.company_name}</CardTitle>
                      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                        {todayValue == null
                          ? sourceText("No amount yet")
                          : formatCurrency(todayValue, "MAD")}
                      </p>
                    </div>
                  </div>
                  <WriteOnly>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditor(card);
                      }}
                      aria-label={sourceText("Save today's budget")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </WriteOnly>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Sparkline points={sparkQueries[index]?.data || []} />
                  <div className="flex flex-wrap items-center gap-2">
                    {card.is_filled_today ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        <SourceText source="Mis à jour aujourd'hui" />
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        <SourceText source="Identique à hier — non mis à jour" />
                      </Badge>
                    )}
                    {delta != null ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          signedTone(delta),
                        )}
                      >
                        {isGain(delta) ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )}
                        {formatCurrency(delta, "MAD")} {sourceText("vs yesterday")}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>
                <SourceText source="Balance evolution" />
              </CardTitle>
              {selectedCard?.company_name ? (
                <p className="mt-1 text-sm text-muted-foreground">{selectedCard.company_name}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {RANGES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={range === item ? "secondary" : "ghost"}
                  onClick={() => setRange(item)}
                >
                  {rangeLabel(item)}
                </Button>
              ))}
            </div>
          </div>
          {(cards || []).length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {(cards || []).map((card) => (
                <Button
                  key={card.company}
                  type="button"
                  size="sm"
                  variant={selectedCompany === card.company ? "primary" : "outline"}
                  onClick={() => setChartCompany(card.company)}
                >
                  {card.company_name}
                </Button>
              ))}
            </div>
          ) : null}
          {stats ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
                  {sourceText("Current")}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(stats.current, "MAD")}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
                  {sourceText("Period change")}
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold tabular-nums",
                    signedTone(stats.change),
                  )}
                >
                  {isGain(stats.change) ? "+" : ""}
                  {formatCurrency(stats.change, "MAD")}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
                  {sourceText("High")}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(stats.high, "MAD")}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
                  {sourceText("Low")}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(stats.low, "MAD")}
                </p>
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="flex h-[280px] justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <BalanceChart points={historyQuery.data || []} range={range} />
          )}
        </CardContent>
      </Card>

      <AdminOnly>
        <p className="text-xs text-muted-foreground">
          <SourceText source="Only admins can edit a past day's entry" />
        </p>
      </AdminOnly>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {editing?.company_name} — {sourceText("Save today's budget")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="today-amount">
                <SourceText source="Amount (MAD)" />
              </Label>
              <Input
                id="today-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="today-note">
                <SourceText source="Optional note" />
              </Label>
              <Textarea
                id="today-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              <SourceText source="Cancel" />
            </Button>
            <Button onClick={() => void saveToday()} disabled={upsert.isPending}>
              {upsert.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SourceText source="Save" />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
