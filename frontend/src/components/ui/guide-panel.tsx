"use client";

/**
 * The guidance panel that sits under the stat cards on list and edit screens.
 *
 * Twelve pages each carried their own hand-copied copy of this markup - about
 * 31 lines apiece, identical down to the class names, differing only in the
 * strings. That is 376 lines of duplication, and it drifts: a spacing or colour
 * fix has to be applied twelve times or the screens stop matching each other.
 *
 * COLLAPSED BY DEFAULT (v17.26)
 * -----------------------------
 * The panel used to render its whole paragraph plus every bullet on arrival,
 * which pushed the actual table down the page on all twelve screens. The
 * owner asked twice for this to be one line. It is now one line: the eyebrow
 * and heading stay, the paragraph is clamped to a single line, and the bullets
 * are behind a toggle.
 *
 * Nothing was deleted to achieve that - all 72 strings are still passed in and
 * still rendered, just not all at once. `guide-panel-contract.test.ts` counts
 * those strings and checks every prop still goes through `sourceText`, so
 * shrinking the panel cannot quietly drop content or freeze it in English.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";

export interface GuidePanelProps {
  /** Small uppercase label, e.g. "Payroll operations guide". */
  eyebrow: string;
  /** The heading beneath the eyebrow. */
  title: string;
  /** One paragraph of context under the heading. */
  body: string;
  /** Practical points. Rendered as a list, in order. */
  items: string[];
  /** Start expanded. Off by default - the point is to reclaim the space. */
  defaultOpen?: boolean;
  className?: string;
}

export function GuidePanel({
  eyebrow,
  title,
  body,
  items,
  defaultOpen = false,
  className,
}: GuidePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/15 bg-primary/5 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText(eyebrow)}
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {sourceText(title)}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {sourceText(open ? "Hide details" : "Show details")}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Clamped to one line when closed. The text is still in the DOM, so it
          stays selectable and readable to assistive technology. */}
      <p
        className={cn(
          "mt-2 text-sm leading-6 text-muted-foreground",
          !open && "line-clamp-1",
        )}
      >
        {sourceText(body)}
      </p>

      {open && (
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{sourceText(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
