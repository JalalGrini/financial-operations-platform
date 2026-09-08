"use client";
import { useState, useEffect, useRef } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";
import { settingsApi } from "@/features/personnel/api";

export type ViewMode = "card" | "table";

/** Entity list card grid — matches Companies card view. */
export const LIST_CARDS_GRID = "grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3";

const VIEW_MODE_KEYS: Record<string, string> = {
  personnel: "personnelViewMode",
  companies: "companiesViewMode",
  "financial-records": "financialRecordsViewMode",
  inventory: "inventoryViewMode",
  parties: "partiesViewMode",
};

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ mode, onChange, className }: ViewToggleProps) {
  return (
    <div
      className={cn(
        "ms-auto flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1",
        className,
      )}
      role="group"
      aria-label={sourceText("View mode")}
    >
      <button
        type="button"
        aria-label={sourceText("Card view")}
        aria-pressed={mode === "card"}
        onClick={() => onChange("card")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
          mode === "card"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {sourceText("Cards")}
      </button>
      <button
        type="button"
        aria-label={sourceText("Table view")}
        aria-pressed={mode === "table"}
        onClick={() => onChange("table")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
          mode === "table"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutList className="h-3.5 w-3.5" />
        {sourceText("Table")}
      </button>
    </div>
  );
}

/**
 * Per-user view mode preference.
 * Loads from backend on mount; saves to backend (debounced) + localStorage on change.
 * localStorage is the instant/offline fallback; backend is the authoritative store.
 */
export function useViewMode(
  key: string,
  defaultMode: ViewMode = "table",
): [ViewMode, (m: ViewMode) => void] {
  const lsKey = `view-mode:${key}`;
  const prefKey = VIEW_MODE_KEYS[key];

  const stored =
    typeof window !== "undefined" ? localStorage.getItem(lsKey) : null;
  const initial: ViewMode =
    stored === "card" || stored === "table" ? stored : defaultMode;

  const [mode, setModeState] = useState<ViewMode>(initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from backend on mount
  useEffect(() => {
    if (!prefKey) return;
    settingsApi.get().then((prefs) => {
      const remote = (prefs as unknown as Record<string, unknown>)[prefKey];
      if (remote === "card" || remote === "table") {
        setModeState(remote);
        localStorage.setItem(lsKey, remote);
      }
    }).catch(() => { /* offline — keep localStorage value */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    localStorage.setItem(lsKey, m);
    if (!prefKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      settingsApi.update({ [prefKey]: m } as never).catch(() => {});
    }, 500);
  };

  return [mode, setMode];
}
