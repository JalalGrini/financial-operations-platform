"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ScheduleDate } from "@/components/ui/schedule-date";

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const label =
    from || to
      ? `${formatIso(from) || "…"} – ${formatIso(to) || "…"}`
      : sourceText("Date range");

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 max-w-[11rem] items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:border-primary/50"
        aria-label={sourceText("Date range")}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="absolute z-50 mt-1.5 w-72 space-y-3 rounded-2xl border border-border bg-popover p-4 shadow-2xl"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
