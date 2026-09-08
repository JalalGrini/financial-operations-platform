"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { sourceText } from "@/lib/i18n/source-catalog";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "default" | "search" | "error" | "restricted";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  default:    "text-muted-foreground bg-muted/50",
  search:     "text-primary/60 bg-accent",
  error:      "text-destructive/60 bg-destructive/10",
  restricted: "bg-[hsl(var(--warning-surface))] text-[hsl(var(--warning))]",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed px-8 py-14 text-center",
        className,
      )}
    >
      <span className={cn("grid size-16 place-items-center rounded-2xl", TONE_CLASSES[tone])}>
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <div className="max-w-xs space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {(onAction || onSecondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onAction && actionLabel && (
            <Button size="sm" onClick={onAction}>{actionLabel}</Button>
          )}
          {onSecondary && secondaryLabel && (
            <Button size="sm" variant="outline" onClick={onSecondary}>{secondaryLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  icon: Icon,
  title = sourceText("Something went wrong"),
  description,
  actionLabel = sourceText("Try again"),
  onAction,
  className,
}: Pick<EmptyStateProps, "icon" | "title" | "description" | "actionLabel" | "onAction" | "className">) {
  return (
    <EmptyState
      icon={Icon}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      tone="error"
      className={className}
    />
  );
}

export function SearchEmptyState({
  query,
  onClear,
  icon: Icon,
  className,
}: {
  query?: string;
  onClear?: () => void;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <EmptyState
      icon={Icon}
      title={query ? `No results for "${query}"` : sourceText("No results found")}
      description={sourceText("Try adjusting your search or filters to find what you are looking for.")}
      actionLabel={onClear ? sourceText("Clear filters") : undefined}
      onAction={onClear}
      tone="search"
      className={className}
    />
  );
}
