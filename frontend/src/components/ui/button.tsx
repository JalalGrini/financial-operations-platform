"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn, focusRing, transitionBase } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "link"
    | "subtle"
    | "onHero"
    | "onHeroOutline";
  size?: "xs" | "sm" | "default" | "lg" | "icon";
  loading?: boolean;
  asChild?: boolean;
}

const sizeStyles = {
  xs: "h-8 px-2.5 text-xs gap-1.5",
  sm: "h-9 px-3 text-sm gap-1.5",
  default: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2",
  icon: "h-10 w-10",
};

const variantStyles = {
  primary:
    "gradient-primary border-0 text-white shadow-sm hover:opacity-90 active:opacity-95",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary",
  outline:
    "efop-hover-lift border border-input bg-background/88 hover:bg-accent hover:text-accent-foreground active:bg-accent",
  ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent",
  destructive:
    "efop-hover-lift efop-hover-sheen bg-destructive text-destructive-foreground hover:bg-destructive/92 active:bg-destructive shadow-[0_10px_24px_rgba(220,38,38,.12)]",
  link: "text-primary underline-offset-4 hover:underline",
  subtle: "bg-muted text-muted-foreground hover:bg-muted/80 active:bg-muted",
  /*
   * onHero / onHeroOutline sit on PageHero, which is a fixed dark indigo
   * gradient (#071324 -> #1a2755 -> #394988) with text-white. Their colours are
   * deliberately literal rather than token-based: the hero does NOT follow the
   * light/dark theme, so `bg-card` or `text-foreground` here would invert in
   * dark mode and produce a white-on-white or black-on-dark button. This is the
   * one place in the app where hardcoded white is correct.
   *
   * Extracted from 20 byte-identical copies of these class strings that were
   * pasted across 15 page files. They had not drifted, but restyling the main
   * call-to-action meant editing 15 files, so any future drift was a matter of
   * time.
   */
  onHero:
    "efop-hover-lift bg-white text-slate-950 hover:bg-white/90 active:bg-white shadow-lg",
  onHeroOutline:
    "efop-hover-lift border border-white/30 bg-white/15 text-white hover:bg-white/25 active:bg-white/15",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      loading,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold shadow-sm active:scale-[0.98] motion-reduce:active:scale-100",
          focusRing,
          transitionBase,
          "disabled:pointer-events-none disabled:opacity-50",
          sizeStyles[size],
          variantStyles[variant],
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <svg
                className="me-2 h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = "horizontal", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center",
          orientation === "vertical" ? "flex-col" : "flex-row",
          "rounded-md border border-border bg-background",
          className,
        )}
        role="group"
        {...props}
      >
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return child;
          const isFirst = index === 0;
          const isLast = index === React.Children.count(children) - 1;
          const childProps = child.props as React.HTMLAttributes<HTMLElement>;
          const childClassName = childProps.className || "";
          return React.cloneElement(child as React.ReactElement<any>, {
            className: cn(
              childClassName,
              orientation === "horizontal"
                ? isFirst
                  ? "rounded-e-none"
                  : isLast
                    ? "rounded-s-none"
                    : "rounded-none"
                : isFirst
                  ? "rounded-b-none"
                  : isLast
                    ? "rounded-t-none"
                    : "rounded-none",
              index > 0 &&
                orientation === "horizontal" &&
                "border-s border-border",
              index > 0 &&
                orientation === "vertical" &&
                "border-t border-border",
            ),
          });
        })}
      </div>
    );
  },
);
ButtonGroup.displayName = "ButtonGroup";
