'use client';
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface GradientCardProps { children: React.ReactNode; className?: string; spotlightColor?: string; }

export function GradientCard({ children, className, spotlightColor = "hsl(226 41% 38%)" }: GradientCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className={cn("group relative rounded-xl border bg-card p-[1px] transition-shadow duration-300", hovered && "shadow-lg", className)}>
      <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={hovered ? { background: `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, color-mix(in srgb, ${spotlightColor} 12%, transparent), transparent 70%)` } : undefined} />
      <div className="relative rounded-[calc(0.75rem-1px)] bg-card p-4">{children}</div>
    </div>
  );
}
