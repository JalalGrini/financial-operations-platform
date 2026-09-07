/**
 * Single source of truth for the public surfaces (landing + login).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The landing page and the login page must read as one designed system, not
 * two screens that happen to share a palette. Every spacing, radius, easing
 * and surface decision lives here so the two pages cannot drift apart as they
 * are edited independently.
 *
 * RULES ENCODED HERE
 * - Spacing is restricted to the 4/8/12/16/24/32/48/64/96/128 scale.
 * - Colour is always `hsl(var(--token))`; never a hex literal.
 * - No two adjacent sections may share a surface (see SURFACE_ORDER).
 */

/* ------------------------------------------------------------------ layout */

/** Page container. Matches the existing landing markup exactly. */
export const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10";

/** Vertical section rhythm. Never two identical values in a row. */
export const SECTION = {
  /** Standard section. */
  base: "py-24",
  /** Flagship sections: hero, stepped stack, closing contact. */
  flagship: "py-32",
  /** Compressed bands: marquee, utility strip, footer. */
  band: "py-16",
} as const;

/**
 * The section header block, used identically in every section.
 * kicker -> 12 -> h2 -> 16 -> lead -> 48 -> content
 * This repetition is what makes the page read as drawn by one hand.
 */
export const HEADER_BLOCK = {
  wrap: "flex flex-col",
  kicker:
    "text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue-700))] dark:text-[hsl(var(--brand-blue-500))]",
  kickerGap: "mt-3",
  title:
    "text-[clamp(2rem,3.4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground",
  titleGap: "mt-4",
  lead: "max-w-[62ch] text-[clamp(1.0625rem,1.3vw,1.25rem)] leading-relaxed text-muted-foreground",
  contentGap: "mt-12",
} as const;

/* ------------------------------------------------------------------ shape */

/** Nested radii always decrease inward by >=4px. */
export const RADIUS = {
  control: "rounded-lg", // 8px  - inputs, buttons
  card: "rounded-xl", // 12px - cards
  panel: "rounded-[20px]", // 20px - feature panels, photo stages
  stage: "rounded-[28px]", // 28px - hero stage
  pill: "rounded-full",
} as const;

/**
 * Four elevation steps, all built from the Indigo-tinted ambient shadow
 * (never neutral grey). In dark mode shadows are invisible, so each step
 * swaps to a hairline + inner top highlight instead.
 */
export const ELEVATION = {
  input: "shadow-[0_1px_2px_hsl(var(--primary)/0.06)]",
  rest: "shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.08)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.06]",
  raised:
    "shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.16)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.10]",
  stage:
    "shadow-[0_32px_80px_-24px_hsl(var(--primary)/0.28)] dark:shadow-[0_32px_80px_-24px_hsl(0_0%_0%/0.6)]",
} as const;

/* ------------------------------------------------------------------ motion */

/** Cubic-bezier tuples, mirroring --ease-enter / --ease-exit in globals.css. */
export const EASE = {
  enter: [0.22, 1, 0.36, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  mid: [0.4, 0, 0.2, 1] as const,
};

export const EASE_CSS = {
  enter: "cubic-bezier(0.22,1,0.36,1)",
  exit: "cubic-bezier(0.4,0,1,1)",
  mid: "cubic-bezier(0.4,0,0.2,1)",
} as const;

/**
 * Interaction must feel instant (<=150ms); arrival must feel composed
 * (>=350ms). Ambient motion is slower still.
 */
export const DURATION = {
  fast: 0.15,
  med: 0.25,
  slow: 0.35,
  ambient: 0.6,
} as const;

export const STAGGER = { children: 0.07, lead: 0.05 } as const;

/**
 * Canonical entrance: fade + 16px rise + subtle scale. Never fade alone -
 * a bare opacity fade is the cheapest-looking transition on the web.
 */
export const ENTRANCE = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1 },
} as const;

/* ---------------------------------------------------------------- surfaces */

/**
 * Surface rotation. Consumers step through this so no two adjacent sections
 * share a background. Index with `surfaceFor(n)`.
 */
export const SURFACE_ORDER = [
  "bg-background",
  "bg-[hsl(var(--brand-surface))]",
  "bg-background",
  "bg-[hsl(var(--landing-cream))] dark:bg-[hsl(var(--brand-surface))]",
] as const;

export function surfaceFor(index: number): string {
  return SURFACE_ORDER[index % SURFACE_ORDER.length];
}

/* ------------------------------------------------------------- typography */

export const TYPE = {
  hero: "text-[clamp(2.75rem,6.2vw,5.6rem)] font-black leading-[0.95] tracking-[-0.055em]",
  h2: "text-[clamp(2rem,3.4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.04em]",
  h3: "text-lg font-bold leading-snug tracking-[-0.02em]",
  kicker:
    "text-[0.6875rem] font-bold uppercase tracking-[0.18em] leading-none",
  lead: "text-[clamp(1.0625rem,1.3vw,1.25rem)] leading-relaxed",
  body: "text-[0.9375rem] leading-relaxed",
  micro: "text-[0.8125rem] font-medium leading-normal",
  stat: "text-[clamp(2.5rem,4vw,3.75rem)] font-black leading-none tracking-[-0.04em] tabular-nums",
} as const;

/* --------------------------------------------------------------- a11y */

/** Applied to every interactive element on both public pages. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Minimum touch target (44px) for mobile controls. */
export const TOUCH = "min-h-11 min-w-11";
