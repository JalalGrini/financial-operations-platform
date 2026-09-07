import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";

export function GradientSpinner({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-block animate-spin rounded-full", className)}
      style={{ width: size, height: size, background: "conic-gradient(from 0deg, hsl(226 41% 38%), hsl(197 100% 41%), transparent)",
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - 3px), #fff 0)`,
        mask:       `radial-gradient(farthest-side, transparent calc(100% - 3px), #fff 0)` }}
      aria-label={sourceText("Loading")} />
  );
}
