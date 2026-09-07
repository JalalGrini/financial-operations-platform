"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Number ticker — adapted from the Magic UI "Number Ticker"
 * (https://magicui.design/docs/components/number-ticker).
 *
 * Why this exists when `components/ui/count-up.tsx` already does something
 * similar: `CountUp` takes a `number` and formats with `toFixed`, so it cannot
 * render the group's real statistics. Those are `368`, `99%`, `24/7` and
 * `2014` — two of the four are not numbers at all, and `2014` must never be
 * counted up from zero because a year is an identifier, not a quantity.
 *
 * So this component takes the **display string** and animates only its leading
 * numeric run, replaying the original characters around it:
 *
 *   "368"   -> counts 0 -> 368
 *   "99%"   -> counts 0 -> 99, keeps "%"
 *   "24/7"  -> counts 0 -> 24, keeps "/7"
 *   "2014"  -> `animate={false}` at the call site; renders as-is
 *
 * `CountUp` is deliberately left untouched: it has other call sites and this
 * needed different behaviour, not a widened signature.
 *
 * Reduced motion: `useReducedMotion` short-circuits to the final value on the
 * first paint. The existing global CSS rule cannot help here, because this is a
 * JS-driven text mutation rather than a CSS animation.
 *
 * `tabular-nums` is applied by default so the digits do not reflow mid-count.
 */
export function NumberTicker({
  value,
  duration = 1.6,
  animate = true,
  className,
}: {
  value: string;
  duration?: number;
  animate?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduceMotion = useReducedMotion();

  const match = /^(\d[\d\s,.]*)/.exec(value);
  const numericText = match ? match[1] : "";
  const target = numericText ? Number(numericText.replace(/[\s,]/g, "")) : NaN;
  const suffix = numericText ? value.slice(numericText.length) : value;
  const canAnimate =
    animate && !reduceMotion && Boolean(numericText) && Number.isFinite(target);

  const [current, setCurrent] = useState(() => (canAnimate ? 0 : target));

  useEffect(() => {
    if (!canAnimate || !inView) return;
    let frame = 0;
    let start: number | null = null;
    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / (duration * 1000), 1);
      // Ease-out cubic, matching the easing already used by CountUp so the two
      // do not read as two different motion systems on the same page.
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [canAnimate, inView, target, duration]);

  if (!canAnimate) {
    return (
      <span ref={ref} className={cn("tabular-nums", className)}>
        {value}
      </span>
    );
  }

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {/* The full value stays in the accessibility tree, so a screen reader is
       * never read a half-finished count. */}
      <span aria-hidden="true">
        {current.toLocaleString("en-US").replace(/,/g, " ")}
        {suffix}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
