"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FabAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  color?: string;
}

interface FloatingActionButtonProps {
  actions?: FabAction[];
  onClick?: () => void;
  label?: string;
  icon?: ReactNode;
  className?: string;
}

export function FloatingActionButton({
  actions,
  onClick,
  label = "New",
  icon,
  className,
}: FloatingActionButtonProps) {
  const [open, setOpen] = useState(false);
  const hasMenu = actions && actions.length > 0;

  return (
    <div className={cn("fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3", className)}>
      <AnimatePresence>
        {open && hasMenu &&
          actions!.map((action, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.6, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 12 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 28,
                delay: (actions!.length - 1 - i) * 0.05,
              }}
              className="flex items-center gap-3"
            >
              <span className="rounded-full bg-popover px-3 py-1.5 text-sm font-medium shadow-lg border border-border">
                {action.label}
              </span>
              <button
                onClick={() => { action.onClick(); setOpen(false); }}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95",
                  action.color ?? "bg-secondary text-secondary-foreground",
                )}
              >
                {action.icon}
              </button>
            </motion.div>
          ))}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        onClick={hasMenu ? () => setOpen(!open) : onClick}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-primary/20 transition-colors hover:bg-primary/90"
        aria-label={label}
      >
        <motion.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {icon ?? <Plus className="h-6 w-6" />}
        </motion.div>
      </motion.button>
    </div>
  );
}
