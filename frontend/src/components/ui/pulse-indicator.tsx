"use client";

import { cn } from "@/lib/utils";

interface PulseIndicatorProps {
  color?: "green" | "amber" | "red" | "blue" | "primary";
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const colorMap = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  primary: "bg-primary",
};

const sizeMap = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PulseIndicator({
  color = "green",
  size = "md",
  label,
  className,
}: PulseIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            colorMap[color],
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full",
            colorMap[color],
            sizeMap[size],
          )}
        />
      </span>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}
