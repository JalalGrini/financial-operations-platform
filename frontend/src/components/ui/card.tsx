"use client";
import * as React from "react";
import { cn, designSystem } from "@/lib/design-system";
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined" | "interactive";
  padding?: "none" | "sm" | "default" | "lg";
}
const variantStyles = {
  default: "bg-card text-card-foreground shadow-sm border border-border",
  elevated: "bg-card text-card-foreground shadow-md border border-border",
  outlined: "bg-transparent text-card-foreground border-2 border-border",
  interactive:
    "bg-card text-card-foreground shadow-sm border border-border hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 transition-[transform,box-shadow,border-color] duration-200 cursor-pointer motion-reduce:hover:translate-y-0",
};
const paddingStyles = {
  none: "",
  sm: "p-6",
  default: "p-6",
  lg: "p-6 sm:p-8",
};
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { className, variant = "default", padding = "default", children, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl",
          variantStyles[variant],
          paddingStyles[padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = "Card";
export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";
export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";
export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";
export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";
export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center mt-4", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
// Metric Card - specialized for dashboard metrics
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  iconColor?: string;
  href?: string;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}
export function MetricCard({
  title,
  value,
  change,
  icon,
  iconColor = "primary",
  href,
  trend = "neutral",
  loading,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card variant="default" padding="default">
        <div className="space-y-3">
          <div className="h-4 w-1/4 animate-pulse bg-muted rounded" />
          <div className="h-8 w-1/2 animate-pulse bg-muted rounded" />
          {change !== undefined && (
            <div className="h-4 w-1/3 animate-pulse bg-muted rounded" />
          )}
        </div>
      </Card>
    );
  }
  const iconBgColor = `bg-${iconColor}/10 text-${iconColor}`;
  const trendIcon =
    trend === "up" ? (
      <svg
        className="h-4 w-4 text-green-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
    ) : trend === "down" ? (
      <svg
        className="h-4 w-4 text-red-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V4"
        />
      </svg>
    ) : (
      <svg
        className="h-4 w-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12h14"
        />
      </svg>
    );
  const trendColor =
    trend === "up"
      ? "text-green-600"
      : trend === "down"
        ? "text-red-600"
        : "text-gray-500";
  const cardContent = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {icon && (
          <div className={cn("p-2 rounded-lg", iconBgColor)}>{icon}</div>
        )}
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {trend === "up" && <span className="text-green-600">▲</span>}
          {trend === "down" && <span className="text-red-600">▼</span>}
          {trend === "neutral" && <span className="text-gray-500">●</span>}
          <span className={cn("text-xs font-medium", trendColor)}>
            {Math.abs(change)}%
          </span>
          <span className="text-xs text-muted-foreground">
            <SourceText source="vs last period" />
          </span>
        </div>
      )}
    </div>
  );
  return (
    <Card
      variant="default"
      padding="default"
      className={href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}
    >
      {href ? (
        <a href={href} className="block">
          <CardContent className="pt-0">{cardContent}</CardContent>
        </a>
      ) : (
        <CardContent className="pt-0">{cardContent}</CardContent>
      )}
    </Card>
  );
}
// Stat Card - simpler version for basic stats
interface StatCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
}
export function StatCard({ label, value, description, icon }: StatCardProps) {
  return (
    <Card variant="default" padding="default">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 p-2 rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
