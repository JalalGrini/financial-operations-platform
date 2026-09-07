import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Marquee — adapted from the Magic UI "Marquee" component
 * (https://magicui.design/docs/components/marquee), reimplemented on EFOP's
 * tokens with three corrections the reference does not make:
 *
 * 1. **RTL.** The reference animates a fixed direction. Arabic is a supported
 *    locale here, so the track reverses under `[dir="rtl"]` (handled in
 *    globals.css) — otherwise the logos scroll against the reading direction.
 * 2. **Edge mask instead of gradient overlays.** The reference stacks two
 *    absolutely-positioned gradient divs, which have to know the section's
 *    background colour and therefore break in dark mode. A `mask-image` fades
 *    the content itself and is background-agnostic.
 * 3. **Duplication is explicit.** The caller passes `repeat`, so the number of
 *    rendered copies is visible at the call site rather than hidden in the
 *    component. Two copies is the minimum for a seamless loop.
 *
 * Server-safe: no state, no handlers, no `"use client"`. Pause-on-hover is CSS
 * (`animation-play-state`), so it needs no JS at all.
 *
 * Accessibility: the track is not focusable and duplicated content is hidden
 * from assistive tech via `aria-hidden` on the repeat copies, so a screen
 * reader hears the partner list once.
 */
export function Marquee({
  children,
  repeat = 2,
  speed = "normal",
  className,
  trackClassName,
}: {
  children: ReactNode;
  repeat?: number;
  speed?: "slow" | "normal" | "fast";
  className?: string;
  trackClassName?: string;
}) {
  return (
    <div className={cn("efop-marquee", className)}>
      <div
        className={cn(
          "efop-marquee-track flex w-max items-center",
          speed === "slow" && "efop-marquee-slow",
          speed === "fast" && "efop-marquee-fast",
          trackClassName,
        )}
      >
        {Array.from({ length: repeat }).map((_, index) => (
          <div
            key={index}
            className="flex shrink-0 items-center gap-4 pe-4"
            aria-hidden={index > 0 ? "true" : undefined}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
