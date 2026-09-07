'use client';
import { cn } from "@/lib/utils";
import React from "react";

interface BorderBeamProps {
  className?: string;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  width?: number;
}

export function BorderBeam({
  className,
  duration = 8,
  colorFrom = "hsl(197 100% 41%)",
  colorTo   = "hsl(226 41% 38%)",
  width = 1.5,
}: BorderBeamProps) {
  return (
    <span
      className={cn("border-beam-orbit pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={{
        "--beam-dur":  `${duration}s`,
        "--beam-from": colorFrom,
        "--beam-to":   colorTo,
        "--beam-w":    `${width}px`,
      } as React.CSSProperties}
    />
  );
}
