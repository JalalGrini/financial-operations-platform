"use client";

/**
 * Toast system for EFOP — powered by Sonner (already in package.json)
 *
 * Usage:
 *   import { toast } from "@/components/ui/toast";
 *   toast.success("Saved successfully");
 *   toast.error("Something went wrong");
 *   toast.info("Processing your request...");
 *   toast.warning("This action cannot be undone");
 *
 * Add <EfopToaster /> once in your root layout (already added to app/layout.tsx).
 */

import { toast as sonnerToast, Toaster as SonnerToaster } from "sonner";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Toaster — drop into layout once
// ---------------------------------------------------------------------------
export function EfopToaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      expand={false}
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast: cn(
            "group rounded-xl border border-border bg-background text-foreground",
            "shadow-[0_16px_40px_hsl(var(--foreground)/0.14)] backdrop-blur-sm",
            "p-4 text-sm font-medium",
          ),
          title: "font-semibold text-foreground",
          description: "text-muted-foreground text-xs mt-0.5",
          actionButton: "bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold",
          cancelButton: "bg-muted text-muted-foreground rounded-lg px-3 py-1.5 text-xs",
          closeButton: "text-muted-foreground hover:text-foreground",
          success: "border-success/40 bg-success-surface",
          error: "border-danger/40 bg-danger-surface",
          warning: "border-warning/40 bg-warning-surface",
          info: "border-info/40 bg-info-surface",
        },
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// toast helpers — consistent API throughout the app
// ---------------------------------------------------------------------------

const iconClass = "size-4 shrink-0";

const toastIcons = {
  success: <CheckCircle2 className={cn(iconClass, "text-success")} />,
  error: <AlertCircle className={cn(iconClass, "text-danger")} />,
  warning: <AlertTriangle className={cn(iconClass, "text-warning")} />,
  info: <Info className={cn(iconClass, "text-info")} />,
  loading: <Loader2 className={cn(iconClass, "animate-spin text-muted-foreground")} />,
};

type ToastOptions = Parameters<typeof sonnerToast>[1];

const toast = {
  /** Green success — use after a save/create/update completes */
  success: (message: string, opts?: ToastOptions) =>
    sonnerToast.success(message, { icon: toastIcons.success, ...opts }),

  /** Red error — use when an API call fails */
  error: (message: string, opts?: ToastOptions) =>
    sonnerToast.error(message, { icon: toastIcons.error, ...opts }),

  /** Amber warning — use for soft warnings */
  warning: (message: string, opts?: ToastOptions) =>
    sonnerToast.warning(message, { icon: toastIcons.warning, ...opts }),

  /** Blue info — use for neutral informational messages */
  info: (message: string, opts?: ToastOptions) =>
    sonnerToast.info(message, { icon: toastIcons.info, ...opts }),

  /** Spinner — use while an async operation is pending; returns toast id */
  loading: (message: string, opts?: ToastOptions) =>
    sonnerToast.loading(message, { icon: toastIcons.loading, ...opts }),

  /** Dismiss a specific or all toasts */
  dismiss: sonnerToast.dismiss,

  /** Promise helper — shows loading → success/error automatically */
  promise: sonnerToast.promise,
};

export { toast };
export { sonnerToast as rawToast };
