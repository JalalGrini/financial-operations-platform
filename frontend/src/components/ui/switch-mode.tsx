"use client";

import { useExperience } from "@/lib/experience";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { sourceText } from "@/lib/i18n/source-catalog";

export function SwitchMode() {
  const { theme, setTheme } = useExperience();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex h-8 w-16 items-center rounded-full border border-border bg-muted px-1 transition-colors duration-300 hover:bg-muted/80 focus:outline-none"
      aria-label={sourceText("Toggle theme")}
    >
      {/* Track icons */}
      <Sun className="absolute left-1.5 h-3.5 w-3.5 text-amber-500" />
      <Moon className="absolute right-1.5 h-3.5 w-3.5 text-slate-400" />

      {/* Animated knob */}
      <motion.div
        animate={{ x: isDark ? 32 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm"
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 30, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Moon className="h-3 w-3 text-slate-300" />
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ rotate: 30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -30, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sun className="h-3 w-3 text-amber-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </button>
  );
}
