import * as React from "react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Timeline -- vertical activity / audit log display
// Inspired by shadcnblocks.com + 21st.dev timeline patterns
// Great for audit logs, approval history, activity feeds
//
// Usage:
//   <Timeline>
//     <TimelineItem
//       icon={<CheckCircle />}
//       tone="success"
//       title={sourceText("Approved by HR")}
//       description="All documents validated"
//       timestamp="2025-01-15T10:30:00Z"
//     />
//   </Timeline>
// ---------------------------------------------------------------------------

export interface TimelineItemProps {
  /** Icon element to display in the bullet */
  icon?: React.ReactNode;
  /** Color tone for the bullet ring */
  tone?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  /** Main label */
  title: React.ReactNode;
  /** Secondary text */
  description?: React.ReactNode;
  /** ISO timestamp string or formatted string */
  timestamp?: string;
  /** Extra content below description */
  children?: React.ReactNode;
  /** Whether this is the last item (hides the connecting line) */
  isLast?: boolean;
  className?: string;
}

const toneRing: Record<string, string> = {
  default: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  success: "border-[hsl(var(--success-border))] bg-[hsl(var(--success-surface))] text-[hsl(var(--success))]",
  warning: "border-[hsl(var(--warning-border))] bg-[hsl(var(--warning-surface))] text-[hsl(var(--warning))]",
  danger: "border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-surface))] text-[hsl(var(--danger))]",
  info: "border-[hsl(var(--info-border))] bg-[hsl(var(--info-surface))] text-[hsl(var(--info))]",
};

export function TimelineItem({
  icon,
  tone = "default",
  title,
  description,
  timestamp,
  children,
  isLast = false,
  className,
}: TimelineItemProps) {
  return (
    <div className={cn("relative flex gap-4", className)}>
      {/* Bullet + line */}
      <div className="flex flex-col items-center">
        {/* Bullet */}
        <span
          className={cn(
            "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2",
            toneRing[tone],
          )}
        >
          {icon ? (
            <span className="[&>svg]:size-3.5">{icon}</span>
          ) : (
            <span className="size-2 rounded-full bg-current" />
          )}
        </span>
        {/* Connecting line */}
        {!isLast && (
          <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 pb-6 pt-0.5", isLast && "pb-0")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {timestamp && (
            <time className="shrink-0 text-xs text-muted-foreground">
              {timestamp}
            </time>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

export interface TimelineProps {
  children: React.ReactNode;
  className?: string;
}

export function Timeline({ children, className }: TimelineProps) {
  // Auto-detect last item to hide trailing line
  const items = React.Children.toArray(children);
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((child, idx) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<TimelineItemProps>, {
          isLast: idx === items.length - 1,
        });
      })}
    </div>
  );
}
