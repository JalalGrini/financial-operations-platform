"use client";

import { useMemo } from "react";
import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";

/**
 * Advanced filter panel: multi-select groups plus an optional numeric ceiling.
 *
 * Relationship to the existing `FilterDropdown`: that one is a single-select
 * dropdown per field and stays as it is. This is for the case it cannot express -
 * several checkbox groups and a range reviewed together, applied in one go.
 *
 * Built on `components/ui/popover.tsx`, `checkbox.tsx` and `slider.tsx`, all
 * added alongside this file because Radix ships none of them here and adding a
 * dependency would break the repo's copy-don't-install `node_modules` story.
 *
 * Deliberate choices:
 * - **Controlled.** The caller owns the filter state, because the list query has
 *   to read it. A popover holding its own state would need the parent to mirror
 *   it, which is how two sources of truth start.
 * - **`onReset` is required when anything is active.** The reference design puts
 *   a "Reset all" button in the header unconditionally; a reset that resets
 *   nothing is a dead control, so it is disabled when the filters are untouched.
 * - **The trigger shows a count.** A collapsed panel that hides three active
 *   filters is how users end up reading a filtered list as if it were complete.
 *   The badge is the honesty fix for that.
 */

export interface FilterGroup {
  /** Stable key used in the value map; never translated. */
  key: string;
  /** Already-translated group heading. */
  label: string;
  options: { value: string; label: string }[];
}

export interface FilterRange {
  key: string;
  label: string;
  min?: number;
  max: number;
  step?: number;
  /** Formats the current value, e.g. as money. */
  format?: (value: number) => string;
}

export function FilterPopover({
  groups = [],
  range,
  selected,
  rangeValue,
  onSelectedChange,
  onRangeChange,
  onReset,
  className,
}: {
  groups?: FilterGroup[];
  range?: FilterRange;
  /** groupKey -> chosen option values. */
  selected: Record<string, string[]>;
  rangeValue?: number;
  onSelectedChange: (next: Record<string, string[]>) => void;
  onRangeChange?: (value: number) => void;
  onReset: () => void;
  className?: string;
}) {
  const activeCount = useMemo(
    () =>
      Object.values(selected).reduce((total, values) => total + values.length, 0) +
      (range && rangeValue !== undefined && rangeValue !== range.max ? 1 : 0),
    [selected, range, rangeValue],
  );

  const toggle = (groupKey: string, value: string) => {
    const current = selected[groupKey] ?? [];
    onSelectedChange({
      ...selected,
      [groupKey]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };

  return (
    <Popover
      width={320}
      align="end"
      className="p-5"
      trigger={
        <Button
          variant="outline"
          size="icon"
          className={cn("relative rounded-xl", className)}
          aria-label={sourceText("Filters")}
          title={sourceText("Filters")}
        >
          <Filter className="h-4 w-4" />
          {activeCount > 0 && (
            <span
              className="absolute -top-1.5 -end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange-500 px-1 text-[10px] font-bold tabular-nums text-white"
              aria-label={`${activeCount} ${sourceText("active filters")}`}
            >
              {activeCount}
            </span>
          )}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-tight">
              {sourceText("Advanced filters")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sourceText("Narrow the list by attribute")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-xl px-3 text-[11px] font-bold"
            onClick={onReset}
            disabled={activeCount === 0}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {sourceText("Reset all")}
          </Button>
        </div>

        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {group.label}
            </Label>
            {group.options.map((option) => {
              const id = `filter-${group.key}-${option.value}`;
              const checked = (selected[group.key] ?? []).includes(option.value);
              return (
                // The label is the click target, so there is no div-with-onClick
                // duplicating what the checkbox already does natively - the
                // reference design has both, which double-fires.
                <Label
                  key={option.value}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl p-2 text-sm font-medium transition-colors hover:bg-muted/60"
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onChange={() => toggle(group.key, option.value)}
                  />
                  {option.label}
                </Label>
              );
            })}
          </div>
        ))}

        {range && onRangeChange && rangeValue !== undefined && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {range.label}
              </Label>
              <span className="text-xs font-bold tabular-nums text-brand-blue-600">
                {range.format ? range.format(rangeValue) : rangeValue}
              </span>
            </div>
            <Slider
              value={rangeValue}
              min={range.min ?? 0}
              max={range.max}
              step={range.step ?? 1}
              onChange={(event) => onRangeChange(Number(event.target.value))}
              aria-label={range.label}
            />
          </div>
        )}
      </div>
    </Popover>
  );
}
