import * as React from "react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Stat + StatGroup -- compact inline statistics display
// Perfect for detail pages showing key numbers in a row
// Inspired by 21st.dev + shadcnblocks.com stat block patterns
//
// Usage:
//   <StatGroup>
//     <Stat label={sourceText("Total Amount")} value="120,500 MAD" />
//     <Stat label={sourceText("Employees")} value="142" trend="+5" />
//     <Stat label={sourceText("Status")} value={<Badge>Active</Badge>} />
//   </StatGroup>
// ---------------------------------------------------------------------------

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** Small delta shown below the value (+N% or -N%) */
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export function Stat({ label, value, trend, trendUp, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
      {trend !== undefined && (
        <p
          className={cn(
            "text-xs font-medium",
            trendUp === true && "text-[hsl(var(--success))]",
            trendUp === false && "text-destructive",
            trendUp === undefined && "text-muted-foreground",
          )}
        >
          {trend}
        </p>
      )}
    </div>
  );
}

export interface StatGroupProps {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  dividers?: boolean;
  className?: string;
}

export function StatGroup({
  children,
  cols = 4,
  dividers = true,
  className,
}: StatGroupProps) {
  const colClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  }[cols];

  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-5",
        colClass,
        dividers &&
          "divide-x-0 sm:divide-x divide-border",
        dividers &&
          "[&>div:not(:first-child)]:sm:pl-6",
        className,
      )}
    >
      {children}
    </dl>
  );
}
