"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll an inline panel into view (and move focus into it) when it opens.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several pages toggle an inline form rather than a modal - "New Record" on
 * Financial Records, the header editor on a record's workspace, the edit and
 * archive panels on Parties/Clients. The panel is rendered lower down the
 * document, so on a tall page pressing the button changed something entirely
 * off-screen: the button looked broken, and the form the user was told to fill
 * in was never seen. Reported as "the Nouvel enregistrement button is not
 * working" and "it just shows the edit form at the bottom".
 *
 * Attach the returned ref to the panel's outermost element and pass the same
 * boolean that renders it.
 *
 * Focus moves to the first field so the panel is reachable by keyboard and
 * announced by screen readers, not merely visible. `prefers-reduced-motion` is
 * honoured by falling back to an instant jump.
 *
 * @param open - the same condition that renders the panel.
 * @param trigger - optional value that changes each time the panel is
 *   re-targeted while it is ALREADY open (for example the id of the row being
 *   edited). Without it, pressing Edit on a second row while the editor is open
 *   would swap the contents without bringing the panel back into view, because
 *   `open` never transitions.
 */
export function useRevealOnOpen<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  trigger?: unknown,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;

    // One frame later: the panel has just been added to the tree, so it needs
    // to be laid out before scrollIntoView can measure it.
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      node.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });

      // `preventScroll` so focusing does not fight the smooth scroll above.
      const target = node.querySelector<HTMLElement>(
        "[data-reveal-focus], input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])",
      );
      target?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [open, trigger]);

  return ref;
}
