"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/design-system";
import { useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";
import type { BudgetRange, DailyBudgetHistoryPoint } from "./types";

const WIDTH = 960;
const HEIGHT = 280;
const PAD = { top: 16, right: 16, bottom: 44, left: 58 };

function localeTag(locale: string) {
  if (locale === "ar") return "ar-MA";
  if (locale === "en") return "en-GB";
  return "fr-MA";
}

function parseDay(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function numericAmount(point: DailyBudgetHistoryPoint) {
  if (point.amount == null || point.amount === "") return null;
  const value = Number(point.amount);
  return Number.isFinite(value) ? value : null;
}

function tickIndices(count: number, range: BudgetRange, points: DailyBudgetHistoryPoint[]) {
  if (count <= 1) return [0];
  if (range === "7d") return Array.from({ length: count }, (_, index) => index);
  if (range === "1m") {
    const step = Math.max(1, Math.ceil((count - 1) / 6));
    const ticks = [0];
    for (let index = step; index < count - 1; index += step) ticks.push(index);
    ticks.push(count - 1);
    return [...new Set(ticks)];
  }
  const ticks: number[] = [];
  let lastMonth = "";
  points.forEach((point, index) => {
    const month = point.date.slice(0, 7);
    if (month !== lastMonth) {
      ticks.push(index);
      lastMonth = month;
    }
  });
  if (ticks[0] !== 0) ticks.unshift(0);
  const lastIdx = count - 1;
  if (ticks[ticks.length - 1] !== lastIdx) {
    const lastMonth = points[lastIdx]?.date.slice(0, 7);
    const previous = points[ticks[ticks.length - 1]]?.date.slice(0, 7);
    if (lastMonth !== previous) ticks.push(lastIdx);
  }
  return ticks;
}

function formatTick(iso: string, range: BudgetRange, locale: string) {
  const date = parseDay(iso);
  const tag = localeTag(locale);
  if (range === "7d") {
    return new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric" }).format(date);
  }
  if (range === "1m") {
    return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit" }).format(date);
}

function formatFullDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDay(iso));
}

function compactAxis(value: number, locale: string) {
  return new Intl.NumberFormat(localeTag(locale), {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}

function buildAreaPath(
  coords: Array<{ x: number; y: number }>,
  baselineY: number,
) {
  if (!coords.length) return "";
  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  return `${line} L${last.x.toFixed(2)},${baselineY} L${first.x.toFixed(2)},${baselineY} Z`;
}

export function BalanceChart({
  points,
  range,
}: {
  points: DailyBudgetHistoryPoint[];
  range: BudgetRange;
}) {
  const { locale } = useExperience();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = `treasuryFill-${useId().replace(/:/g, "")}`;

  const chart = useMemo(() => {
    const values = points
      .map(numericAmount)
      .filter((value): value is number => value != null);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 1;
    const pad = Math.max((maxVal - minVal) * 0.08, maxVal === minVal ? Math.abs(maxVal) * 0.05 || 1 : 0);
    const yMin = minVal - pad;
    const yMax = maxVal + pad;
    const yRange = yMax - yMin || 1;
    const chartW = WIDTH - PAD.left - PAD.right;
    const chartH = HEIGHT - PAD.top - PAD.bottom;
    const toX = (index: number) =>
      PAD.left + (index / Math.max(points.length - 1, 1)) * chartW;
    const toY = (value: number) =>
      PAD.top + chartH - ((value - yMin) / yRange) * chartH;
    const coords = points.map((point, index) => {
      const amount = numericAmount(point);
      return {
        index,
        x: toX(index),
        y: amount == null ? null : toY(amount),
        amount,
        date: point.date,
        carried: Boolean(point.is_carried_over),
      };
    });
    const drawn = coords.filter(
      (point): point is typeof point & { y: number; amount: number } =>
        point.y != null && point.amount != null,
    );
    const baselineY = PAD.top + chartH;
    const area = buildAreaPath(
      drawn.map((point) => ({ x: point.x, y: point.y })),
      baselineY,
    );
    const line = drawn
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");
    return {
      yMin,
      yMax,
      yRange,
      chartW,
      chartH,
      coords,
      drawn,
      area,
      line,
      ticks: tickIndices(points.length, range, points),
    };
  }, [points, range]);

  const active = hover != null ? chart.coords[hover] : chart.coords[chart.coords.length - 1];

  const onMove = (event: { clientX: number }) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    chart.coords.forEach((point) => {
      const distance = Math.abs(point.x - x);
      if (distance < best) {
        best = distance;
        nearest = point.index;
      }
    });
    setHover(nearest);
  };

  if (!points.length || !chart.drawn.length) {
    return (
      <div className="grid h-[280px] place-items-center text-sm text-muted-foreground">
        {sourceText("No history yet")}
      </div>
    );
  }

  return (
    <div dir="ltr">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[240px] w-full touch-pan-y sm:h-[280px]"
        role="img"
        aria-label={sourceText("Balance evolution")}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(197 100% 41%)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(197 100% 41%)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PAD.top + chart.chartH * (1 - fraction);
          const label = chart.yMin + chart.yRange * fraction;
          return (
            <g key={fraction}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeDasharray="4 6"
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                fill="currentColor"
                opacity={0.62}
                fontSize={11}
              >
                {compactAxis(label, locale)}
              </text>
            </g>
          );
        })}
        {chart.area ? <path d={chart.area} fill={`url(#${gradientId})`} /> : null}
        {chart.line ? (
          <path
            d={chart.line}
            fill="none"
            stroke="hsl(197 100% 41%)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {chart.ticks.map((index) => {
          const point = chart.coords[index];
          if (!point) return null;
          return (
            <g key={`tick-${point.date}`}>
              <line
                x1={point.x}
                x2={point.x}
                y1={PAD.top + chart.chartH}
                y2={PAD.top + chart.chartH + 5}
                stroke="currentColor"
                strokeOpacity={0.25}
              />
              <text
                x={point.x}
                y={HEIGHT - 14}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.72}
                fontSize={11}
              >
                {formatTick(point.date, range, locale)}
              </text>
            </g>
          );
        })}
        {active?.y != null ? (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={PAD.top + chart.chartH}
              stroke="hsl(197 100% 41%)"
              strokeOpacity={0.35}
              strokeDasharray="3 4"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r={4.5}
              fill="hsl(var(--background))"
              stroke="hsl(197 100% 41%)"
              strokeWidth={2}
            />
          </>
        ) : null}
      </svg>
      {active?.amount != null ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-sm">
          <span className="font-medium text-foreground">{formatFullDate(active.date, locale)}</span>
          <span className="font-semibold tabular-nums">{formatCurrency(active.amount, "MAD")}</span>
          {active.carried ? (
            <span className="text-xs text-muted-foreground">{sourceText("Carried over")}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Sparkline({ points }: { points: DailyBudgetHistoryPoint[] }) {
  const values = points
    .map(numericAmount)
    .filter((value): value is number => value != null);
  if (values.length < 2) {
    return <div className="h-10 w-full" />;
  }
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || 1;
  const w = 120;
  const h = 40;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = 4 + (h - 8) - ((value - minVal) / span) * (h - 8);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full text-primary" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
