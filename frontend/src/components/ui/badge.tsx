import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "draft"
  | "pending"
  | "approved"
  | "posted"
  | "cancelled"
  | "archived"
  | "missing"
  | "active"
  | "inactive";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default:     "border-transparent bg-primary text-primary-foreground",
  secondary:   "border-transparent bg-secondary text-secondary-foreground",
  outline:     "border-border text-foreground bg-transparent",
  destructive: "rounded-full border-transparent bg-destructive/15 text-destructive",
  success:     "rounded-full border-transparent bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  warning:     "rounded-full border-transparent bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  info:        "rounded-full border-transparent bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]",
  draft:       "border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  pending:     "border border-[hsl(var(--warning-border))] bg-[hsl(var(--warning-surface))] text-[hsl(var(--warning))]",
  approved:    "border border-[hsl(var(--success-border))] bg-[hsl(var(--success-surface))] text-[hsl(var(--success))]",
  posted:      "border border-[hsl(var(--info-border))] bg-[hsl(var(--info-surface))] text-[hsl(var(--info))]",
  cancelled:   "border border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-surface))] text-destructive",
  archived:    "border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-75",
  missing:     "border border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-surface))] text-destructive",
  active:      "border border-[hsl(var(--success-border))] bg-[hsl(var(--success-surface))] text-[hsl(var(--success))]",
  inactive:    "border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusDot({ variant = "default", className }: { variant?: BadgeVariant; className?: string }) {
  const DOT: Record<BadgeVariant, string> = {
    default: "bg-primary",
    secondary: "bg-secondary-foreground",
    outline: "bg-muted-foreground",
    destructive: "bg-destructive",
    success: "bg-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]",
    info: "bg-[hsl(var(--info))]",
    draft: "bg-muted-foreground",
    pending: "bg-[hsl(var(--warning))]",
    approved: "bg-[hsl(var(--success))]",
    posted: "bg-[hsl(var(--info))]",
    cancelled: "bg-destructive",
    archived: "bg-muted-foreground opacity-60",
    missing: "bg-destructive",
    active: "bg-[hsl(var(--success))]",
    inactive: "bg-muted-foreground",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT[variant] ?? "bg-primary", className)}
    />
  );
}
