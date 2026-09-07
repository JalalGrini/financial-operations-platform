"use client";

/*
 * Monthly export dialog (v17.25).
 *
 * The CNSS declaration and the monthly personnel payment list are filed per
 * month, so exporting them starts with choosing a month, not with accepting
 * whatever month happens to be on screen. Before this, the CNSS page exported
 * `new Date()` unconditionally: on 1 September you could not produce the
 * August declaration you were actually filing.
 *
 * The caller owns the request and the file name; this owns the period choice,
 * the format choice, the busy state, the download and the error toast. It
 * deliberately mirrors ExportButton's popover behaviour (outside click and
 * Escape close) so the two feel identical.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sourceText } from "@/lib/i18n/source-catalog";

/** Matches the w-72 panel below; needed to position the portal. */
const PANEL_WIDTH = 288;
const PANEL_GAP = 8;
/** Enough to decide whether the panel fits below the trigger. */
const PANEL_ESTIMATED_HEIGHT = 210;

/** The printed forms are filed as spreadsheets; PDF is not offered here. */
export type MonthlyExportFormat = "xlsx" | "csv";

export const MONTHLY_EXPORT_FORMATS: readonly MonthlyExportFormat[] = [
  "xlsx",
  "csv",
] as const;

const FORMAT_LABELS: Record<MonthlyExportFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
};

export const MONTH_LABELS = [
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
] as const;

export interface MonthlyExportDialogProps {
  /** Performs the request for the chosen period and resolves with the file. */
  onExport: (args: {
    year: number;
    month: number;
    format: MonthlyExportFormat;
  }) => Promise<Blob>;
  /** Base file name; the chosen period and extension are appended. */
  filenameStem: string;
  label?: string;
  /** Short line explaining what the file will contain. */
  description?: string;
  defaultYear?: number;
  defaultMonth?: number;
  formats?: readonly MonthlyExportFormat[];
  disabled?: boolean;
  className?: string;
  size?: "xs" | "sm" | "default" | "lg";
  variant?: "outline" | "secondary" | "ghost" | "subtle" | "onHeroOutline";
}

export function MonthlyExportDialog({
  onExport,
  filenameStem,
  label = "Export month",
  description,
  defaultYear,
  defaultMonth,
  formats = MONTHLY_EXPORT_FORMATS,
  disabled = false,
  className,
  size = "default",
  variant = "outline",
}: MonthlyExportDialogProps) {
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<MonthlyExportFormat | null>(null);
  const [year, setYear] = useState(defaultYear ?? now.getFullYear());
  const [month, setMonth] = useState(defaultMonth ?? now.getMonth() + 1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The panel is portalled to document.body, so it needs real coordinates.
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // No `mounted` flag: see the same note in export-button.tsx. The portal is
  // gated on `open`, `open` starts false, and only the trigger's onClick sets
  // it - so the DOM is guaranteed to exist by the time the portal renders. The
  // flag it replaces tripped react-hooks/set-state-in-effect and cost a second
  // render pass on every mount.

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? PANEL_ESTIMATED_HEIGHT;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < height + PANEL_GAP && rect.top > height + PANEL_GAP
        ? rect.top - height - PANEL_GAP
        : rect.bottom + PANEL_GAP;
    // Right-aligned to the trigger, which is how it read when it was
    // `end-0`; mirrored under RTL so it does not run off the start edge.
    const isRtl = document.documentElement.dir === "rtl";
    const raw = isRtl ? rect.left : rect.right - PANEL_WIDTH;
    const left = Math.max(
      PANEL_GAP,
      Math.min(raw, window.innerWidth - PANEL_WIDTH - PANEL_GAP),
    );
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onViewportChange = () => place();
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open, place]);

  // An eleven-year window ending next year covers filing late and ahead.
  const years = useMemo(() => {
    const latest = now.getFullYear() + 1;
    return Array.from({ length: 11 }, (_value, index) => latest - index);
  }, [now]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The panel is no longer a DOM descendant of rootRef, so it has to be
      // checked separately or clicking a control inside it closes the panel.
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const runExport = async (format: MonthlyExportFormat) => {
    setBusy(format);
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const blob = await onExport({ year, month, format });
      objectUrl = window.URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${filenameStem}_${year}_${String(month).padStart(2, "0")}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      setOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : sourceText("Export failed");
      toast.error(message || sourceText("Export failed"));
    } finally {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
      if (anchor?.parentNode) document.body.removeChild(anchor);
      setBusy(null);
    }
  };

  const isBusy = busy !== null;
  const selectClass =
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

  return (
    <div ref={rootRef} className={`relative inline-block ${className ?? ""}`}>
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || isBusy}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{sourceText(label)}</span>
      </Button>

      {open ? (
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={sourceText(label)}
            style={{ top: position.top, left: position.left }}
            className="fixed z-[100] w-72 rounded-lg border border-border bg-popover p-3 shadow-lg"
          >
          {description ? (
            <p className="mb-3 text-xs text-muted-foreground">
              {sourceText(description)}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {sourceText("Month")}
              <select
                className={selectClass}
                value={month}
                disabled={isBusy}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {MONTH_LABELS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {String(index + 1).padStart(2, "0")} — {sourceText(name)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {sourceText("Year")}
              <select
                className={selectClass}
                value={year}
                disabled={isBusy}
                onChange={(event) => setYear(Number(event.target.value))}
              >
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            {formats.map((format) => (
              <button
                key={format}
                type="button"
                disabled={isBusy}
                onClick={() => void runExport(format)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
              >
                {busy === format ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {sourceText(FORMAT_LABELS[format])}
              </button>
            ))}
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}
