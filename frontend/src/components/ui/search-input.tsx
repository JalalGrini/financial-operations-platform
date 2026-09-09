"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// SearchInput -- standalone search field with clear button + loading state
// Inspired by 21st.dev search input patterns
// ---------------------------------------------------------------------------

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  /** Show results count */
  resultCount?: number;
  className?: string;
  containerClassName?: string;
  /** Delay before the parent query updates. The field itself stays live. */
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  isLoading,
  resultCount,
  placeholder = "Search...",
  className,
  containerClassName,
  debounceMs = 300,
  ...props
}: SearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (draft === value) return;
    if (debounceMs <= 0) {
      onChangeRef.current(draft);
      return;
    }
    const timer = window.setTimeout(() => {
      onChangeRef.current(draft);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, debounceMs, value]);

  const commit = (next: string) => {
    setDraft(next);
    onChangeRef.current(next);
  };

  return (
    <div className={cn("relative", containerClassName)}>
      {/* Search icon or spinner */}
      <span
        className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Search className="size-4" />
        )}
      </span>

      <input
        {...props}
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChangeRef.current(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
        }}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background",
          "ps-10 pe-10 text-sm",
          "placeholder:text-muted-foreground",
          "transition-[border-color,box-shadow] duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
      />

      {/* Clear button */}
      {draft.length > 0 && (
        <button
          type="button"
          aria-label={sourceText("Clear search")}
          onClick={() => {
            commit("");
            inputRef.current?.focus();
          }}
          className={cn(
            "absolute end-3 top-1/2 -translate-y-1/2",
            "grid size-5 place-items-center rounded-full",
            "text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
          )}
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* Result count badge */}
      {resultCount !== undefined && draft.length > 0 && (
        <span
          className={cn(
            "absolute end-9 top-1/2 -translate-y-1/2",
            "rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground",
          )}
        >
          {resultCount}
        </span>
      )}
    </div>
  );
}
