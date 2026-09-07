"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Switch -- toggle with smooth thumb animation + optional label/description
// Inspired by ui.watermelon.sh & shadcnblocks.com toggle patterns
// ---------------------------------------------------------------------------

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "checked"> {
  /** Controlled checked state */
  checked?: boolean;
  /** Called when the user toggles the switch */
  onCheckedChange?: (checked: boolean) => void;
  /** Inline label rendered to the right of the toggle */
  label?: string;
  /** Secondary description below the label */
  description?: string;
  /** Visual size */
  size?: "sm" | "default" | "lg";
}

const sizeConfig = {
  sm: {
    track: "h-5 w-9",
    thumb: "size-4",
    translate: "translate-x-4",
  },
  default: {
    track: "h-6 w-11",
    thumb: "size-5",
    translate: "translate-x-5",
  },
  lg: {
    track: "h-7 w-13",
    thumb: "size-6",
    translate: "translate-x-6",
  },
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      label,
      description,
      checked = false,
      onCheckedChange,
      disabled,
      size = "default",
      id,
      ...props
    },
    ref,
  ) => {
    const { track, thumb, translate } = sizeConfig[size];
    // useId must run on every render. It used to sit inside
    // `id ?? React.useId()` behind a `label ? ... : undefined`, so it was only
    // reached for a labelled switch with no explicit id - a conditional hook
    // that changes the hook count as soon as `label` or `id` changes.
    const generatedId = React.useId();
    const switchId = id ?? generatedId;
    const labelId = label ? `${switchId}-label` : undefined;

    const toggle = () => {
      if (!disabled) onCheckedChange?.(!checked);
    };

    const switchEl = (
      <button
        role="switch"
        ref={ref}
        id={switchId}
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          // Track
          "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent",
          "transition-colors duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          track,
          checked
            ? "bg-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
            : "bg-input hover:bg-input/80",
          className,
        )}
        {...props}
      >
        {/* Thumb */}
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-background shadow-md ring-0",
            "transition-transform duration-200 ease-in-out",
            thumb,
            checked ? translate : "translate-x-0",
          )}
        >
          {/* Inner dot that appears when checked */}
          {checked && (
            <span
              className="absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 6 6"
                className="size-1.5 fill-primary"
              >
                <circle cx="3" cy="3" r="3" />
              </svg>
            </span>
          )}
        </span>
      </button>
    );

    if (!label) return switchEl;

    return (
      <div
        className={cn(
          "flex items-start gap-3",
          disabled && "opacity-50",
        )}
      >
        <div className="mt-0.5">{switchEl}</div>
        <div className="flex flex-col gap-0.5">
          <label
            id={labelId}
            htmlFor={switchId}
            className="cursor-pointer text-sm font-medium leading-none text-foreground"
            onClick={toggle}
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground leading-5">
              {description}
            </p>
          )}
        </div>
      </div>
    );
  },
);
Switch.displayName = "Switch";
