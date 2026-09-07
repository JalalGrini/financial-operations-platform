import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DefinitionList -- key/value pair display for detail/show pages
// Inspired by shadcnblocks.com detail card patterns
//
// Usage:
//   <DefinitionList
//     items={[
//       { label: "Employee", value: "Jean Dupont" },
//       { label: "Department", value: "Finance" },
//       { label: "Start Date", value: "01/01/2024" },
//     ]}
//   />
// ---------------------------------------------------------------------------

export interface DefinitionItem {
  label: string;
  value: React.ReactNode;
  /** Span 2 columns (for long values) */
  wide?: boolean;
  /** Show a placeholder when value is empty */
  placeholder?: string;
  /** Extra help text below the value */
  hint?: string;
}

export interface DefinitionListProps {
  items: DefinitionItem[];
  cols?: 1 | 2 | 3;
  className?: string;
}

export function DefinitionList({
  items,
  cols = 2,
  className,
}: DefinitionListProps) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }[cols];

  return (
    <dl className={cn("grid gap-x-8 gap-y-5", colClass, className)}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className={cn(
            "space-y-1",
            item.wide && "sm:col-span-2",
          )}
        >
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {item.value != null && item.value !== "" ? (
              item.value
            ) : (
              <span className="text-muted-foreground/60 italic">
                {item.placeholder ?? "—"}
              </span>
            )}
          </dd>
          {item.hint && (
            <p className="text-xs text-muted-foreground">{item.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// InfoCard -- wraps a DefinitionList inside a Card with a header
// ---------------------------------------------------------------------------

export interface InfoCardProps {
  title?: string;
  action?: React.ReactNode;
  items: DefinitionItem[];
  cols?: 1 | 2 | 3;
  className?: string;
}

export function InfoCard({
  title,
  action,
  items,
  cols = 2,
  className,
}: InfoCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card",
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5">
        <DefinitionList items={items} cols={cols} />
      </div>
    </section>
  );
}
