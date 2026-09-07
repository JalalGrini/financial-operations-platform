"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completeRef = useRef<NodeJS.Timeout | null>(null);
  const prevPath = useRef<string>(pathname);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Start progress
    setVisible(true);
    setProgress(15);

    // Simulate incremental progress
    let current = 15;
    timerRef.current = setInterval(() => {
      current = Math.min(current + Math.random() * 18 + 5, 88);
      setProgress(current);
    }, 200);

    // Complete and fade out
    completeRef.current = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      setTimeout(() => setVisible(false), 400);
    }, 600);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (completeRef.current) clearTimeout(completeRef.current);
    };
  }, [pathname]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[999] h-[3px] pointer-events-none"
        >
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.3 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
