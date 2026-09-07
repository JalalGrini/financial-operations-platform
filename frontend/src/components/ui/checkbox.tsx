"use client";

import { forwardRef } from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox built on a real `<input type="checkbox">`.
 *
 * `@radix-ui/react-checkbox` is not a declared dependency, and a native input is
 * genuinely the better choice here: it is focusable, form-associable, announced
 * correctly by screen readers and supports `indeterminate` with no JS beyond
 * setting the property. The visual box is a sibling overlay driven by
 * `peer-checked`, so the input stays the accessibility surface rather than being
 * replaced by a div with `role="checkbox"`.
 *
 * Brand-coloured when checked, using the logo ramp rather than a hardcoded hex.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    indeterminate?: boolean;
  }
>(({ className, indeterminate = false, ...props }, ref) => (
  <span className="relative inline-flex shrink-0 items-center">
    <input
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="checkbox"
      className={cn(
        "peer h-4.5 w-4.5 cursor-pointer appearance-none rounded-md border border-input bg-background",
        "checked:border-brand-blue-500 checked:bg-brand-blue-500",
        "indeterminate:border-brand-blue-500 indeterminate:bg-brand-blue-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
    {/* pointer-events-none so the glyph never swallows the click. */}
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100">
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      )}
    </span>
  </span>
));
Checkbox.displayName = "Checkbox";
