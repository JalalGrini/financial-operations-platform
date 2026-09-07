"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tabs -- EFOP-branded, inspired by shadcnblocks.com pill + underline variants
// ---------------------------------------------------------------------------

// Radix UI strict types workaround — cast primitives so className/children
// can be forwarded by our wrapper components without TypeScript errors.
const TabsRoot = TabsPrimitive.Root as React.ForwardRefExoticComponent<{
  defaultValue?: string; value?: string; onValueChange?: (v: string) => void;
  dir?: "ltr" | "rtl"; orientation?: "horizontal" | "vertical";
  activationMode?: "automatic" | "manual";
  children?: React.ReactNode; className?: string;
} & React.RefAttributes<HTMLDivElement>>;

const TabsListEl = TabsPrimitive.List as React.ComponentType<
  React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement> & { "data-variant"?: string }
>;

const TabsTriggerEl = TabsPrimitive.Trigger as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
>;

const TabsContentEl = TabsPrimitive.Content as unknown as React.ComponentType<
  React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
>;

const Tabs = TabsRoot;

// TabsList supports two visual variants:
//   "pill"  (default) -- floating pill on muted bg  (shadcn default style, refined)
//   "line"            -- flush underline indicator  (great for page-level tabs)
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: "pill" | "line";
    className?: string;
    children?: React.ReactNode;
  }
>(({ className, variant = "pill", ...props }, ref) => (
  <TabsListEl
    ref={ref}
    data-variant={variant}
    className={cn(
      "flex items-center",
      variant === "pill" &&
        "h-10 gap-1 rounded-xl bg-muted p-1 text-muted-foreground",
      variant === "line" &&
        "gap-0 border-b border-border text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    /** Badge count shown after the label */
    badge?: number | string;
    className?: string;
    children?: React.ReactNode;
  }
>(({ className, children, badge, ...props }, ref) => (
  <TabsTriggerEl
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium",
      "transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      "disabled:pointer-events-none disabled:opacity-50",
      "[div[data-variant=pill]_&]:rounded-lg [div[data-variant=pill]_&]:px-3 [div[data-variant=pill]_&]:py-1.5",
      "[div[data-variant=pill]_&]:data-[state=active]:bg-background",
      "[div[data-variant=pill]_&]:data-[state=active]:text-foreground",
      "[div[data-variant=pill]_&]:data-[state=active]:shadow-sm",
      "[div[data-variant=pill]_&]:data-[state=active]:font-semibold",
      "[div[data-variant=line]_&]:border-b-2 [div[data-variant=line]_&]:border-transparent",
      "[div[data-variant=line]_&]:px-4 [div[data-variant=line]_&]:pb-3 [div[data-variant=line]_&]:-mb-px",
      "[div[data-variant=line]_&]:rounded-none",
      "[div[data-variant=line]_&]:data-[state=active]:border-primary",
      "[div[data-variant=line]_&]:data-[state=active]:text-foreground",
      "[div[data-variant=line]_&]:data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  >
    {children}
    {badge !== undefined && (
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold",
          "bg-muted text-muted-foreground",
          "data-[state=active]:bg-primary/15 data-[state=active]:text-primary",
        )}
      >
        {badge}
      </span>
    )}
  </TabsTriggerEl>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & { className?: string; children?: React.ReactNode }
>(({ className, ...props }, ref) => (
  <TabsContentEl
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "data-[state=active]:animate-in data-[state=active]:fade-in-0",
      "data-[state=inactive]:hidden",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
