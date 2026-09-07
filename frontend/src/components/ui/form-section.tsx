"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// FormSection  --  groups related form fields under a titled card
//
// Inspired by shadcnblocks.com two-column sidebar layout:
//   left column: label + description
//   right column: fields
//
// Usage:
//   <FormSection title={sourceText("Personal Information")} description="Basic identity details">
//     <Input label={sourceText("First name")} ... />
//     <Input label={sourceText("Last name")} ... />
//   </FormSection>
// ---------------------------------------------------------------------------

export interface FormSectionProps {
  title: string;
  description?: string;
  /** Optional icon shown next to the title */
  icon?: React.ReactNode;
  /** Filled card background (default) vs transparent */
  variant?: "card" | "ghost";
  /** Column grid for children (default 1, use 2 for side-by-side fields) */
  columns?: 1 | 2 | 3;
  /** Extra className on the outer wrapper */
  className?: string;
  children: React.ReactNode;
}

export function FormSection({
  title,
  description,
  icon,
  variant = "card",
  columns = 1,
  className,
  children,
}: FormSectionProps) {
  const colClass =
    columns === 3
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border",
        variant === "card" ? "bg-card shadow-sm" : "bg-transparent border-border/50",
        className,
      )}
    >
      {/* Section header */}
      <div
        className={cn(
          "flex items-start gap-3 border-b border-border px-6 py-4",
          variant === "card" ? "bg-muted/30" : "bg-transparent",
        )}
      >
        {icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-none text-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className={cn("grid gap-6 p-6", colClass)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FormField  --  wrapper that handles label + error + hint layout
// ---------------------------------------------------------------------------

export interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Span multiple grid columns */
  colSpan?: 1 | 2 | 3 | "full";
}

export function FormField({
  label,
  error,
  hint,
  required,
  className,
  children,
  colSpan,
}: FormFieldProps) {
  const spanClass =
    colSpan === "full"
      ? "col-span-full"
      : colSpan === 3
        ? "col-span-3"
        : colSpan === 2
          ? "col-span-2"
          : "col-span-1";

  return (
    <div className={cn("flex flex-col space-y-2", spanClass, className)}>
      {label && (
        <label
          className={cn(
            "truncate text-sm font-medium text-foreground",
            required &&
              "after:ms-0.5 after:text-destructive after:content-['*']",
          )}
        >
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormActions  --  sticky footer bar with Cancel / Submit buttons
// ---------------------------------------------------------------------------

export interface FormActionsProps {
  className?: string;
  children: React.ReactNode;
  /** Stick to bottom of viewport on long forms */
  sticky?: boolean;
}

export function FormActions({ className, children, sticky = false }: FormActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card px-5 py-4",
        sticky &&
          "sticky bottom-4 shadow-[0_8px_32px_hsl(var(--foreground)/0.12)] backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormDivider  --  lightweight horizontal rule between sections
// ---------------------------------------------------------------------------

export function FormDivider({ label }: { label?: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      {label && (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      )}
      {label && <div className="h-px flex-1 bg-border" />}
    </div>
  );
}
