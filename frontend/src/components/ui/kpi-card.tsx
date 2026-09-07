"use client";
import { CountUp } from "./count-up";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// KpiCard -- dashboard metric tile with mini sparkline + trend badge
// Inspired by ui.watermelon.sh + 21st.dev stat card patterns
//
// Usage:
//   <KpiCard
//     label={sourceText("Total Employees")}
//     value="142"
//     trend={+5.2}
//     trendLabel="vs last month"
//     sparkline={[28, 35, 31, 40, 38, 45, 52]}
//     icon={<Users className="size-5" />}
//   />
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  label: string;
  value: string | number;
  /**
   * Short explanatory sub-line under the value, for tiles that need to say
   * what the number means rather than how it moved. Independent of `trend`:
   * a tile can have one, both, or neither.
   */
  description?: string;
  /** Change in percent (positive = up, negative = down, null = neutral) */
  trend?: number | null;
  trendLabel?: string;
  /** Optional mini sparkline data (7-14 points) */
  sparkline?: number[];
  icon?: React.ReactNode;
  /** Accent color for the icon bg */
  iconTone?: "primary" | "success" | "warning" | "danger" | "info";
  href?: string;
  isLoading?: boolean;
  className?: string;
}

const toneBg: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
};

function Sparkline({ data, trend }: { data: number[]; trend?: number | null }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`,
    )
    .join(" ");

  const color =
    trend == null || trend === 0
      ? "hsl(var(--muted-foreground))"
      : trend > 0
        ? "hsl(var(--success))"
        : "hsl(var(--danger))";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        points={pts}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendBadge({ trend, label }: { trend: number; label?: string }) {
  const isUp = trend > 0;
  const isNeutral = trend === 0;
  const Icon = isNeutral ? Minus : isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        isNeutral
          ? "bg-muted text-muted-foreground"
          : isUp
            ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
            : "bg-destructive/15 text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(trend).toFixed(1)}%
      {label && <span className="font-normal text-current/70">{label}</span>}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  description,
  trend,
  trendLabel,
  sparkline,
  icon,
  iconTone = "primary",
  href,
  isLoading,
  className,
}: KpiCardProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border gradient-card p-5", className)}>
        <div className="space-y-3">
          <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  const cardBody = (
    <div
      className={cn(
        "rounded-xl border border-border gradient-card p-5",
        "transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
        className,
      )}
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              toneBg[iconTone],
            )}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value row */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="stat-number tabular text-foreground">
          {typeof value === "number" ? <CountUp to={value} duration={1.1} /> : value}
        </p>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} trend={trend} />
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      )}

      {/* Trend badge */}
      {trend != null && (
        <div className="mt-3 flex items-center gap-2">
          <TrendBadge trend={trend} label={trendLabel} />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {cardBody}
      </a>
    );
  }
  return cardBody;
}

// ---------------------------------------------------------------------------
// KpiGrid -- responsive grid of KpiCards
// ---------------------------------------------------------------------------

export interface KpiGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function KpiGrid({ children, columns = 4, className }: KpiGridProps) {
  const colClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <div className={cn("grid gap-4", colClass, className)}>
      {children}
    </div>
  );
}
