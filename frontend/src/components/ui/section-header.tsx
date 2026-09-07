import * as React from "react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// SectionHeader -- in-page section divider with title, description, and actions
// Inspired by shadcnblocks.com section header patterns
//
// Usage:
//   <SectionHeader
//     title={sourceText("Financial Records")}
//     description="All posted journal entries for this period"
//     action={<Button>Export</Button>}
//   />
// ---------------------------------------------------------------------------

export interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Visually separate from preceding content */
  divider?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

const titleSize = {
  sm: "text-sm font-semibold",
  default: "text-base font-semibold",
  lg: "text-lg font-bold",
};

export function SectionHeader({
  title,
  description,
  action,
  divider = false,
  size = "default",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        divider && "border-t border-border pt-6",
        className,
      )}
    >
      <div>
        <h3 className={cn("text-foreground", titleSize[size])}>{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSection -- Card-wrapped section with header + content
// ---------------------------------------------------------------------------

export interface PageSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  divider?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageSection({
  title,
  description,
  action,
  divider,
  children,
  className,
  contentClassName,
}: PageSectionProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      {title && (
        <div className="border-b border-border px-5 py-4">
          <SectionHeader
            title={title}
            description={description}
            action={action}
            divider={divider}
          />
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}
