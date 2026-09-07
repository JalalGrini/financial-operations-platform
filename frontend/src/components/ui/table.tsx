import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Table — full EFOP-branded data table system
// ---------------------------------------------------------------------------

/**
 * The wrapper uses `overflow-x-auto`, NOT `overflow-auto overscroll-contain`.
 *
 * It exists so a wide table can scroll sideways. It has no max-height (see
 * `.efop-table-scroll`, which only styles scrollbars), so it could never scroll
 * vertically - yet `overscroll-behavior: contain` still told the browser not to
 * pass a vertical wheel event up to the page. The result: with the cursor
 * anywhere over a table, scrolling did nothing and the page would not move.
 * Reported as "whenever my mouse cursor is on a list I can scroll and I should
 * get it out of the list".
 *
 * Constraining the axis to x removes the trap at its source instead of relying
 * on scroll-chaining heuristics, and keeps the horizontal scrolling the wrapper
 * was actually added for.
 */
const Table = forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="efop-table-scroll relative w-full overflow-x-auto rounded-xl border border-border shadow-sm">
    <table
      ref={ref}
      className={cn("w-full min-w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

// ---------------------------------------------------------------------------
// TableHeader — sticky, blurred
// ---------------------------------------------------------------------------
const TableHeader = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-10 bg-muted [&_tr]:border-b [&_tr]:border-border",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

// ---------------------------------------------------------------------------
// TableBody — zebra rows + branded hover
// ---------------------------------------------------------------------------
const TableBody = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      // Zebra stripes
      "[&_tr:nth-child(even)]:bg-muted/25",
      // Remove border on last row
      "[&_tr:last-child]:border-0",
      className,
    )}
    {...props}
  />
));
TableBody.displayName = "TableBody";

// ---------------------------------------------------------------------------
// TableFooter
// ---------------------------------------------------------------------------
const TableFooter = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border bg-muted/40 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

// ---------------------------------------------------------------------------
// TableRow — hover + selected state
// ---------------------------------------------------------------------------
const TableRow = forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "h-12 border-b border-border/60 transition-colors duration-100",
      // Hover — subtle primary tint
      "hover:bg-primary/5",
      // Selected
      "data-[state=selected]:border-s-2 data-[state=selected]:border-s-primary data-[state=selected]:bg-primary/8",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

// ---------------------------------------------------------------------------
// TableHead — sortable header support
// ---------------------------------------------------------------------------
export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Current sort direction for this column */
  sortDir?: "asc" | "desc" | null;
  /** Make the header a sort button */
  onSort?: () => void;
}

const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, children, sortDir, onSort, ...props }, ref) => {
    const SortIcon =
      sortDir === "asc"
        ? ChevronUp
        : sortDir === "desc"
          ? ChevronDown
          : ChevronsUpDown;

    return (
      <th
        ref={ref}
        className={cn(
          "h-12 px-4 text-start align-middle",
          "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
          "[&:has([role=checkbox])]:pe-0",
          onSort && "cursor-pointer select-none",
          className,
        )}
        onClick={onSort}
        aria-sort={
          sortDir === "asc"
            ? "ascending"
            : sortDir === "desc"
              ? "descending"
              : undefined
        }
        {...props}
      >
        {onSort ? (
          <span className="inline-flex items-center gap-1.5 rounded px-1 -ms-1 hover:text-foreground transition-colors">
            {children}
            <SortIcon
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                sortDir ? "text-primary" : "text-muted-foreground/50",
              )}
            />
          </span>
        ) : (
          children
        )}
      </th>
    );
  },
);
TableHead.displayName = "TableHead";

// ---------------------------------------------------------------------------
// TableCell
// ---------------------------------------------------------------------------
const TableCell = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("px-4 py-3 align-middle [&:has([role=checkbox])]:pe-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

// ---------------------------------------------------------------------------
// TableCaption
// ---------------------------------------------------------------------------
const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

// ---------------------------------------------------------------------------
// TableEmpty — zero-state row inside a table
// ---------------------------------------------------------------------------
export function TableEmpty({ message = "No results found", colSpan = 5 }: { message?: string; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-16 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
