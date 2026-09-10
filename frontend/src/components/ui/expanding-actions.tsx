"use client";

import React, { useRef, useState, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import { sourceText } from "@/lib/i18n/source-catalog";

export interface ActionItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "success" | "warning";
  disabled?: boolean;
  /**
   * Which server-side permission this action needs.
   *
   * "write"  -> Administrator, Assistant  (hidden from Director, who is read-only)
   * "delete" -> Administrator only
   *
   * Omit ONLY for read-safe actions (View, Download, Print). Anything that
   * mutates data must be tagged, because an untagged action is visible to
   * everyone and will 403 on click for a Director. write-gate-contract.test.ts
   * fails the build if a mutating label is left untagged.
   */
  permission?: "write" | "delete";
}

interface ExpandingActionsProps {
  actions: ActionItem[];
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  direction?: "up" | "left";
  className?: string;
}

const variantClasses = {
  default: "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800",
  danger: "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20",
  success: "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
  warning: "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20",
};

export function ExpandingActions({
  actions,
  triggerLabel,
  triggerIcon,
  direction = "left",
  className,
}: ExpandingActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const layoutId = React.useId();
  const { canWrite, canDelete } = useRole();

  // The permission rule is applied here, once, instead of being hand-written at
  // every call site. Filtering at render time also means a Director never sees
  // a row action that the server would reject.
  const visibleActions = actions.filter((action) => {
    if (action.permission === "write") return canWrite;
    if (action.permission === "delete") return canDelete;
    return true;
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Nothing this role may do: render no trigger at all rather than an empty menu.
  if (visibleActions.length === 0) return null;

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <MotionConfig transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {!open ? (
            <motion.button
              key="trigger"
              layoutId={`expanding-shell-${layoutId}`}
              onClick={() => setOpen(true)}
              style={{ borderRadius: 8 }}
              className="flex h-8 w-8 items-center justify-center bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={sourceText(triggerLabel ?? "Actions")}
            >
              <motion.span layoutId={`expanding-icon-${layoutId}`}>
                {triggerIcon ?? <MoreHorizontal size={16} />}
              </motion.span>
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              layoutId={`expanding-shell-${layoutId}`}
              style={{ borderRadius: 12 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="flex items-center gap-0.5 border border-border/60 bg-popover p-1 shadow-lg"
            >
              {visibleActions.map((action, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, scale: 0.7, x: direction === "left" ? 12 : 0, y: direction === "up" ? 12 : 0 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  transition={{
                    delay: i * 0.04,
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => { action.onClick(); setOpen(false); }}
                  disabled={action.disabled}
                  title={sourceText(action.label)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                    variantClasses[action.variant ?? "default"],
                  )}
                >
                  {action.icon && (
                    <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{action.icon}</span>
                  )}
                  <span className="whitespace-nowrap">{sourceText(action.label)}</span>
                </motion.button>
              ))}
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: visibleActions.length * 0.04, type: "spring", stiffness: 400, damping: 25 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <X size={12} strokeWidth={2.5} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
