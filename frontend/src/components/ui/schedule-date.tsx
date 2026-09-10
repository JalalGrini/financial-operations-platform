"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, X } from "lucide-react";
import { format, setYear, setMonth, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { sourceText } from "@/lib/i18n/source-catalog";

const PANEL_GAP = 6;
const PANEL_MIN_WIDTH = 280;

interface ScheduleDateProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const YEARS = Array.from(
  { length: 90 },
  (_, i) => new Date().getFullYear() + 10 - i,
);

function toISO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fromISO(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(d: Date | null): string {
  if (!d) return "";
  return format(d, "dd/MM/yyyy");
}

function MonthGrid({
  viewDate,
  selected,
  onSelect,
  onPrev,
  onNext,
  onGoToMonth,
  showPrev,
  showNext,
  min,
  max,
}: {
  viewDate: Date;
  selected: Date | null;
  onSelect: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  onGoToMonth: (d: Date) => void;
  showPrev: boolean;
  showNext: boolean;
  min?: Date | null;
  max?: Date | null;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="min-w-[240px] flex-1">
      <div className="mb-3 flex items-center justify-between gap-1">
        {showPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft size={15} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="w-7" />
        )}
        <div className="flex items-center gap-1">
          <select
            value={String(month)}
            onChange={(event) =>
              onGoToMonth(setMonth(viewDate, Number(event.target.value)))
            }
            className="h-7 w-[110px] rounded-md border border-input bg-background px-1 text-xs"
            aria-label={sourceText("Month")}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i)}>
                {sourceText(name)}
              </option>
            ))}
          </select>
          <select
            value={String(year)}
            onChange={(event) =>
              onGoToMonth(setYear(viewDate, Number(event.target.value)))
            }
            className="h-7 w-[80px] rounded-md border border-input bg-background px-1 text-xs"
            aria-label={sourceText("Year")}
          >
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {showNext ? (
          <button
            type="button"
            onClick={onNext}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight size={15} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="w-7" />
        )}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {DAYS.map((d) => (
          <span key={d} className="mb-1.5 text-[10px] font-medium text-muted-foreground">
            {sourceText(d)}
          </span>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} className="h-8" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const cur = new Date(year, month, day);
          const isSelected = selected && selected.toDateString() === cur.toDateString();
          const today = new Date();
          const isToday = today.toDateString() === cur.toDateString();
          const disabled = (min && cur < min) || (max && cur > max);
          return (
            <button
              key={day}
              type="button"
              disabled={!!disabled}
              onClick={() => onSelect(cur)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-[13px] transition-colors",
                isSelected && "bg-primary font-bold text-primary-foreground shadow-sm",
                !isSelected && isToday && "border border-primary/40 font-semibold text-primary",
                !isSelected && !isToday && !disabled && "text-foreground hover:bg-accent",
                disabled && "cursor-not-allowed opacity-30",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScheduleDate({
  value,
  onChange,
  placeholder = "JJ/MM/AAAA",
  id,
  name,
  required,
  disabled,
  className,
  min,
  max,
}: ScheduleDateProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(formatDisplay(fromISO(value)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selected = fromISO(value);
  const minDate = fromISO(min);
  const maxDate = fromISO(max);
  const [viewDate, setViewDate] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (selected) {
      setViewDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
      setInputValue(formatDisplay(selected));
    } else {
      setInputValue("");
    }
  }

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      setOpen(false);
      return;
    }
    const height = panelRef.current?.offsetHeight ?? 360;
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp =
      spaceBelow < height + PANEL_GAP && rect.top > height + PANEL_GAP;
    setPosition({
      top: openUp ? rect.top - height - PANEL_GAP : rect.bottom + PANEL_GAP,
      left: Math.min(
        Math.max(PANEL_GAP, rect.left),
        Math.max(PANEL_GAP, window.innerWidth - width - PANEL_GAP),
      ),
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition, viewDate]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  const applyTypedDate = (raw: string) => {
    setInputValue(raw);
    const parsed = parse(raw, "dd/MM/yyyy", new Date());
    if (isValid(parsed) && raw.length === 10) {
      onChange?.(toISO(parsed));
      setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  };

  const calendar =
    open && position
      ? createPortal(
          <AnimatePresence>
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              data-efop-overlay=""
              className="fixed z-[100] overflow-hidden rounded-2xl border border-border bg-popover p-4 shadow-2xl"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                minWidth: PANEL_MIN_WIDTH,
              }}
            >
              <Input
                placeholder="JJ/MM/AAAA"
                value={inputValue}
                onChange={(e) => applyTypedDate(e.target.value)}
                className="mb-3 h-8 text-xs"
              />
              <MonthGrid
                viewDate={viewDate}
                selected={selected}
                onSelect={(d) => {
                  onChange?.(toISO(d));
                  setInputValue(formatDisplay(d));
                  setOpen(false);
                }}
                onPrev={() =>
                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
                }
                onNext={() =>
                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
                }
                onGoToMonth={(d) => setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))}
                showPrev
                showNext
                min={minDate}
                max={maxDate}
              />
            </motion.div>
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors",
          "hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Calendar size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{formatDisplay(selected) || placeholder}</span>
        </div>
        <div className="flex items-center gap-1">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange?.("");
                setInputValue("");
              }}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={13}
            className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>
      {calendar}
    </div>
  );
}
