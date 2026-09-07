"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Sheet / Drawer -- slide-over panel with backdrop overlay
// Inspired by shadcnblocks.com drawer pattern
//
// Uses React state + portal-free approach (no Radix dependency)
// Compatible with the existing Sheet usage across the app
// ---------------------------------------------------------------------------

const SheetContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({
  open: false,
  setOpen: () => {},
});

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open: controlledOpen, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  className,
  children,
  asChild,
  ...props
}: React.HTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = React.useContext(SheetContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        setOpen(true);
        (children as any).props?.onClick?.(e);
      },
    });
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => setOpen(true)}
      {...props}
    >
      {children}
    </button>
  );
}
SheetTrigger.displayName = "SheetTrigger";

export function SheetClose({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(SheetContext);
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={() => setOpen(false)}
      {...props}
    >
      {children ?? <X className="size-4" />}
    </button>
  );
}
SheetClose.displayName = "SheetClose";

export interface SheetContentProps {
  side?: "top" | "right" | "bottom" | "left";
  size?: "sm" | "default" | "lg" | "xl" | "full";
  className?: string;
  children: React.ReactNode;
  hideCloseButton?: boolean;
}

const sideClasses = {
  right: "end-0 top-0 h-full data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left: "start-0 top-0 h-full data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  top: "start-0 end-0 top-0 data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
  bottom: "start-0 end-0 bottom-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
};

const widthClasses = {
  sm: "w-72",
  default: "w-80 sm:w-96",
  lg: "w-full sm:max-w-lg",
  xl: "w-full sm:max-w-2xl",
  full: "w-full",
};

export function SheetContent({
  side = "right",
  size = "default",
  className,
  children,
  hideCloseButton = false,
}: SheetContentProps) {
  const { open, setOpen } = React.useContext(SheetContext);

  if (!open) return null;

  const isVertical = side === "left" || side === "right";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-50 flex flex-col gap-0 bg-background shadow-2xl",
          "border-border",
          isVertical ? "border-s" : "border-t",
          isVertical ? widthClasses[size] : "h-auto",
          sideClasses[side],
          "animate-in duration-300",
          className,
        )}
      >
        {/* Close button */}
        {!hideCloseButton && (
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">{sourceText("Menu")}</div>
            <SheetClose />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}
SheetContent.displayName = "SheetContent";

// Title and Description for accessibility
export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 border-b border-border px-4 pb-4 pt-1", className)} {...props} />;
}
export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)} {...props} />;
}
export function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-border p-4", className)} {...props} />;
}
