import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Skeleton — animated pulse placeholder for loading states
// ---------------------------------------------------------------------------

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// TableSkeleton — drop-in loading state for any data table
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  /** Show a header row of skeleton cells */
  showHeader?: boolean;
  className?: string;
}

function TableSkeleton({
  rows = 5,
  columns = 5,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-border", className)}>
      <table className="w-full text-sm">
        {showHeader && (
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="h-12 px-4 text-start">
                  <Skeleton className="h-3.5 w-20" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr
              key={rowIdx}
              className={cn(
                "border-b border-border last:border-0",
                rowIdx % 2 === 1 && "bg-muted/20",
              )}
            >
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="p-4">
                  <Skeleton
                    className={cn(
                      "h-4",
                      colIdx === 0 ? "w-32" : colIdx === columns - 1 ? "w-16" : "w-24",
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSkeleton — full-page loading placeholder (hero + stats + table)
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-label={sourceText("Loading page…")} aria-busy="true">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-muted/60 to-muted/30 p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      {/* Table */}
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton — single card loading placeholder
// ---------------------------------------------------------------------------

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

export { Skeleton, TableSkeleton, PageSkeleton, CardSkeleton };
