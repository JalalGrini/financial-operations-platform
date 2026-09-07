'use client';
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

export function Stagger({ children, className, staggerDelay = 0.07 }: { children: React.ReactNode; className?: string; staggerDelay?: number }) {
  return (
    <motion.div className={cn(className)} initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: staggerDelay, delayChildren: 0.05 } } }}>
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={cn(className)} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </motion.div>
  );
}
