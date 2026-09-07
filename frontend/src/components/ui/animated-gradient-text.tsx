import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * AnimatedGradientText
 * Renders text with a slow-shifting gradient shimmer.
 * Inspired by Magic UI / shadcn patterns — adapted for EFOP.
 * Supports light, dark, RTL. No external dependency.
 */
export function AnimatedGradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "animate-gradient-shift bg-gradient-to-r bg-[size:200%_auto]",
        "from-brand-blue-600 via-primary to-brand-orange-500",
        "bg-clip-text text-transparent",
        "[-webkit-background-clip:text]",
        className,
      )}
    >
      {children}
    </span>
  );
}
