"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  glow?: boolean;
  delay?: number;
}

export function AnimatedCard({
  children,
  className,
  onClick,
  glow = false,
  delay = 0,
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        delay,
      }}
      whileHover={{
        y: -3,
        scale: 1.015,
        boxShadow: glow
          ? "0 12px 40px -8px hsl(var(--primary)/0.25)"
          : "0 8px 32px -8px rgba(0,0,0,0.18)",
        transition: { type: "spring", stiffness: 400, damping: 25 },
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-card transition-colors",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
