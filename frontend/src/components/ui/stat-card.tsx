import { CountUp } from "./count-up";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tone → background + text colour classes for the icon container */
const TONE_MAP: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  primary: "bg-primary/10 text-primary",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  /** Colour tone for the icon chip — defaults to 'blue' */
  tone?: keyof typeof TONE_MAP | string;
  /** Optional trend indicator: positive = up, negative = down, 0 = flat */
  trend?: number;
  /** Label displayed next to the trend value, e.g. "vs last month" */
  trendLabel?: string;
  /** Show a loading skeleton instead of data */
  loading?: boolean;
  className?: string;
}

/**
 * StatCard — compact metric tile used across dashboard and list pages.
 * Accepts an icon, label, value, optional tone and optional trend.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "blue",
  trend,
  trendLabel,
  loading = false,
  className,
}: StatCardProps) {
  const iconClasses = TONE_MAP[tone] ?? `bg-${tone}-500/10 text-${tone}-600`;

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border gradient-card p-5 shadow-sm",
          className,
        )}
        aria-busy="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="size-11 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  const trendUp = trend !== undefined && trend > 0;
  const trendDown = trend !== undefined && trend < 0;
  const trendFlat = trend !== undefined && trend === 0;
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
  const trendColour = trendUp
    ? "text-[hsl(var(--success))]"
    : trendDown
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border border-border gradient-card p-5 shadow-sm transition-[box-shadow,border-color] duration-200 hover:shadow-md hover:border-primary/20",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Label */}
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
            {label}
          </p>

          {/* Value */}
          <p className="stat-number tabular mt-3 text-foreground">
            {typeof value === "number" ? <CountUp to={value} duration={1.1} /> : value}
          </p>

          {/* Trend row */}
          {trend !== undefined && (
            <div
              className={cn(
                "mt-2 flex items-center gap-1 text-xs font-semibold",
                trendColour,
              )}
            >
              <TrendIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {trendUp && "+"}
                {trend}%
              </span>
              {trendLabel && (
                <span className="font-normal text-muted-foreground">
                  {trendLabel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Icon chip */}
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl",
            iconClasses,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
