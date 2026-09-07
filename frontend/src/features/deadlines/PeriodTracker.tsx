"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deadline, DeadlineOccurrence } from "./types";

/** How many period ticks to draw. A year of monthly fits comfortably inline. */
const VISIBLE_PERIODS = 12;

const PERIOD_NOUN: Record<Deadline["period_type"], string> = {
  one_time: "occurrence",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
  custom: "cycle",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function PeriodTick({ occurrence }: { occurrence: DeadlineOccurrence }) {
  const done = occurrence.is_completed;
  return (
    <span
      // The label carries the period, its due date and its state, so the strip
      // is readable without colour alone (the tick/dash glyph differs too).
      title={`${occurrence.period_label} · due ${formatDate(occurrence.due_at)} · ${
        done ? "completed" : "not completed"
      }`}
      aria-label={`${occurrence.period_label}: ${done ? "completed" : "not completed"}`}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md border px-1 text-[10px] font-semibold",
        done
          ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {done ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Minus className="h-3 w-3" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * Per-period completion history for a recurring deadline.
 *
 * Exists because `due_at` alone cannot answer "was this month done?". The
 * platform deliberately keeps `due_at` on the period you just completed until
 * that date passes, so the strip below is what distinguishes "this month is
 * handled, the date is simply still in the future" from "nothing has been done".
 */
export function DeadlinePeriodTracker({
  deadline,
  className,
}: {
  deadline: Deadline;
  className?: string;
}) {
  if (!deadline.is_recurring) return null;

  const noun = PERIOD_NOUN[deadline.period_type] ?? "period";
  // The API sends newest first; render oldest-to-newest so the strip reads
  // left to right like a timeline.
  const ticks = [...deadline.occurrences].slice(0, VISIBLE_PERIODS).reverse();
  const total = deadline.completed_periods_count;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
            deadline.is_current_period_completed
              ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/40 bg-amber-500/12 text-amber-600 dark:text-amber-400",
          )}
        >
          {deadline.current_period_label}
          {deadline.is_current_period_completed ? " done" : " pending"}
        </span>

        <span className="text-muted-foreground">
          {total} {noun}
          {total === 1 ? "" : "s"} completed
        </span>

        {deadline.is_current_period_completed && deadline.next_due_at && (
          <span className="text-muted-foreground">
            · next {noun} due {formatDate(deadline.next_due_at)}
          </span>
        )}
      </div>

      {ticks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {ticks.map((occurrence) => (
            <PeriodTick key={occurrence.id} occurrence={occurrence} />
          ))}
        </div>
      )}
    </div>
  );
}
