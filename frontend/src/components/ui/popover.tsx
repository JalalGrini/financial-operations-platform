"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Portalled popover.
 *
 * WHY THIS IS HAND-ROLLED
 * -----------------------
 * `@radix-ui/react-popover` is not a declared dependency, and adding one is the
 * wrong trade in this repo: `node_modules` cannot be reproduced from its own
 * manifest (five packages are already undeclared and the documented instruction
 * is "copy, do not npm install"), so a new package would block every other build
 * until the owner installed it online.
 *
 * The positioning and dismissal logic is the pattern already proven in
 * `components/ui/export-button.tsx` and `monthly-export-dialog.tsx`, extracted
 * once instead of pasted a third and fourth time.
 *
 * Behaviour worth knowing:
 * - Portals to `document.body`. `PageHero` is `overflow-hidden
 *   rounded-[28px]`, so an absolutely positioned panel inside it gets clipped -
 *   that was a real v17.26 defect on two separate components.
 * - Also escapes the `transform` on `ProtectedLayout`'s motion wrapper, which
 *   makes it a containing block for `position: fixed` (the v17.13 B13 defect).
 * - Flips above the trigger when there is no room below, and clamps to the
 *   viewport on both axes.
 * - Aligns by logical edge, so `align="end"` follows the reading direction and
 *   is correct in Arabic.
 * - Closes on outside pointerdown, on Escape (returning focus to the trigger),
 *   and when the trigger scrolls out of view inside a scrollable panel.
 *
 * Deliberately no `mounted` flag: the portal is gated on `open`, `open` starts
 * false, and only a user interaction sets it, so the DOM provably exists by the
 * time it renders. A `setMounted` in an effect trips
 * `react-hooks/set-state-in-effect`, which this codebase has had to remove twice.
 */

const GAP = 6;

export interface PopoverProps {
  /** Rendered as the trigger. Receives ref, onClick and aria-expanded. */
  trigger: ReactElement;
  children: ReactNode;
  /** Panel width in px. Needed up front so the panel can be clamped. */
  width?: number;
  align?: "start" | "end" | "center";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  width = 320,
  align = "end",
  className,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const reposition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();

    // Close rather than float somewhere meaningless.
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      setOpen(false);
      return;
    }

    const maxHeight = Math.max(120, window.innerHeight - GAP * 2);
    // First open used to measure height as 0 because the portal was gated on
    // `position`, so the panel was always placed below the trigger and ran off
    // the page until a scroll pass measured it. The panel now mounts while
    // hidden, then we clamp it into the viewport.
    const height = Math.min(panelRef.current?.offsetHeight || 160, maxHeight);
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUp = spaceBelow < height && spaceAbove > spaceBelow;

    const isRtl =
      typeof document !== "undefined" &&
      document.documentElement.dir === "rtl";

    // `end` means the trailing edge in reading order, so it mirrors in Arabic.
    let preferredLeft: number;
    if (align === "center") {
      preferredLeft = rect.left + rect.width / 2 - width / 2;
    } else if (align === "start") {
      preferredLeft = isRtl ? rect.right - width : rect.left;
    } else {
      preferredLeft = isRtl ? rect.left : rect.right - width;
    }

    const preferredTop = openUp ? rect.top - height - GAP : rect.bottom + GAP;

    setPosition({
      top: Math.min(Math.max(GAP, preferredTop), window.innerHeight - height - GAP),
      left: Math.min(
        Math.max(GAP, preferredLeft),
        Math.max(GAP, window.innerWidth - width - GAP),
      ),
      maxHeight,
    });
  }, [align, setOpen, width]);

  // Before paint, so the panel never shows at 0,0 and then jumps.
  // A second frame remasures after children commit, which is what the first
  // open was missing when height was still 0.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    reposition();
    const frame = window.requestAnimationFrame(reposition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      if (target instanceof Element && target.closest("[data-efop-overlay]")) {
        return;
      }
      setOpen(false);
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
  }, [open, reposition, setOpen]);

  /**
   * The ref lives on a wrapper span, not on the trigger itself.
   *
   * Passing `ref` through `cloneElement` looked tidier and was wrong twice over:
   * `react-hooks` rejects it ("Passing a ref to a function may read its value
   * during render"), and more importantly it silently does nothing unless the
   * trigger happens to forward refs - so an arbitrary caller-supplied element
   * would leave `triggerRef.current` null and the panel would never position.
   *
   * The span is `inline-flex` so it wraps the trigger tightly and
   * `getBoundingClientRect()` still measures the visible control.
   */
  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        onClick: (event: React.MouseEvent) => {
          (
            trigger.props as { onClick?: (e: React.MouseEvent) => void }
          ).onClick?.(event);
          setOpen(!open);
        },
      })
    : trigger;

  return (
    <>
      <span ref={triggerRef as React.RefObject<HTMLSpanElement>} className="inline-flex">
        {triggerNode}
      </span>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              data-efop-overlay=""
              className={cn(
                "fixed z-[100] rounded-2xl border bg-popover text-popover-foreground shadow-xl",
                "efop-popover-in",
                className,
              )}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width,
                maxHeight: position?.maxHeight ?? `calc(100vh - ${GAP * 2}px)`,
                overflowY: "auto",
                visibility: position ? "visible" : "hidden",
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
