"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Base shimmer skeleton pulse ─────────────────────────────────────────────
function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/5"
        animate={{ translateX: ["-100%", "200%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "linear", repeatDelay: 0.3 }}
      />
    </div>
  );
}

// ── Text line skeleton ─────────────────────────────────────────────────────
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-3/5" : i % 2 === 0 ? "w-full" : "w-11/12",
          )}
        />
      ))}
    </div>
  );
}

// ── Table row skeleton ─────────────────────────────────────────────────────
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  const widths = ["w-8", "w-32", "w-24", "w-20", "w-16", "w-12"];
  return (
    <div className="flex items-center gap-4 border-b border-border/40 px-4 py-3.5 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-8 shrink-0 rounded-full" : widths[i % widths.length],
            i === cols - 1 ? "ms-auto" : "",
          )}
        />
      ))}
    </div>
  );
}

// ── Full table skeleton ─────────────────────────────────────────────────────
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/60 bg-muted/30 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className={cn("h-3.5", i === 0 ? "w-8" : "w-20", i === cols - 1 ? "ms-auto w-16" : "")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <SkeletonTableRow cols={cols} />
        </motion.div>
      ))}
    </div>
  );
}

// ── Card skeleton ─────────────────────────────────────────────────────────
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-5 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Shimmer className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-2/3" />
          <Shimmer className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

// ── Stat card skeleton ─────────────────────────────────────────────────────
export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-8 w-8 rounded-xl" />
      </div>
      <Shimmer className="h-9 w-24 mb-1" />
      <Shimmer className="h-3 w-20" />
    </div>
  );
}

// ── Page hero skeleton ─────────────────────────────────────────────────────
export function SkeletonHero() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-muted p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Shimmer className="h-12 w-12 rounded-2xl shrink-0" />
          <div className="space-y-2">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-7 w-48" />
            <Shimmer className="h-3 w-64" />
          </div>
        </div>
        <Shimmer className="h-10 w-32 rounded-full" />
      </div>
    </div>
  );
}

// ── Stats strip skeleton ─────────────────────────────────────────────────────
export function SkeletonStatsStrip({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
        >
          <SkeletonStatCard />
        </motion.div>
      ))}
    </div>
  );
}

// ── Form skeleton ─────────────────────────────────────────────────────────
export function SkeletonForm({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          className="space-y-1.5"
        >
          <Shimmer className="h-3.5 w-28" />
          <Shimmer className="h-10 w-full rounded-xl" />
        </motion.div>
      ))}
    </div>
  );
}

// ── Full page loading skeleton ─────────────────────────────────────────────
export function SkeletonPage({ tableRows = 6, statCount = 4 }: { tableRows?: number; statCount?: number }) {
  return (
    <div className="space-y-6">
      <SkeletonHero />
      <SkeletonStatsStrip count={statCount} />
      <SkeletonTable rows={tableRows} />
    </div>
  );
}

// ── Animated loading indicator with cycling labels ──────────────────────────
export function LoadingIndicator({
  labels = ["Loading data", "Fetching records", "Almost there"],
  progress = "75%",
}: {
  labels?: string[];
  progress?: string;
}) {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % labels.length), 1800);
    return () => clearInterval(t);
  }, [labels.length]);

  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="relative flex w-full max-w-xs items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={idx}
            initial={{ opacity: 0, y: 8, scale: 1.2, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)", scale: 0.9 }}
            transition={{ type: "spring", stiffness: 600, damping: 100, mass: 10 }}
            className="text-lg font-semibold text-muted-foreground"
          >
            {labels[idx]}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="h-3 w-64 overflow-hidden rounded-full border border-border/50 bg-muted shadow-inner">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: progress }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative h-full overflow-hidden rounded-full bg-primary"
        >
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-y-0 w-full bg-gradient-to-r from-primary/10 via-white/30 to-primary/10"
          />
        </motion.div>
      </div>
    </div>
  );
}

// Make sure React is imported for hooks inside this file
import React from "react";
import { AnimatePresence } from "framer-motion";
