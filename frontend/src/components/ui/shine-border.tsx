import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shine border — adapted from the Magic UI "Shine Border"
 * (https://magicui.design/docs/components/shine-border) and the animated
 * gradient-border pattern in React Bits.
 *
 * How it differs from the reference:
 *
 * 1. **Border only, never a glow.** The reference versions frequently bleed a
 *    coloured halo outside the element, which §49 rules out. This masks the
 *    animated conic gradient to the border box with `padding` + an inner
 *    surface, so the element keeps a hard edge.
 * 2. **The logo's two hues, in order.** The conic sweep goes azure -> orange ->
 *    azure, so the travelling highlight is recognisably the brand rather than a
 *    rainbow.
 * 3. **Server-safe.** Pure CSS on a custom property angle, no `"use client"`,
 *    no JS. Falls back to a static brand-tinted border when
 *    `prefers-reduced-motion` is set, rather than to nothing.
 *
 * Used sparingly — one element per viewport at most. An animated border on
 * every card is exactly the noise the anti-slop rule exists to prevent.
 */
export function ShineBorder({
  children,
  className,
  innerClassName,
  radius = "1.5rem",
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  radius?: string;
}) {
  return (
    <div
      className={cn("efop-shine relative isolate", className)}
      style={{ ["--shine-radius" as string]: radius }}
    >
      <div className={cn("efop-shine-inner relative", innerClassName)}>
        {children}
      </div>
    </div>
  );
}
