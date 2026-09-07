"use client";

/**
 * Long free text, clamped with a way to read the rest.
 *
 * Notes, descriptions and observations are open-ended fields, but they were
 * rendered either with `truncate` (one line, rest silently lost) or
 * `line-clamp-2` with no affordance at all, so a long note could not be read
 * from the screen it was entered on.
 *
 * The "See more" control only appears when the text ACTUALLY overflows, which
 * is measured rather than guessed from a character count: the same string wraps
 * differently at different column widths, so a length threshold would both hide
 * the control on overflowing text and show a useless one on text that fits.
 */

import * as React from "react";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";

/** Tailwind needs literal class names, so the supported clamps are enumerated. */
const CLAMP_CLASS: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  6: "line-clamp-6",
};

export interface ExpandableTextProps {
  text?: string | null;
  /** Visible lines before clamping. Defaults to 2. */
  lines?: 1 | 2 | 3 | 4 | 6;
  /** Dialog heading, e.g. "Note" or "Observations". */
  label?: string;
  /** Extra context under the dialog heading, e.g. the record reference. */
  context?: string;
  /** Rendered when there is no text. Defaults to an em dash. */
  emptyFallback?: React.ReactNode;
  className?: string;
}

export function ExpandableText({
  text,
  lines = 2,
  label,
  context,
  emptyFallback = <span className="text-muted-foreground">—</span>,
  className,
}: ExpandableTextProps) {
  const clampRef = React.useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const value = (text ?? "").trim();

  React.useEffect(() => {
    const element = clampRef.current;
    if (!element) return;

    const measure = () => {
      // 1px of slack: sub-pixel line heights make scrollHeight exceed
      // clientHeight by a fraction even when nothing is actually clipped.
      setOverflowing(element.scrollHeight - element.clientHeight > 1);
    };

    measure();

    // Re-measure on resize: a note that fits on a wide screen clips on a narrow
    // one, and the control has to appear and disappear with the layout.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, lines]);

  if (!value) return <>{emptyFallback}</>;

  const heading = label || sourceText("Full text");

  return (
    <div className={cn("min-w-0", className)}>
      <p
        ref={clampRef}
        // whitespace-pre-line keeps the author's line breaks; break-words stops
        // an unbroken string (a pasted URL) from widening the whole row.
        className={cn(
          "whitespace-pre-line break-words",
          CLAMP_CLASS[lines] ?? CLAMP_CLASS[2],
        )}
      >
        {value}
      </p>

      {overflowing && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary",
            "underline-offset-2 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
          aria-label={`${sourceText("See more")}: ${heading}`}
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          {sourceText("See more")}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            {context && <DialogDescription>{context}</DialogDescription>}
          </DialogHeader>
          {/* Capped height so a very long note scrolls inside the dialog
              instead of pushing the close button off-screen. */}
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-sm leading-relaxed">
            {value}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
