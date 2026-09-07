'use client';
import { cn } from "@/lib/utils";

interface RippleProps { className?: string; numRings?: number; color?: string; }

export function Ripple({ className, numRings = 4, color = "hsl(226 41% 38%)" }: RippleProps) {
  return (
    <div className={cn("absolute inset-0 flex items-center justify-center overflow-hidden", className)}>
      {Array.from({ length: numRings }, (_, i) => (
        <span
          key={i}
          className="animate-ripple absolute rounded-full border opacity-0"
          style={{ width: `${(i + 1) * 80}px`, height: `${(i + 1) * 80}px`, borderColor: color, animationDelay: `${i * 0.5}s`, animationDuration: `${numRings * 0.5}s` }}
        />
      ))}
    </div>
  );
}
