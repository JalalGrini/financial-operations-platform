"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Single-value slider built on a real `<input type="range">`.
 *
 * `@radix-ui/react-slider` is not a declared dependency. A native range input
 * gives keyboard support (arrows, Home/End, PageUp/Down), touch handling and
 * screen-reader announcement for free, and it is form-associable. The filled
 * portion is painted with a `linear-gradient` whose stop is driven by a CSS
 * custom property, so dragging costs no React render.
 *
 * Deliberately single-value: the range-with-two-thumbs case needs two inputs and
 * collision handling, and nothing in EFOP asks for it yet. Building it
 * speculatively would be code with no call site, which is this repo's documented
 * failure mode.
 *
 * Track colours come from the brand ramp, not a hardcoded hex.
 */
export const Slider = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
    value: number;
    min?: number;
    max?: number;
  }
>(({ className, value, min = 0, max = 100, ...props }, ref) => {
  const span = max - min;
  const percent = span > 0 ? ((value - min) / span) * 100 : 0;
  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      style={{ ["--slider-fill" as string]: `${percent}%` }}
      className={cn("efop-slider", className)}
      {...props}
    />
  );
});
Slider.displayName = "Slider";
