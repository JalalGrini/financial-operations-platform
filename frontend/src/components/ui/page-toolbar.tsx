"use client";

import * as React from "react";
import { Search, SlidersHorizontal, X, Plus, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// PageToolbar  --  consistent search + filter bar used across all list pages
//
// Inspired by 21st.dev / shadcnblocks.com table toolbar pattern:
//   [ Search input ]  [ Filter chips ]  [ ... ]  [ + New ]  [ Export ]
//
// Usage:
//   <PageToolbar
//     search={query}
//     onSearch={setQuery}
//     searchPlaceholder="Search personnel..."
//     actions={<Button onClick={onCreate}><Plus /> New</Button>}
//   />
// ---------------------------------------------------------------------------

export interface PageToolbarProps {
  /** Controlled search value */
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter controls rendered between the search and the actions */
  filters?: React.ReactNode;
  /** Right-side action buttons (e.g. New, Export) */
  actions?: React.ReactNode;
  /** Show a results count pill */
  resultCount?: number;
  /** Extra className on the toolbar wrapper */
  className?: string;
}

export function PageToolbar({
  search = "",
  onSearch,
  searchPlaceholder = "Search...",
  filters,
  actions,
  resultCount,
  className,
}: PageToolbarProps) {
  const hasSearch = onSearch !== undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {/* Left: search + filters */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {hasSearch && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search
              className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(
                "h-10 w-full rounded-xl border border-input bg-background ps-9 pe-9 text-sm",
                "placeholder:text-muted-foreground",
                "transition-[border-color,box-shadow] duration-200",
                "focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
                "disabled:opacity-50",
              )}
            />
            {search && (
              <button
                type="button"
                aria-label={sourceText("Clear search")}
                onClick={() => onSearch("")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Inline filter controls */}
        {filters && (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        )}

        {/* Results count pill */}
        {resultCount !== undefined && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {resultCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolbarFilter  --  a single filter select inside the toolbar
// ---------------------------------------------------------------------------

export interface ToolbarFilterProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}

export function ToolbarFilter({
  label,
  value,
  options,
  onChange,
  icon,
}: ToolbarFilterProps) {
  const isActive = value !== "" && value !== "all";

  return (
    <div className="relative">
      {icon && (
        <span className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(
          "h-10 rounded-xl border bg-background text-sm font-medium",
          "transition-[border-color,box-shadow] duration-200",
          "focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
          "pe-8 appearance-none",
          icon ? "ps-8" : "ps-3",
          isActive
            ? "border-primary/50 bg-primary/5 text-primary"
            : "border-input text-muted-foreground",
        )}
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <SlidersHorizontal
        className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActiveFilters  --  dismissible chips showing current filter values
// ---------------------------------------------------------------------------

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({ filters }: { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary"
        >
          {filter.label}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`Remove ${filter.label} filter`}
            className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
