"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { Popover } from "@/components/ui/popover";

interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}

function formatIso(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: DateRangePickerProps) {
  const label =
    from || to
      ? `${formatIso(from) || "…"} – ${formatIso(to) || "…"}`
      : sourceText("Date range");

  return (
    <Popover
      width={288}
      align="start"
      className="space-y-3 p-4"
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-10 max-w-[11rem] items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:border-primary/50",
            className,
          )}
          aria-label={sourceText("Date range")}
        >
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </button>
      }
    >
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {sourceText("From")}
        </p>
        <ScheduleDate value={from} onChange={onFromChange} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {sourceText("To")}
        </p>
        <ScheduleDate value={to} onChange={onToChange} />
      </div>
    </Popover>
  );
}
