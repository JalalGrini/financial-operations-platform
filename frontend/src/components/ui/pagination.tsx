"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Pagination -- full-featured page navigator
// Inspired by shadcnblocks.com + 21st.dev pagination patterns
//
// Usage:
//   <Pagination
//     page={currentPage}
//     pageCount={totalPages}
//     onPageChange={setPage}
//     pageSize={pageSize}
//     onPageSizeChange={setPageSize}
//     totalCount={total}
//   />
// ---------------------------------------------------------------------------

export interface PaginationProps {
  /** Current 1-based page number */
  page: number;
  /** Total number of pages */
  pageCount: number;
  /** Called when user navigates to a different page */
  onPageChange: (page: number) => void;
  /** Current items per page */
  pageSize?: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Called when user changes page size */
  onPageSizeChange?: (size: number) => void;
  /** Total row count -- shows "X results" when provided */
  totalCount?: number;
  /** Compact mode for tight layouts */
  compact?: boolean;
  className?: string;
}

function PaginationButton({
  children,
  active,
  disabled,
  onClick,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function buildPageList(
  page: number,
  pageCount: number,
  siblings = 1,
): Array<number | "..."> {
  // Always show first + last; show siblings around current; fill with ellipsis
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const totalPages = Math.max(1, pageCount);
  if (totalPages <= 7) return range(1, totalPages);

  const leftSibling = Math.max(page - siblings, 2);
  const rightSibling = Math.min(page + siblings, totalPages - 1);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const pages: Array<number | "..."> = [1];
  if (showLeftEllipsis) pages.push("...");
  pages.push(...range(leftSibling, rightSibling));
  if (showRightEllipsis) pages.push("...");
  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
  totalCount,
  compact = false,
  className,
}: PaginationProps) {
  const pages = buildPageList(page, pageCount);
  const canPrev = page > 1;
  const canNext = page < pageCount;

  if (pageCount <= 1 && !totalCount) return null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 sm:flex-row sm:justify-between",
        className,
      )}
      role="navigation"
      aria-label={sourceText("Pagination")}
    >
      {/* Left: results count + page size selector */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {totalCount !== undefined && (
          <span>
            {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""}
          </span>
        )}
        {onPageSizeChange && pageSize !== undefined && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs">{sourceText("Per page:")}</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className={cn(
                "h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                "transition-colors",
              )}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: page navigator */}
      <div className="flex items-center gap-1">
        {/* First page */}
        {!compact && (
          <PaginationButton
            onClick={() => onPageChange(1)}
            disabled={!canPrev}
            aria-label={sourceText("Go to first page")}
          >
            <ChevronsLeft className="size-4" />
          </PaginationButton>
        )}

        {/* Previous */}
        <PaginationButton
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label={sourceText("Go to previous page")}
        >
          <ChevronLeft className="size-4" />
        </PaginationButton>

        {/* Page numbers */}
        {!compact &&
          pages.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground"
                aria-hidden="true"
              >
                <MoreHorizontal className="size-4" />
              </span>
            ) : (
              <PaginationButton
                key={p}
                active={p === page}
                onClick={() => onPageChange(p as number)}
                aria-label={`Go to page ${p}`}
              >
                {p}
              </PaginationButton>
            ),
          )}

        {/* Compact mode: just show X / Y */}
        {compact && (
          <span className="px-3 text-sm text-muted-foreground">
            {page} / {Math.max(1, pageCount)}
          </span>
        )}

        {/* Next */}
        <PaginationButton
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label={sourceText("Go to next page")}
        >
          <ChevronRight className="size-4" />
        </PaginationButton>

        {/* Last page */}
        {!compact && (
          <PaginationButton
            onClick={() => onPageChange(pageCount)}
            disabled={!canNext}
            aria-label={sourceText("Go to last page")}
          >
            <ChevronsRight className="size-4" />
          </PaginationButton>
        )}
      </div>
    </div>
  );
}
