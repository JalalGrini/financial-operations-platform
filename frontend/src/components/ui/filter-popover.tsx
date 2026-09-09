"use client";

import { useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";

/**
 * Advanced filter panel: multi-select groups plus an optional numeric ceiling.
 *
 * Rendered as a centered dialog instead of an anchored popover so a tall set of
 * groups (status + company + person) stays fully on screen. Groups sit in a
 * two-column grid with their own scroll, so they are not stacked into one
 * overflowing column.
 *
 * Controlled: the caller owns filter state because the list query reads it.
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
  const [open, setOpen] = useState(false);
  const [queryByGroup, setQueryByGroup] = useState<Record<string, string>>({});

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

  const columns = groups.length > 1 ? "sm:grid-cols-2" : "grid-cols-1";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn("relative rounded-xl", className)}
        aria-label={sourceText("Filters")}
        title={sourceText("Filters")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQueryByGroup({});
        }}
      >
        <DialogContent size={groups.length > 1 ? "lg" : "sm"}>
          <DialogHeader>
            <DialogTitle>{sourceText("Advanced filters")}</DialogTitle>
            <DialogDescription>
              {sourceText("Narrow the list by attribute")}
            </DialogDescription>
          </DialogHeader>

          <div className={cn("grid gap-5", columns)}>
            {groups.map((group) => {
              const query = queryByGroup[group.key] ?? "";
              const needle = query.trim().toLowerCase();
              const options = needle
                ? group.options.filter((option) =>
                    option.label.toLowerCase().includes(needle),
                  )
                : group.options;

              return (
                <div key={group.key} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                      {sourceText(group.label)}
                    </Label>
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {(selected[group.key] ?? []).length > 0
                        ? `${(selected[group.key] ?? []).length} ${sourceText("selected")}`
                        : `${group.options.length} ${sourceText("options")}`}
                    </span>
                  </div>
                  {group.options.length > 6 && (
                    <Input
                      value={query}
                      onChange={(event) =>
                        setQueryByGroup((prev) => ({
                          ...prev,
                          [group.key]: event.target.value,
                        }))
                      }
                      placeholder={sourceText("Search...")}
                      className="h-9"
                    />
                  )}
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-border/70 p-1">
                    {options.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        {sourceText("No filter options yet")}
                      </p>
                    ) : (
                      options.map((option) => {
                        const id = `filter-${group.key}-${option.value}`;
                        const checked = (selected[group.key] ?? []).includes(
                          option.value,
                        );
                        return (
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
                            {sourceText(option.label)}
                          </Label>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            {range && onRangeChange && rangeValue !== undefined && (
              <div className={cn("flex flex-col gap-2", groups.length > 1 && "sm:col-span-2")}>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {sourceText(range.label)}
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
                  aria-label={sourceText(range.label)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={onReset}
              disabled={activeCount === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {sourceText("Reset all")}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {sourceText("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
