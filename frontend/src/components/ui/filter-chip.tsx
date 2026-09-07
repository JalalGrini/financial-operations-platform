"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// FilterChip -- interactive filter tag with optional remove button
// Inspired by 21st.dev chip / filter patterns
//
// Usage:
//   <FilterChip label={sourceText("Status: Active")} onRemove={() => clearFilter()} />
//   <FilterChipGroup chips={activeFilters} onRemove={removeFilter} onClear={clearAll} />
// ---------------------------------------------------------------------------

export interface FilterChipProps {
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FilterChip({
  label,
  onRemove,
  onClick,
  active = true,
  disabled,
  className,
}: FilterChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-xs items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
        "transition-colors duration-150",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
        onClick && !disabled && "cursor-pointer hover:bg-primary/15",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onClick={disabled ? undefined : onClick}
    >
      <span className="truncate">{label}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          aria-label={`Remove filter: ${label}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full",
            "transition-colors hover:bg-primary/25",
          )}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export interface FilterChipGroupProps {
  chips: Array<{ id: string; label: string }>;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  className?: string;
}

export function FilterChipGroup({
  chips,
  onRemove,
  onClear,
  className,
}: FilterChipGroupProps) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => (
        <FilterChip
          key={chip.id}
          label={chip.label}
          onRemove={onRemove ? () => onRemove(chip.id) : undefined}
        />
      ))}
      {onClear && chips.length > 1 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
        >
          {sourceText("Clear all")}
        </button>
      )}
    </div>
  );
}
