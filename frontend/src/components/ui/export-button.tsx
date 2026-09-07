"use client";

/*
 * Shared list-export button (v17.20, menu rebuilt in v17.26).
 *
 * Before this, every screen that could export re-implemented the same blob
 * download by hand: create an object URL, build an anchor, click it, revoke.
 * Six list screens gained export endpoints in v17.19 and had no button at all,
 * so this exists once rather than six more times.
 *
 * The caller owns the request (it knows its own filters); this owns the menu,
 * the busy state, the download and the error toast.
 *
 * WHY THE MENU IS IN A PORTAL (v17.26)
 * ------------------------------------
 * It used to be an `absolute` element inside the button's own container. That
 * works only if no ancestor clips or out-stacks it, and on several screens one
 * does: PageHero is `overflow-hidden` (it has to be - it clips the decorative
 * blurred orbs), cards round their corners with `overflow-hidden`, and sticky
 * toolbars create their own stacking context. On those screens the format menu
 * opened underneath the surrounding panel or was cut off entirely, so clicking
 * Export appeared to do nothing. That is the "export widget is hidden" defect.
 *
 * Rendering into `document.body` with fixed coordinates removes the whole class
 * of bug: no ancestor can clip a child it does not have, and nothing else in
 * the app uses a z-index this high. The trade-off is that the menu no longer
 * moves with its trigger automatically, so scroll and resize are tracked and
 * the menu closes if the trigger leaves the viewport.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sourceText } from "@/lib/i18n/source-catalog";
import { EXPORT_FORMATS, type ExportFormat } from "@/features/exports/api";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  pdf: "PDF (.pdf)",
};

/** Menu width in px. Fixed so the position can be computed before paint. */
const MENU_WIDTH = 176;
const MENU_GAP = 8;

export interface ExportButtonProps {
  /**
   * Performs the request and resolves with the file body. The caller passes
   * its current filters, so the file matches what is on screen.
   */
  onExport: (format: ExportFormat) => Promise<Blob>;
  /** File name without date or extension, e.g. "deadlines_export". */
  filenameStem: string;
  /** Defaults to every format the backend supports. */
  formats?: readonly ExportFormat[];
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "xs" | "sm" | "default" | "lg";
  variant?: "outline" | "secondary" | "ghost" | "subtle" | "onHeroOutline";
}

interface MenuPosition {
  top: number;
  left: number;
}

export function ExportButton({
  onExport,
  filenameStem,
  formats = EXPORT_FORMATS,
  label = "Export",
  disabled = false,
  className,
  size = "default",
  variant = "outline",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // There is deliberately no `mounted` flag here.
  //
  // A `useState(false)` + `useEffect(() => setMounted(true))` pair is the usual
  // way to keep `createPortal` off the server render, but it is redundant in
  // this component and it violated react-hooks/set-state-in-effect: a setState
  // in an effect body forces a second render pass on every mount of every
  // export button on the page.
  //
  // It is redundant because the portal is already gated on `open`, `open`
  // starts `false`, and the only thing that sets it is the trigger's onClick.
  // A click cannot happen before hydration, so by the time the portal renders
  // the DOM provably exists. The server and first client pass both render no
  // menu, which is exactly what the flag was protecting.

  /** Anchor the menu to the trigger in viewport coordinates. */
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    // Close rather than float somewhere meaningless if the trigger has been
    // scrolled out of view inside a scrollable panel.
    const clearlyOffscreen =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth;
    if (clearlyOffscreen) {
      setOpen(false);
      return;
    }

    const menuHeight = menuRef.current?.offsetHeight ?? 44 * formats.length + 8;

    // Prefer below; flip above when the bottom of the window is closer than
    // the menu is tall.
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + MENU_GAP && rect.top > menuHeight + MENU_GAP;
    const top = openUp ? rect.top - menuHeight - MENU_GAP : rect.bottom + MENU_GAP;

    // Align the menu's end edge with the trigger's end edge, matching the
    // old `end-0`, then clamp so it can never hang off either side. This is
    // direction-agnostic, which matters because the app runs RTL in Arabic.
    const isRtl =
      typeof document !== "undefined" &&
      document.documentElement.dir === "rtl";
    const preferredLeft = isRtl ? rect.left : rect.right - MENU_WIDTH;
    const left = Math.min(
      Math.max(MENU_GAP, preferredLeft),
      Math.max(MENU_GAP, window.innerWidth - MENU_WIDTH - MENU_GAP),
    );

    setPosition({ top, left });
  }, [formats.length]);

  // Position before the browser paints, so the menu never appears at 0,0 and
  // then jump to its real place.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Close on outside click and on Escape; follow the trigger on scroll and
  // resize. Registered only while open so the page keeps no listeners it is
  // not using. Scroll is captured so scrolling in any nested container counts.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReflow = () => reposition();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, reposition]);

  const runExport = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const blob = await onExport(format);
      objectUrl = window.URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${filenameStem}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : sourceText("Export failed");
      toast.error(message || sourceText("Export failed"));
    } finally {
      // Clean up whatever was actually created, even on a mid-way failure.
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
      if (anchor?.parentNode) document.body.removeChild(anchor);
      setBusy(null);
    }
  };

  const isBusy = busy !== null;

  const menu =
    open && position
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={sourceText("Export format")}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
            }}
            className="z-[100] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {formats.map((format) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                disabled={isBusy}
                onClick={() => void runExport(format)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {sourceText(FORMAT_LABELS[format])}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={triggerRef} className={`relative inline-block ${className ?? ""}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || isBusy}
        aria-haspopup="menu"
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
      {menu}
    </div>
  );
}
