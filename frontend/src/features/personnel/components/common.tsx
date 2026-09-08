"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SourceText } from "@/components/i18n/SourceText";
/**
 * Common Personnel UI Components
 * Reusable components for the Personnel feature
 */
import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { statusColors, statusLabels } from "@/features/personnel/api";
import {
  PersonnelStatus,
  EmploymentStatus,
  PayrollStatus,
  CNSSMonthlyStatus,
  CNSSMonthlySituation,
  CNSSSituation,
} from "@/features/personnel/types";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

function humanizeEnumValue(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(" ");
}

interface StatusBadgeProps {
  status: string;
  variant?:
    | "personnel"
    | "employment"
    | "payroll"
    | "cnssMonthly"
    | "cnssSituation"
    | "cnssMonthlySituation";
  className?: string;
  showDot?: boolean;
}
export function StatusBadge({
  status,
  variant = "personnel",
  className,
  showDot = true,
}: StatusBadgeProps) {
  let colorClass = "bg-gray-100 text-gray-800";
  let label = humanizeEnumValue(status);
  switch (variant) {
    case "personnel":
      colorClass =
        statusColors.personnel[status as PersonnelStatus] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.personnel[status as PersonnelStatus] ||
        humanizeEnumValue(status);
      break;
    case "employment":
      colorClass =
        statusColors.employment[status as EmploymentStatus] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.employment[status as EmploymentStatus] ||
        humanizeEnumValue(status);
      break;
    case "payroll":
      colorClass =
        statusColors.payroll[status as PayrollStatus] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.payroll[status as PayrollStatus] ||
        humanizeEnumValue(status);
      break;
    case "cnssMonthly":
      colorClass =
        statusColors.cnssMonthly[status as CNSSMonthlyStatus] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.cnssMonthly[status as CNSSMonthlyStatus] ||
        humanizeEnumValue(status);
      break;
    case "cnssSituation":
      colorClass =
        statusColors.cnssSituation[status as CNSSSituation] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.cnssSituation[status as CNSSSituation] ||
        humanizeEnumValue(status);
      break;
    case "cnssMonthlySituation":
      colorClass =
        statusColors.cnssMonthlySituation[status as CNSSMonthlySituation] ||
        "bg-gray-100 text-gray-800";
      label =
        statusLabels.cnssMonthlySituation[status as CNSSMonthlySituation] ||
        humanizeEnumValue(status);
      break;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        colorClass,
        className,
      )}
    >
      {showDot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current me-1.5" />
      )}
      {sourceText(label)}
    </span>
  );
}
// ============ Completeness Badge ============
interface CompletenessBadgeProps {
  percentage: number;
  className?: string;
  showLabel?: boolean;
}
export function CompletenessBadge({
  percentage,
  className,
  showLabel = true,
}: CompletenessBadgeProps) {
  const getColor = (p: number) => {
    if (p >= 80) return "bg-green-100 text-green-800";
    if (p >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };
  const getLabel = (p: number) => {
    if (p >= 80) return sourceText("Complete");
    if (p >= 50) return sourceText("Partial");
    return sourceText("Incomplete");
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        getColor(percentage),
        className,
      )}
    >
      {showLabel && <span className="me-1">{getLabel(percentage)}</span>}
      <span>{Math.round(percentage)}%</span>
    </span>
  );
}
const tabularNumbers = "font-mono tabular-nums";
// ============ Currency Display ============
interface CurrencyDisplayProps {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  showZero?: boolean;
  tabular?: boolean;
}
export function CurrencyDisplay({
  amount,
  currency = "MAD",
  className,
  showZero = false,
  tabular = true,
}: CurrencyDisplayProps) {
  if (amount === null || amount === undefined) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  if (amount === 0 && !showZero) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const formatted = new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return (
    <span className={cn(tabular ? "font-mono tabular-nums" : "", className)}>
      {formatted}
    </span>
  );
}
// ============ Date Display ============
interface DateDisplayProps {
  date: string | null | undefined;
  format?: "short" | "medium" | "long";
  className?: string;
  showTime?: boolean;
}
export function DateDisplay({
  date,
  format = "short",
  className,
  showTime = false,
}: DateDisplayProps) {
  if (!date)
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  let d: Date;
  try {
    d = new Date(date);
    if (isNaN(d.getTime())) throw new Error("Invalid date");
  } catch {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: format === "short" ? "2-digit" : "long",
    day: "2-digit",
  };
  if (showTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  let formatted: string;
  try {
    formatted = d.toLocaleDateString(localeTag(), options);
  } catch {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return <span className={cn(tabularNumbers, className)}>{formatted}</span>;
}
// ============ Personnel Avatar ============
interface PersonnelAvatarProps {
  name: string;
  email?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}
export function PersonnelAvatar({
  name,
  email,
  className,
  size = "md",
}: PersonnelAvatarProps) {
  const sizes = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
    xl: "w-12 h-12 text-lg",
  };
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary/10 text-primary font-medium",
        sizes[size],
        className,
      )}
      aria-label={email || name}
    >
      {initials}
    </div>
  );
}
// ============ Empty State ============
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground/50">{icon}</div>}
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
// ============ Loading Skeleton ============
interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string;
  height?: string;
}
export function Skeleton({
  className,
  variant = "text",
  width,
  height,
}: SkeletonProps) {
  const baseStyles = "animate-pulse bg-muted rounded";
  const variants = {
    text: "h-4 w-full",
    circular: "rounded-full",
    rectangular: "rounded-lg",
  };
  return (
    <div
      className={cn(baseStyles, variants[variant], className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th
                key={i}
                className="px-3 py-2 text-start text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                <Skeleton variant="text" width="80%" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-3 py-3">
                  <Skeleton variant="text" width="90%" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ============ Data Table Components ============
interface Column<T> {
  key: keyof T | string;
  header: React.ReactNode;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}
interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  rowClassName?: string;
  striped?: boolean;
  hoverable?: boolean;
  stickyHeader?: boolean;
  density?: "comfortable" | "compact" | "dense";
  viewMode?: "card" | "table";
}
export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading,
  emptyMessage = sourceText("No data found"),
  emptyIcon,
  onRowClick,
  className,
  rowClassName,
  striped = true,
  hoverable = true,
  stickyHeader = true,
  density = "comfortable",
  viewMode = "table",
}: DataTableProps<T>) {
  if (isLoading) {
    return <TableSkeleton rows={5} columns={columns.length} />;
  }
  if (data.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-start text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center">
                <EmptyState icon={emptyIcon} title={emptyMessage} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const cellPaddingClass =
    density === "dense"
      ? "px-3 py-1.5 text-xs"
      : density === "compact"
        ? "px-3 py-2 text-sm"
        : "px-3 py-3 text-sm";

  if (viewMode === "card") {
    const bodyColumns = columns.filter((col) => String(col.key) !== "__actions");
    const actionColumn = columns.find((col) => String(col.key) === "__actions");
    const titleColumn = bodyColumns[0];
    const restColumns = bodyColumns.slice(1);
    return (
      <div className={cn("grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
        {data.map((row) => {
          const titleValue = titleColumn
            ? (row as Record<string, unknown>)[titleColumn.key as string]
            : undefined;
          return (
            <div
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md",
                onRowClick && "cursor-pointer",
                rowClassName,
              )}
            >
              {titleColumn ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold leading-tight text-foreground">
                    {titleColumn.render
                      ? titleColumn.render(titleValue, row)
                      : String(titleValue ?? "—")}
                  </div>
                </div>
              ) : null}
              {restColumns.map((col, colIndex) => {
                const value = (row as Record<string, unknown>)[col.key as string];
                return (
                  <div key={colIndex} className="min-w-0 text-xs text-muted-foreground">
                    {col.header ? (
                      <span className="me-1 font-medium text-foreground/70">{col.header}:</span>
                    ) : null}
                    <span className="text-foreground">
                      {col.render ? col.render(value, row) : String(value ?? "—")}
                    </span>
                  </div>
                );
              })}
              {actionColumn ? (
                <div
                  className="mt-auto flex items-center justify-end pt-1"
                  onClick={(event) => event.stopPropagation()}
                >
                  {actionColumn.render
                    ? actionColumn.render(
                        (row as Record<string, unknown>)[actionColumn.key as string],
                        row,
                      )
                    : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-[0_10px_26px_rgba(15,23,42,.04)]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full" role="grid">
          <thead
            className={cn("bg-muted/50", stickyHeader && "sticky top-0 z-10")}
          >
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-3 py-2 text-start text-xs font-medium uppercase tracking-wider text-muted-foreground",
                    col.className,
                  )}
                  scope="col"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={cn(
              "divide-y divide-border",
              striped && "even:bg-muted/30",
            )}
          >
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={cn(
                  hoverable && "transition-colors hover:bg-accent/50",
                  onRowClick && "cursor-pointer",
                  rowClassName,
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col, colIndex) => {
                  const value = (row as Record<string, unknown>)[
                    col.key as string
                  ];
                  return (
                    <td
                      key={colIndex}
                      className={cn(cellPaddingClass, col.className)}
                    >
                      {col.render
                        ? col.render(value, row)
                        : String(value ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ============ Pagination ============
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}
export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-border/70 bg-card/70 px-1 py-4",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">
        <SourceText source="Showing" leading trailing />
        {startItem}
        <SourceText source="to" leading trailing />
        {endItem}
        <SourceText source="of" leading trailing />
        {totalCount}
        <SourceText source="results" leading trailing />
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={sourceText("Previous page")}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span className="px-3 text-sm font-medium">{currentPage}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={sourceText("Next page")}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
// ============ Search Input ============
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: () => void;
  className?: string;
  debounceMs?: number;
}
export function SearchInput({
  value,
  onChange,
  placeholder = sourceText("Search..."),
  onSearch,
  className,
  debounceMs: _debounceMs = 300,
}: SearchInputProps) {
  return (
    <div className="relative min-w-[220px]">
      <svg
        className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onChange(value);
            onSearch?.();
          }
        }}
        placeholder={placeholder}
        className={cn(
          "efop-hover-lift h-10 w-full rounded-xl border border-input bg-background ps-10 pe-4 text-sm shadow-sm transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-primary/30 hover:bg-background/96",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:-translate-y-[1px]",
          className,
        )}
      />
    </div>
  );
}
// ============ Filter Dropdown ============
interface FilterDropdownProps {
  label: string;
  value: string | string[];
  options: {
    value: string;
    label: string;
  }[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  className?: string;
}
export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  multiple = false,
  placeholder,
  className,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectableOptions = React.useMemo(
    () => options.filter((option) => option.value !== ""),
    [options],
  );
  const selectedCount = Array.isArray(value)
    ? value.filter(Boolean).length
    : value
      ? 1
      : 0;
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-filter-dropdown]")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const values = Array.isArray(value) ? value : [value];
      const newValues = values.includes(optionValue)
        ? values.filter((v) => v !== optionValue)
        : [...values, optionValue];
      onChange(newValues);
    } else {
      onChange(optionValue);
      setIsOpen(false);
    }
  };
  const displayValue = Array.isArray(value)
    ? value
        .map((v) => options.find((o) => o.value === v)?.label)
        .filter(Boolean)
        .join(", ")
    : options.find((o) => o.value === value)?.label ||
      placeholder ||
      sourceText("All");
  return (
    <div className={cn("relative", className)} data-filter-dropdown>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {selectedCount > 0
            ? `${selectedCount} ${sourceText("selected")}`
            : `${selectableOptions.length} ${sourceText("options")}`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "efop-hover-lift w-full rounded-lg border border-input bg-background px-3 py-2 text-start text-sm transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-primary/30 hover:bg-background/96",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:-translate-y-[1px]",
          isOpen && "ring-2 ring-ring ring-offset-2",
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={cn(
            "flex items-center justify-between",
            !displayValue && "text-muted-foreground",
          )}
        >
          {displayValue || placeholder || sourceText("All")}
          <svg
            className={cn(
              "ms-2 h-4 w-4 transition-transform duration-300",
              isOpen && "rotate-180",
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="efop-pop absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border/80 bg-popover/98 shadow-[0_18px_42px_hsl(var(--foreground)/0.14)] backdrop-blur-xl">
          <div className="max-h-60 overflow-y-auto p-1.5">
            {options.length === 0 ? (
              <div className="rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <SourceText source="No filter options yet" />
              </div>
            ) : (
              options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                "efop-hover-lift w-full rounded-lg px-3 py-2 text-start text-sm transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent focus:outline-none focus:bg-accent",
                Array.isArray(value)
                  ? value.includes(option.value)
                    ? "bg-primary/10 text-primary"
                    : ""
                  : value === option.value
                    ? "bg-primary/10 text-primary"
                    : "",
              )}
              role="option"
              aria-selected={
                Array.isArray(value)
                  ? value.includes(option.value)
                  : value === option.value
              }
            >
              <span className="flex items-center gap-2">
                {multiple && (
                  <svg
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      Array.isArray(value) && value.includes(option.value)
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                    fill={
                      Array.isArray(value) && value.includes(option.value)
                        ? "currentColor"
                        : "none"
                    }
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {option.label}
              </span>
            </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ============ Action Menu ============
interface ActionMenuProps {
  items: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: "default" | "destructive";
    disabled?: boolean;
  }[];
  trigger: React.ReactNode;
  className?: string;
}
export function ActionMenu({ items, trigger, className }: ActionMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className={cn("relative inline-block", className)} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="efop-hover-lift rounded-lg p-1.5 transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)]"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {trigger}
      </button>
      {isOpen && (
        <div className="efop-pop absolute end-0 z-50 mt-1 w-48 origin-top-right rounded-xl border border-border/80 bg-popover/98 py-1 shadow-[0_18px_44px_hsl(var(--foreground)/0.16)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              disabled={item.disabled}
              className={cn(
                "efop-hover-lift flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent focus:outline-none focus:bg-accent hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)]",
                item.disabled && "opacity-50 cursor-not-allowed",
                item.variant === "destructive" &&
                  "text-destructive focus:text-destructive",
              )}
              role="menuitem"
            >
              {item.icon && (
                <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// ============ Confirm Dialog ============
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
}
/**
 * Confirmation dialog used by ~19 call sites (archive, restore, delete, post).
 *
 * WHY THIS IS PORTALLED
 * ---------------------
 * This used to be a plain `<div className="fixed inset-0 flex items-center
 * justify-center">` rendered inline in the page. `position: fixed` resolves
 * against the nearest ancestor that establishes a containing block, and
 * ProtectedLayout wraps every page in a framer-motion `motion.div` that
 * animates `y` - i.e. it carries a `transform`. A transformed ancestor becomes
 * that containing block, so `inset-0` covered the PAGE CONTENT box rather than
 * the viewport and the dialog was centred in the middle of the (tall) list
 * instead of the middle of the screen. Reported as "for the archive one I want
 * that to be at the middle of the screen not randomly at the middle of the
 * list".
 *
 * Radix's DialogContent renders through a portal into document.body, which sits
 * outside the transformed subtree, so centring is against the viewport again.
 * It also brings what the hand-rolled version silently lacked: a focus trap,
 * Escape to close, background scroll lock, and role="dialog" wired to its title
 * and description.
 *
 * The prop API (isOpen/onClose/...) is unchanged on purpose so no call site
 * had to be touched.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = sourceText("Confirm"),
  cancelLabel = sourceText("Cancel"),
  variant = "default",
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next: boolean) => {
        // Escape and backdrop clicks both route through onOpenChange. Ignore
        // them while the confirmed action is still running, so a dialog cannot
        // be dismissed out from under an in-flight request.
        if (!next && !isLoading) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="efop-hover-lift rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {isLoading ? sourceText("Processing...") : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
