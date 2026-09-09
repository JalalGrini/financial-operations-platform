"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";
import { sourceText } from "@/lib/i18n/source-catalog";
import { Popover } from "@/components/ui/popover";

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
  className,
}: ExpandingActionsProps) {
  const { canWrite, canDelete } = useRole();
  const [open, setOpen] = useState(false);

  const visibleActions = actions.filter((action) => {
    if (action.permission === "write") return canWrite;
    if (action.permission === "delete") return canDelete;
    return true;
  });

  if (visibleActions.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={220}
      align="end"
      className="p-1"
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none",
            className,
          )}
          title={sourceText(triggerLabel ?? "Actions")}
        >
          {triggerIcon ?? <MoreHorizontal size={16} />}
        </button>
      }
    >
      <div className="flex flex-col">
        {visibleActions.map((action, i) => (
          <button
            key={`${action.label}-${i}`}
            type="button"
            onClick={() => {
              action.onClick();
              setOpen(false);
            }}
            disabled={action.disabled}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2.5 text-start text-xs font-medium transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              variantClasses[action.variant ?? "default"],
            )}
          >
            {action.icon && (
              <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{action.icon}</span>
            )}
            <span className="truncate">{sourceText(action.label)}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
