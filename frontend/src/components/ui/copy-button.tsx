"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// CopyButton -- copy-to-clipboard with animated checkmark feedback
// Inspired by 21st.dev copy button pattern
// ---------------------------------------------------------------------------

export interface CopyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Text to copy to clipboard */
  value: string;
  /** Delay before reverting back to the copy icon (ms) */
  timeout?: number;
  /** Show a text label */
  label?: string;
  /** Visual size */
  size?: "xs" | "sm" | "default";
}

const sizeClass = {
  xs: "size-6 rounded-md",
  sm: "size-8 rounded-lg",
  default: "size-9 rounded-lg",
};

const iconClass = {
  xs: "size-3",
  sm: "size-3.5",
  default: "size-4",
};

export function CopyButton({
  value,
  timeout = 2000,
  label,
  size = "sm",
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    }
  };

  return (
    <button
      type="button"
      aria-label={copied ? "Copied!" : `Copy ${label ?? value}`}
      title={copied ? "Copied!" : "Copy"}
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border border-border",
        "text-muted-foreground transition-all duration-150",
        "hover:border-primary/30 hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        copied && "border-success-border bg-success-surface text-success",
        sizeClass[size],
        label && "px-2.5",
        className,
      )}
      {...props}
    >
      {copied ? (
        <Check className={cn(iconClass[size], "animate-in zoom-in-50 duration-100")} />
      ) : (
        <Copy className={iconClass[size]} />
      )}
      {label && (
        <span className="text-xs font-medium">
          {copied ? "Copied!" : label}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CopyField -- input-like display with inline copy button
// Great for IDs, API keys, reference numbers
// ---------------------------------------------------------------------------

export interface CopyFieldProps {
  value: string;
  label?: string;
  mono?: boolean;
  className?: string;
}

export function CopyField({ value, label, mono = true, className }: CopyFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
      <div
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3",
        )}
      >
        <span
          className={cn(
            "flex-1 truncate text-sm text-foreground",
            mono && "font-mono tracking-tight",
          )}
        >
          {value}
        </span>
        <CopyButton value={value} size="xs" className="border-0 bg-transparent" />
      </div>
    </div>
  );
}
