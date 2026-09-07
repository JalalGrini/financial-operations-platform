import { cn } from "@/lib/utils";

type StatusVariant = "active" | "inactive" | "pending" | "error" | "warning" | "info";
interface StatusBadgeProps { status: StatusVariant | string; label?: string; className?: string; }

const COLORS: Record<StatusVariant, string> = {
  active:   "rounded-full bg-[hsl(var(--success)/0.15)]  text-[hsl(var(--success))]  border-transparent",
  inactive: "rounded-full bg-muted text-muted-foreground border-transparent",
  pending:  "rounded-full bg-[hsl(var(--warning)/0.15)]  text-[hsl(var(--warning))]  border-transparent",
  error:    "rounded-full bg-destructive/15  text-destructive  border-transparent",
  warning:  "rounded-full bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border-transparent",
  info:     "rounded-full bg-[hsl(var(--info)/0.15)]  text-[hsl(var(--info))]  border-transparent",
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const color = COLORS[status as StatusVariant] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", color, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? status}
    </span>
  );
}
