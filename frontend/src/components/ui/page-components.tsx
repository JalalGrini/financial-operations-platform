import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";

interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  separator?: React.ReactNode;
}

export function Breadcrumb({
  items,
  className,
  separator = <ChevronRight className="h-4 w-4" />,
}: BreadcrumbProps) {
  return (
    <nav
      className={cn("flex items-center gap-1.5 text-sm", className)}
      aria-label={sourceText("Breadcrumb")}
    >
      <ol className="flex items-center gap-1.5">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {index < items.length - 1 && (
              <span className="text-muted-foreground" aria-hidden="true">
                {separator}
              </span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors",
                  item.isCurrent && "font-medium text-foreground",
                )}
                aria-current={item.isCurrent ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1.5 text-foreground font-medium",
                  item.isCurrent && "font-medium",
                )}
                aria-current={item.isCurrent ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface PageHeaderProps {
  title?: string;
  titleSource?: string;
  description?: string;
  descriptionSource?: string;
  action?: React.ReactNode;
  /**
   * Optional glyph rendered beside the title. Already a rendered node (e.g.
   * `<ArrowLeftRight className="h-6 w-6" />`) rather than a component type,
   * matching how the Transfers pages call this and how `MetricCard`/
   * `StatCard` in this same file take their `icon`.
   */
  icon?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({
  title,
  titleSource,
  description,
  descriptionSource,
  action,
  icon,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const resolvedTitle = titleSource ?? title ?? "";
  const resolvedDescription = descriptionSource ?? description;
  return (
    <div
      className={cn(
        "relative mb-8 min-w-0 overflow-hidden border-b border-border pb-6",
        className,
      )}
    >
      {/* Gradient accent top line */}
      <div
        aria-hidden="true"
        className="absolute -top-px left-0 h-[3px] w-full overflow-hidden rounded-t-sm"
      >
        <div className="h-full w-3/5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
      </div>
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="flex min-w-0 items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground">
            {icon && (
              <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                {icon}
              </span>
            )}
            <span className="truncate">
              <SourceText source={resolvedTitle} />
            </span>
          </h1>
          {resolvedDescription && (
            <p className="mt-0.5 line-clamp-1 max-w-2xl text-sm text-muted-foreground">
              <SourceText source={resolvedDescription} />
            </p>
          )}
        </div>
        {action && (
          <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color:
    | "blue"
    | "green"
    | "purple"
    | "red"
    | "orange"
    | "indigo"
    | "amber"
    | "gray";
  href?: string;
  loading?: boolean;
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  color,
  href,
  loading,
}: MetricCardProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    green: "bg-green-500/10 text-green-600 border-green-500/20",
    purple: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    red: "bg-red-500/10 text-red-600 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    indigo: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    gray: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-6 transition-all duration-200",
        "hover:shadow-lg hover:border-primary/20",
        href && "cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            <SourceText source={title} />
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <div className="h-8 w-24 animate-pulse bg-muted rounded" />
            ) : (
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {value}
              </span>
            )}
            {change !== undefined && !loading && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  change >= 0 ? "text-green-600" : "text-red-600",
                )}
              >
                {change >= 0 ? "↑" : "↓"}
                <span>{Math.abs(change)}%</span>
                {changeLabel && (
                  <span className="text-muted-foreground">{changeLabel}</span>
                )}
              </span>
            )}
          </div>
        </div>
        <div
          className={cn("flex-shrink-0 p-3 rounded-lg", colorClasses[color])}
        >
          {icon}
        </div>
      </div>
      {href && (
        <a
          href={href}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          aria-label={`View ${title} details`}
        />
      )}
    </article>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  color,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            <SourceText source={label} />
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {trend && (
            <div
              className={cn(
                "mt-2 flex items-center gap-1 text-xs font-medium",
                trend.value >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {trend.value >= 0 ? "↑" : "↓"}
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && <div className={cn("p-2 rounded-lg", color)}>{icon}</div>}
      </div>
    </div>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  href: string;
  color: string;
  className?: string;
}

export function ActionCard({
  icon,
  title,
  description,
  href,
  color,
  className,
}: ActionCardProps) {
  return (
    <a
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 border rounded-xl hover:bg-accent hover:border-primary/50 transition-all group",
        className,
      )}
    >
      <div
        className={cn(
          "p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors",
          color,
        )}
      >
        {icon}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </a>
  );
}
