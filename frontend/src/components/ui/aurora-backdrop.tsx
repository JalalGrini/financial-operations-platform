import { cn } from "@/lib/utils";

/**
 * Aurora backdrop — adapted from the "Aurora Background" pattern popularised by
 * Aceternity UI (https://ui.aceternity.com/), rebuilt from scratch on EFOP's
 * own tokens.
 *
 * Three deliberate departures from the source pattern:
 *
 * 1. **CSS only, no WebGL and no canvas.** The master prompt forbids WebGL and
 *    particle systems (§35), and a compositor-only animation costs no main
 *    thread. This is two blurred conic layers on `transform`/`opacity`.
 * 2. **Brand-exact colours.** The reference uses a generic indigo/purple wash,
 *    which is precisely the "AI slop" §49 rejects. This drives the logo's real
 *    azure (`--brand-blue`) into its real orange (`--brand-orange`), both
 *    sampled from `3rb-logo-icon.png`.
 * 3. **No `"use client"`.** It renders no state and no handlers, so it stays in
 *    the server bundle. `app/page.tsx` must remain a server component
 *    (LANDING_PAGE_UI_GUIDE §4.3) and this must not be the thing that breaks
 *    it.
 *
 * Motion is gated by the global `prefers-reduced-motion` rule in globals.css,
 * which zeroes animation duration for every `.landing-*`/`.efop-*` animation.
 *
 * `intensity` is a plain opacity multiplier so a dark section can carry the
 * same backdrop without washing out its text.
 */
export function AuroraBackdrop({
  className,
  intensity = "medium",
}: {
  className?: string;
  intensity?: "subtle" | "medium" | "strong";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "aurora-backdrop pointer-events-none absolute inset-0 overflow-hidden",
        intensity === "subtle" && "opacity-40",
        intensity === "medium" && "opacity-70",
        intensity === "strong" && "opacity-100",
        className,
      )}
    >
      <span className="aurora-layer aurora-layer-blue" />
      <span className="aurora-layer aurora-layer-orange" />
    </div>
  );
}
