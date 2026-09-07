import { cn } from "@/lib/utils";

/**
 * DotPattern
 * Subtle SVG dot grid for section backgrounds.
 * Pure CSS/SVG — zero runtime cost, no external dep.
 * Inspired by Magic UI dot-pattern.
 */
export function DotPattern({
  className,
  dotColor = "currentColor",
  gap = 20,
  dotRadius = 1,
}: {
  className?: string;
  dotColor?: string;
  gap?: number;
  dotRadius?: number;
}) {
  const id = `dp-${gap}-${dotRadius}`;
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} x="0" y="0" width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={dotRadius} cy={dotRadius} r={dotRadius} fill={dotColor} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
