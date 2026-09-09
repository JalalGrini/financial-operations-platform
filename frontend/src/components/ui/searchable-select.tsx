"use client";

import * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";

/**
 * A select you can type into.
 *
 * WHY THIS IS NOT THE RADIX SELECT
 * --------------------------------
 * `components/ui/select.tsx` wraps `@radix-ui/react-select`, which has no
 * filtering. The usual answer is Radix Popover + `cmdk`, and neither is
 * available: `@radix-ui/react-popover` is not declared and there is no `command`
 * primitive. Adding either is the wrong trade here - this repo's `node_modules`
 * cannot be reproduced from its own manifest (five packages are already
 * undeclared and the documented instruction is "copy, do not npm install"), so a
 * new dependency would have to be installed by the owner online before anyone
 * else could build. This is built from primitives that are already present.
 *
 * The panel is portalled to `document.body` with fixed coordinates, for the
 * reason recorded in v17.26: `PageHero` is `overflow-hidden rounded-[28px]`, so
 * an absolutely positioned panel inside it gets clipped. It also flips above the
 * trigger when there is no room below and clamps to the viewport.
 *
 * Deliberately no `mounted` flag. The portal is gated on `open`, `open` starts
 * false and only a click sets it, so the DOM provably exists by the time the
 * portal renders - and a setState-in-effect would trip
 * `react-hooks/set-state-in-effect`, which this codebase has had to remove twice.
 *
 * Matching is accent-insensitive: the platform is French-first, so typing "se"
 * must find "Sécurité", and typing "securite" must find it too.
 */

/** cmdk-compatible search field used inside the Combobox panel. */
export const CommandInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function CommandInput(props, ref) {
  return <input ref={ref} {...props} />;
});

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional second line, e.g. a reference or CIN. */
  hint?: string;
  disabled?: boolean;
}

const PANEL_GAP = 6;
const MAX_PANEL_HEIGHT = 320;

/** Strip diacritics and case so "Securite" matches "Sécurité". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  clearable = false,
  className,
  id,
  ariaLabel,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = fold(`${option.label} ${option.hint ?? ""}`);
      // Every whitespace-separated term must appear, so "se ma" narrows further
      // rather than widening the way an OR match would.
      return needle.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [options, query]);

  /** Anchor the panel to the trigger in viewport coordinates. */
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    // Close rather than float somewhere meaningless if the trigger scrolled out
    // of view inside a scrollable panel.
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      setOpen(false);
      return;
    }

    const height = Math.min(
      panelRef.current?.offsetHeight ?? MAX_PANEL_HEIGHT,
      MAX_PANEL_HEIGHT,
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp =
      spaceBelow < height + PANEL_GAP && rect.top > height + PANEL_GAP;

    setPosition({
      top: openUp ? rect.top - height - PANEL_GAP : rect.bottom + PANEL_GAP,
      left: Math.min(
        Math.max(PANEL_GAP, rect.left),
        Math.max(PANEL_GAP, window.innerWidth - rect.width - PANEL_GAP),
      ),
      width: rect.width,
    });
  }, []);

  // Before paint, so the panel never appears at 0,0 and then jumps.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  const commit = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) commit(option);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  };

  const panel =
    open && position
      ? createPortal(
          <div
            ref={panelRef}
            data-efop-overlay=""
            className="fixed z-[100] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: MAX_PANEL_HEIGHT,
            }}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <CommandInput
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onListKeyDown}
                placeholder={searchPlaceholder ?? sourceText("Type to search")}
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-controls={listId}
                aria-autocomplete="list"
              />
            </div>
            <ul
              id={listId}
              role="listbox"
              className="max-h-[264px] overflow-y-auto overscroll-contain p-1"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {emptyMessage ?? sourceText("No match found")}
                </li>
              )}
              {filtered.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(option)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                        index === activeIndex && "bg-accent text-accent-foreground",
                        option.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.hint && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-start",
            !selected && "text-muted-foreground",
          )}
        >
          {selected?.label ?? placeholder ?? sourceText("Select an option")}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label={sourceText("Clear selection")}
            title={sourceText("Clear selection")}
            onClick={(event) => {
              // Stop the trigger from toggling the panel open behind the clear.
              event.stopPropagation();
              onChange("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onChange("");
              }
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
        <ChevronsUpDown
          className="h-4 w-4 shrink-0 opacity-50"
          aria-hidden="true"
        />
      </button>
      {panel}
    </>
  );
}

/** Searchable employee picker (Combobox + CommandInput). */
export function Combobox(
  props: React.ComponentProps<typeof SearchableSelect>,
) {
  return <SearchableSelect {...props} />;
}
