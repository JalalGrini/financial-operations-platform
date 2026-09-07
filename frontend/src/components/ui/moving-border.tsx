'use client';
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

interface MovingBorderProps { children: React.ReactNode; className?: string; containerClassName?: string; duration?: number; borderRadius?: string; }

export function MovingBorder({ children, className, containerClassName, duration = 3000, borderRadius = "1rem" }: MovingBorderProps) {
  return (
    <div className={cn("relative p-[1px] overflow-hidden", containerClassName)} style={{ borderRadius }}>
      <motion.div
        className="absolute h-8 w-8 opacity-70 pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(197 100% 41%) 0%, transparent 70%)", top: 0, left: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: duration / 1000, repeat: Infinity, ease: "linear" }}
      />
      <div className={cn("relative bg-background", className)} style={{ borderRadius: `calc(${borderRadius} - 1px)` }}>
        {children}
      </div>
    </div>
  );
}
