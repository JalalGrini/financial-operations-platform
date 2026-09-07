"use client";
import type { LucideIcon } from "lucide-react";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BorderBeam } from "@/components/ui/border-beam";
import { DotPattern } from "@/components/ui/dot-pattern";
import { PulseIndicator } from "@/components/ui/pulse-indicator";

interface PageHeroProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  chips?: React.ReactNode;
  gradient?: string;
  className?: string;
  /** Show a live pulse indicator next to eyebrow (default true) */
  showLive?: boolean;
}

export function PageHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  chips,
  gradient,
  className,
  showLive = true,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] lg:p-8",
        gradient ??
          "bg-[radial-gradient(circle_at_18%_30%,rgba(255,255,255,0.06),transparent_48%),linear-gradient(145deg,#071324_0%,#1a2755_54%,#394988_100%)]",
        className,
      )}
    >
      {/* BeamBorder orbiting the hero */}
      <BorderBeam duration={7} colorFrom="rgba(255,255,255,0.6)" colorTo="hsl(197,100%,60%)" width={100} />

      {/* Subtle dot texture */}
      <DotPattern
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        dotColor="rgba(255,255,255,1)"
        gap={22}
        dotRadius={1}
      />

      {/* Decorative orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-white/[0.04] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 start-1/3 size-56 rounded-full bg-white/[0.03] blur-2xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          {/* Eyebrow badge — animated slide-in */}
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[.18em] backdrop-blur-sm"
          >
            {showLive && <PulseIndicator color="green" size="sm" />}
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {sourceText(eyebrow)}
          </motion.p>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-black tracking-[-0.04em] text-balance lg:text-5xl"
          >
            {sourceText(title)}
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="line-clamp-1 max-w-2xl text-sm leading-7 text-white/70"
            title={sourceText(description)}
          >
            {sourceText(description)}
          </motion.p>

          {chips && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.14 }}
              className="flex flex-wrap items-center gap-2"
            >
              {chips}
            </motion.div>
          )}
        </div>

        {action && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0"
          >
            {action}
          </motion.div>
        )}
      </div>
    </section>
  );
}

export function PageHeroChip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "border-white/15 bg-white/10 text-white",
    success: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
    warning: "border-amber-400/30 bg-amber-400/15 text-amber-200",
    danger:  "border-rose-400/30 bg-rose-400/15 text-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
