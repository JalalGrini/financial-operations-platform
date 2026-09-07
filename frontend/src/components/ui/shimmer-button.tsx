import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * ShimmerButton
 * A premium CTA button with a slow light-sweep shimmer.
 * Self-contained — no external dependency.
 * Inspired by Magic UI shimmer-button pattern.
 */
export function ShimmerButton({
  children,
  className,
  shimmerColor = "rgba(255,255,255,0.22)",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  shimmerColor?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full",
        "bg-[linear-gradient(110deg,hsl(var(--primary)),hsl(var(--primary))_40%,hsl(var(--brand-blue-500))_60%,hsl(var(--primary)))]",
        "bg-[size:200%_100%] bg-[position:100%]",
        "animate-shimmer-btn px-7 py-3 text-sm font-bold text-primary-foreground",
        "shadow-[0_8px_28px_hsl(var(--primary)/0.28)]",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_hsl(var(--primary)/0.36)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
