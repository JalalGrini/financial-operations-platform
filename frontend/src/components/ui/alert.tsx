import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { useState } from "react";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Alert variants — maps semantic tone to EFOP CSS token surface colours
// ---------------------------------------------------------------------------

type AlertVariant = "default" | "destructive" | "success" | "warning" | "info";

const variantStyles: Record<AlertVariant, string> = {
  default:
    "border-border bg-background text-foreground [&>svg]:text-foreground",
  destructive:
    "border-danger/40 bg-danger-surface text-danger [&>svg]:text-danger",
  success:
    "border-success/40 bg-success-surface text-success-foreground [&>svg]:text-success",
  warning:
    "border-warning/40 bg-warning-surface text-warning-foreground [&>svg]:text-warning",
  info:
    "border-info/40 bg-info-surface text-info-foreground [&>svg]:text-info",
};

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  default: null,
  destructive: <AlertCircle className="size-4" />,
  success: <CheckCircle2 className="size-4" />,
  warning: <AlertTriangle className="size-4" />,
  info: <Info className="size-4" />,
};

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  /** Render a dismiss button; fires when user clicks it */
  onDismiss?: () => void;
  /** If true, Alert manages its own open state — becomes self-dismissible */
  dismissible?: boolean;
  /** Icon override — pass null to suppress the default icon */
  icon?: React.ReactNode | null;
}

export function Alert({
  className,
  variant = "default",
  onDismiss,
  dismissible = false,
  icon,
  children,
  ...props
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const showDismiss = dismissible || onDismiss;
  const resolvedIcon = icon === null ? null : icon ?? defaultIcons[variant];

  return (
    <div
      className={cn(
        "relative w-full rounded-xl border p-4",
        "[&>svg~*]:ps-7 [&>svg+div]:translate-y-[-3px]",
        "[&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4",
        variantStyles[variant],
        showDismiss && "pe-10",
        className,
      )}
      role="alert"
      {...props}
    >
      {resolvedIcon}
      {children}
      {showDismiss && (
        <button
          type="button"
          aria-label={sourceText("Dismiss")}
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className={cn(
            "absolute end-3 top-3 rounded-md p-1",
            "text-current/50 hover:text-current transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertTitle
// ---------------------------------------------------------------------------

interface AlertTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function AlertTitle({ className, ...props }: AlertTitleProps) {
  return (
    <h5
      className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// AlertDescription
// ---------------------------------------------------------------------------

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AlertDescription({ className, ...props }: AlertDescriptionProps) {
  return (
    <div
      className={cn("text-sm [&_p]:leading-relaxed opacity-90", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// AlertBanner — full-width top-of-page banner variant
// ---------------------------------------------------------------------------

interface AlertBannerProps {
  variant?: AlertVariant;
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

export function AlertBanner({ variant = "info", message, action, onDismiss }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const icon = defaultIcons[variant];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium",
        variantStyles[variant],
        "border-b rounded-none",
      )}
      role="status"
    >
      <span className="flex items-center gap-2">
        {icon && <span className="[&>svg]:size-4">{icon}</span>}
        {message}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="underline underline-offset-2 hover:no-underline text-current"
          >
            {action.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            aria-label={sourceText("Dismiss")}
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="rounded p-0.5 text-current/60 hover:text-current transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
