'use client';
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function CounterBadge({ count, className, max = 99 }: { count: number; className?: string; max?: number }) {
  const display = count > max ? `${max}+` : count;
  if (count <= 0) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.span key={String(display)} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 bg-destructive text-[0.65rem] font-bold text-destructive-foreground", className)}>
        {display}
      </motion.span>
    </AnimatePresence>
  );
}
