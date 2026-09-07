import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Amount -- formatted currency / numeric display
// Tailored for EFOP financial records (MAD, EUR, USD)
// Inspired by ui.watermelon.sh data display patterns
// ---------------------------------------------------------------------------

export interface AmountProps {
  value: number | string | null | undefined;
  currency?: string;
  locale?: string;
  /** Show sign prefix (+/-) for delta values */
  signed?: boolean;
  /** Font size class */
  size?: "xs" | "sm" | "default" | "lg" | "xl" | "2xl";
  /** Color-code based on positive/negative */
  colorize?: boolean;
  className?: string;
}

const sizeClass = {
  xs: "text-xs",
  sm: "text-sm",
  default: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl font-black",
};

export function Amount({
  value,
  currency = "MAD",
  locale = "fr-MA",
  signed = false,
  size = "default",
  colorize = false,
  className,
}: AmountProps) {
  if (value == null || value === "") {
    return (
      <span className={cn("text-muted-foreground", sizeClass[size], className)}>
        &mdash;
      </span>
    );
  }

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) {
    return (
      <span className={cn("text-muted-foreground", sizeClass[size], className)}>
        {value}
      </span>
    );
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: signed ? "always" : "auto",
  }).format(num);

  return (
    <span
      className={cn(
        "tabular-nums font-semibold",
        sizeClass[size],
        colorize && num > 0 && "text-[hsl(var(--success))]",
        colorize && num < 0 && "text-destructive",
        colorize && num === 0 && "text-muted-foreground",
        className,
      )}
    >
      {formatted}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AmountDelta -- shows "+1 234,00" or "-1 234,00" with arrow
// ---------------------------------------------------------------------------

export function AmountDelta({
  value,
  currency = "MAD",
  className,
}: Pick<AmountProps, "value" | "currency" | "className">) {
  if (value == null || value === "") return null;
  const num = typeof value === "string" ? parseFloat(value) : (value as number);
  if (isNaN(num)) return null;

  return (
    <Amount
      value={num}
      currency={currency}
      signed
      colorize
      size="sm"
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// AmountCell -- compact table cell with right-aligned amount
// ---------------------------------------------------------------------------

export function AmountCell({
  value,
  currency = "MAD",
  className,
}: Pick<AmountProps, "value" | "currency" | "className">) {
  return (
    <div className={cn("text-end tabular-nums", className)}>
      <Amount value={value} currency={currency} />
    </div>
  );
}
