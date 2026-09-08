"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";
import { STAT_CARDS_GRID } from "@/components/ui/stat-card";

interface CollapsibleStatsProps {
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}

export function CollapsibleStats({
  children,
  extra,
  className,
}: CollapsibleStatsProps) {
  const [showAll, setShowAll] = useState(false);
  const hasExtra = extra != null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className={STAT_CARDS_GRID}>{children}</div>
      {showAll && extra}
      {hasExtra && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {showAll ? (
            <>
              {sourceText("showLess")}
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              {sourceText("showMore")}
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
