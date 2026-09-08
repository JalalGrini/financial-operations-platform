"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sourceText } from "@/lib/i18n/source-catalog";

const MENU_WIDTH = 260;
const MENU_GAP = 8;

export type ExportStatusOption = { value: string; label: string; slug: string };

function todayStamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function exportFilenameStem(
  prefix: string,
  selected: string[],
  options: ExportStatusOption[],
): string {
  if (selected.length === 0) return `${prefix}_tous`;
  const slugs = selected
    .map((value) => options.find((option) => option.value === value)?.slug || value)
    .join("_");
  return `${prefix}_${slugs}`;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function FilteredExportButton({
  prefix,
  options,
  allowMulti = false,
  onExport,
  extraParams,
  disabled = false,
  className,
}: {
  prefix: string;
  options: ExportStatusOption[];
  allowMulti?: boolean;
  onExport: (params: Record<string, string | undefined>) => Promise<Blob>;
  extraParams?: Record<string, string | undefined>;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const clearlyOffscreen =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth;
    if (clearlyOffscreen) {
      setOpen(false);
      return;
    }
    const menuHeight = menuRef.current?.offsetHeight ?? 280;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
    const top = openUp ? rect.top - menuHeight - MENU_GAP : rect.bottom + MENU_GAP;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, reposition]);

  const runExport = async (statusValues: string[]) => {
    setBusy(true);
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const status =
        statusValues.length > 0 ? statusValues.join(",") : undefined;
      const blob = await onExport({ ...extraParams, status });
      const stem = exportFilenameStem(prefix, statusValues, options);
      objectUrl = window.URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${stem}_${todayStamp()}.xlsx`;
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
      setBusy(false);
    }
  };

  const menu =
    open && position
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={sourceText("Export")}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
            }}
            className="z-[100] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void runExport([])}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
            >
              {sourceText("Tous")}
            </button>
            {options.map((option) =>
              allowMulti ? (
                <label
                  key={option.value}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={selected.includes(option.value)}
                    onChange={(event) => {
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, option.value]
                          : current.filter((value) => value !== option.value),
                      );
                    }}
                  />
                  {option.label}
                </label>
              ) : (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void runExport([option.value])}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                >
                  {option.label}
                </button>
              ),
            )}
            {allowMulti ? (
              <button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() => void runExport(selected)}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border-t border-border px-3 py-2 text-sm font-medium text-popover-foreground hover:bg-accent disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {sourceText("Export")}
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={triggerRef} className={`relative inline-flex ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        className="rounded-e-none"
        onClick={() => void runExport([])}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{sourceText("Export")}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled || busy}
        className="rounded-s-none border-s-0"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      {menu}
    </div>
  );
}
