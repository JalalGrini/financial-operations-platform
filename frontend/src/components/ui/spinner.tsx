import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Spinner -- simple animated loader
// ---------------------------------------------------------------------------

export interface SpinnerProps {
  size?: "xs" | "sm" | "default" | "lg" | "xl";
  className?: string;
  /** Screen-reader label */
  label?: string;
}

const sizeClass = {
  xs: "size-3",
  sm: "size-4",
  default: "size-6",
  lg: "size-8",
  xl: "size-12",
};

export function Spinner({ size = "default", className, label = "Loading..." }: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex items-center justify-center", className)}>
      <svg
        className={cn("animate-spin text-current", sizeClass[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-80"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// FullPageSpinner -- centered full-screen loader
// ---------------------------------------------------------------------------

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm"
      role="status"
      aria-label={label ?? "Loading..."}
    >
      <Spinner size="xl" className="text-primary" />
      {label && (
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineLoader -- centered loader for card/section loading states
// ---------------------------------------------------------------------------

export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
      <Spinner size="lg" className="text-primary" />
      {label && (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
