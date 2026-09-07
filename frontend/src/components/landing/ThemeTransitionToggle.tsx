"use client";

import { sourceText } from "@/lib/i18n/source-catalog";
/**
 * Theme control with a circular View Transitions wipe.
 *
 * BEHAVIOUR
 * - Three explicit states: Auto / Light / Dark. "Auto" is the default and
 *   follows the visitor's browser theme, which is the requested behaviour.
 *   A two-state toggle would make "follow my system" unreachable once the
 *   visitor has touched the control even once.
 * - On change, the new theme is revealed by a circle expanding from the
 *   control itself, in the manner of the SkiperUI theme-toggle animations.
 *   The circle's origin is the button's centre, so the wipe reads as being
 *   caused by the click rather than happening to the page.
 * - The landing background shader watches the `dark` class and eases its
 *   own palette uniform over ~220ms, so the shader re-tints in step with
 *   this wipe instead of snapping.
 *
 * GRACEFUL DEGRADATION
 * - No View Transitions support (Firefox, Safari < 18): the theme simply
 *   changes. No polyfill, no fake overlay.
 * - prefers-reduced-motion: the wipe is skipped entirely.
 * - No JS: the control renders as three real buttons; they just do nothing
 *   until hydration. Nothing is hidden and nothing is broken.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useRef } from "react";
import { useExperience, type Theme } from "@/lib/experience";
import { FOCUS_RING } from "./design-system";

/** The keyframes are injected once, on demand, rather than shipped in globals.css. */
const STYLE_ID = "efop-theme-wipe";

const WIPE_CSS = `
@keyframes efop-theme-wipe-in {
  from { clip-path: circle(0% at var(--efop-wipe-x, 50%) var(--efop-wipe-y, 0%)); filter: blur(6px); }
  to   { clip-path: circle(160% at var(--efop-wipe-x, 50%) var(--efop-wipe-y, 0%)); filter: blur(0px); }
}
::view-transition-old(root) {
  animation: none;
  /* The outgoing theme simply waits underneath; animating both causes a
     visible seam where the two paint layers disagree. */
  z-index: 0;
}
::view-transition-new(root) {
  animation: efop-theme-wipe-in 620ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  z-index: 1;
}
`;

function ensureWipeStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = WIPE_CSS;
  document.head.appendChild(style);
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeTransitionToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useExperience();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const apply = useCallback(
    (next: Theme, origin: HTMLElement | null) => {
      if (next === theme) return;

      const doc = document as ViewTransitionDocument;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduce || typeof doc.startViewTransition !== "function") {
        setTheme(next);
        return;
      }

      // Anchor the circle on the button that was pressed.
      if (origin) {
        const rect = origin.getBoundingClientRect();
        const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
        document.documentElement.style.setProperty("--efop-wipe-x", `${x}%`);
        document.documentElement.style.setProperty("--efop-wipe-y", `${y}%`);
      }

      ensureWipeStyles();
      doc.startViewTransition(() => {
        setTheme(next);
      });
    },
    [setTheme, theme],
  );

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={sourceText("Colour theme")}
      className={[
        "relative inline-flex items-center gap-0.5 rounded-full border border-[hsl(var(--primary)/0.14)] bg-background/70 p-0.5 backdrop-blur-xl",
        className ?? "",
      ].join(" ")}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={(event) => apply(value, event.currentTarget)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={[
              "relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150",
              FOCUS_RING,
              isActive
                ? "bg-[hsl(var(--primary))] text-primary-foreground"
                : "text-muted-foreground hover:bg-[hsl(var(--primary)/0.08)] hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}

export default ThemeTransitionToggle;
