"use client";

import { useMemo, useState } from "react";
import { Building2, Loader2, Pencil, Wallet } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import {
  useDailyBudgetHistory,
  useDailyBudgets,
  useUpsertDailyBudget,
} from "@/features/tresorerie/hooks";
import type { BudgetRange, DailyBudgetCard, DailyBudgetHistoryPoint } from "@/features/tresorerie/types";

function BalanceChart({ points }: { points: DailyBudgetHistoryPoint[] }) {
  const values = points
    .map((point) => (point.amount == null ? null : Number(point.amount)))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const minVal = values.length ? Math.min(...values, 0) : 0;
  const maxVal = values.length ? Math.max(...values, 1) : 1;
  const range = maxVal - minVal || 1;
  const W = 640;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const toX = (index: number) =>
    PAD.left + (index / (points.length - 1 || 1)) * chartW;
  const toY = (value: number) =>
    PAD.top + chartH - ((value - minVal) / range) * chartH;

  const segments: { points: string; dashed: boolean }[] = [];
  const coords: { x: number; y: number; dashed: boolean }[] = [];
  points.forEach((point, index) => {
    if (point.amount == null) return;
    coords.push({
      x: toX(index),
      y: toY(Number(point.amount)),
      dashed: Boolean(point.is_carried_over),
    });
  });
  coords.forEach((point, index) => {
    const previous = coords[index - 1];
    if (!previous) return;
    segments.push({
      points: `${previous.x},${previous.y} ${point.x},${point.y}`,
      dashed: point.dashed,
    });
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-label={sourceText("Balance evolution")}
    >
      {[0, 0.5, 1].map((fraction) => {
        const y = PAD.top + chartH * (1 - fraction);
        const label = Math.round(minVal + range * fraction);
        return (
          <g key={fraction}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={PAD.left - 8}
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
              opacity={0.45}
              fontSize={9}
            >
              {label}
            </text>
          </g>
        );
      })}
      {segments.map((segment, index) => (
        <polyline
          key={index}
          points={segment.points}
          fill="none"
          stroke="hsl(197 100% 41%)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={segment.dashed ? "6 5" : undefined}
          opacity={segment.dashed ? 0.55 : 1}
        />
      ))}
    </svg>
  );
}

export default function TresoreriePage() {
  const { data: cards, isLoading, error } = useDailyBudgets();
  const upsert = useUpsertDailyBudget();
  const [range, setRange] = useState<BudgetRange>("7d");
  const [chartCompany, setChartCompany] = useState<string>("");
  const [editing, setEditing] = useState<DailyBudgetCard | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const selectedCompany = chartCompany || cards?.[0]?.company || "";
  const historyQuery = useDailyBudgetHistory(selectedCompany, range);
  const selectedCard = useMemo(
    () => cards?.find((card) => card.company === selectedCompany),
    [cards, selectedCompany],
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(cards || []).map((card) => (
            <Card
              key={card.company}
              className={
                card.is_filled_today
                  ? "border-border/70"
                  : "border-amber-300/80 bg-amber-50/40 dark:bg-amber-950/20"
              }
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{card.company_name}</CardTitle>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {card.amount == null
                        ? sourceText("No amount yet")
                        : formatCurrency(Number(card.amount), "MAD")}
                    </p>
                  </div>
                </div>
                <WriteOnly>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditor(card)}
                    aria-label={sourceText("Save today's budget")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </WriteOnly>
              </CardHeader>
              <CardContent>
                {card.is_filled_today ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    <SourceText source="Mis à jour aujourd'hui" />
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <SourceText source="Identique à hier — non mis à jour" />
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>
            <SourceText source="Balance evolution" />
          </CardTitle>
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={range === "7d" ? "secondary" : "ghost"}
              onClick={() => setRange("7d")}
            >
              {sourceText("7 jours")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={range === "1m" ? "secondary" : "ghost"}
              onClick={() => setRange("1m")}
            >
              {sourceText("1 mois")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={range === "1y" ? "secondary" : "ghost"}
              onClick={() => setRange("1y")}
            >
              {sourceText("1 an")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={range === "all" ? "secondary" : "ghost"}
              onClick={() => setRange("all")}
            >
              {sourceText("Depuis le début")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <BalanceChart points={historyQuery.data || []} />
          )}
          {selectedCard?.company_name ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {selectedCard.company_name}
            </p>
          ) : null}
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
