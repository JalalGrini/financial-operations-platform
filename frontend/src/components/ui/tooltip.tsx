"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tooltip -- Radix UI powered, EFOP-branded
// Inspired by shadcnblocks.com tooltip pattern
// ---------------------------------------------------------------------------

/** Wrap your page (or layout) with <TooltipProvider> once */
const TooltipProvider = TooltipPrimitive.Provider;

/** The element that triggers the tooltip on hover/focus */
const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> {
  /**
   * Tooltip body. When given, the matching `TooltipContent` is rendered for
   * you, so a caller can write
   *
   *   <Tooltip content="Show archived"><TooltipTrigger asChild>…</TooltipTrigger></Tooltip>
   *
   * Every call site in this app uses that shorter form. Radix's `Root` has no
   * `content` prop and silently drops unknown props, so before this existed
   * the prop was accepted at runtime and no tooltip body was ever rendered -
   * the tooltips looked wired up but displayed nothing. Composing
   * `TooltipContent` by hand still works: omit `content`.
   */
  content?: React.ReactNode;
  /** Which side the auto-rendered `content` appears on. */
  side?: "top" | "right" | "bottom" | "left";
  children?: React.ReactNode;
}

/** Root Tooltip */
function Tooltip({ content, side = "top", children, ...props }: TooltipProps) {
  return (
    <TooltipPrimitive.Root {...props}>
      {children}
      {content != null && <TooltipContent side={side}>{content}</TooltipContent>}
    </TooltipPrimitive.Root>
  );
}

/** The tooltip popup */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Shape
        "z-50 max-w-xs overflow-hidden rounded-lg px-3 py-1.5",
        // Colors
        "border border-border/80 bg-popover/97 text-popover-foreground",
        // Shadow + blur
        "shadow-[0_12px_28px_hsl(var(--foreground)/0.14)] backdrop-blur-sm",
        // Typography
        "text-xs font-medium leading-5",
        // Animations
        "animate-in fade-in-0 zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// ---------------------------------------------------------------------------
// SimpleTooltip -- one-liner convenience wrapper
//
// Usage:
//   <SimpleTooltip content="Delete this record">
//     <Button variant="ghost" size="icon"><Trash2 /></Button>
//   </SimpleTooltip>
// ---------------------------------------------------------------------------

export interface SimpleTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
}

export function SimpleTooltip({
  content,
  children,
  side = "top",
  delayDuration = 300,
}: SimpleTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
