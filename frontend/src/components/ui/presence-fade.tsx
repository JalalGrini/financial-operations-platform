'use client';
import { AnimatePresence, motion } from "framer-motion";
import React from "react";

export function PresenceFade({ show, children, duration = 0.2 }: { show: boolean; children: React.ReactNode; duration?: number }) {
  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration, ease: [0.22, 1, 0.36, 1] }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
