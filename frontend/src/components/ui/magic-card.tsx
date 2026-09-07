'use client';
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MagicCardProps {
  children: React.ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
}

export function MagicCard({ children, className, gradientSize = 200, gradientColor = "hsl(226 41% 38%)", gradientOpacity = 0.08 }: MagicCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -999, y: -999 });
  const [hovered, setHovered] = useState(false);
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("relative overflow-hidden", className)}
      style={hovered ? { background: `radial-gradient(${gradientSize}px circle at ${pos.x}px ${pos.y}px, color-mix(in srgb, ${gradientColor} ${Math.round(gradientOpacity * 100)}%, transparent), transparent 80%)` } : undefined}
    >
      {children}
    </div>
  );
}
