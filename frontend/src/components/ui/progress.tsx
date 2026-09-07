import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Progress -- animated progress bar
// Inspired by shadcnblocks.com + 21st.dev progress patterns
// ---------------------------------------------------------------------------

export interface ProgressProps {
  /** 0-100 */
  value?: number;
  /** Color tone */
  tone?: "primary" | "success" | "warning" | "danger";
  /** Show percentage label */
  showLabel?: boolean;
  /** Bar height */
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
  label?: string;
}

const toneBar: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const sizeH: Record<string, string> = {
  xs: "h-1",
  sm: "h-1.5",
  default: "h-2.5",
  lg: "h-4",
};

export function Progress({
  value = 0,
  tone = "primary",
  showLabel = false,
  size = "default",
  className,
  label,
}: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("w-full", className)}>
      {(label || showLabel) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && (
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          )}
          {showLabel && (
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {clamped.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          sizeH[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            toneBar[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressRing -- circular SVG progress indicator
// ---------------------------------------------------------------------------

export interface ProgressRingProps {
  value?: number;
  size?: number;
  strokeWidth?: number;
  tone?: "primary" | "success" | "warning" | "danger";
  showLabel?: boolean;
  className?: string;
}

export function ProgressRing({
  value = 0,
  size = 56,
  strokeWidth = 5,
  tone = "primary",
  showLabel = true,
  className,
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor = {
    primary: "hsl(var(--primary))",
    success: "hsl(var(--success))",
    warning: "hsl(var(--warning))",
    danger: "hsl(var(--danger))",
  }[tone];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <span
          className="absolute text-xs font-semibold tabular-nums text-foreground"
          aria-hidden="true"
        >
          {clamped.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
