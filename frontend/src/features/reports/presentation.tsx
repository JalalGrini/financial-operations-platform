"use client";

/**
 * Shared presentation helpers for the reports screens.
 *
 * These lived as private functions inside the reports list page. The detail
 * page needs the same status vocabulary and date formatting, and duplicating
 * the label map would let the two screens drift into naming the same status
 * differently. Both pages now import from here.
 */

import { Badge } from "@/components/ui/badge";
import { sourceText } from "@/lib/i18n/source-catalog";

export function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

export const STATUS_VARIANT: Record<
  string,
  "default" | "outline" | "destructive" | "secondary"
> = {
  approved: "default",
  current_official: "default",
  pending_review: "secondary",
  rejected: "destructive",
  outdated: "outline",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  approved: sourceText("Approved"),
  current_official: sourceText("Current official"),
  pending_review: sourceText("Pending review"),
  rejected: sourceText("Rejected"),
  outdated: sourceText("Outdated"),
  preview: sourceText("Preview"),
  draft: sourceText("Draft"),
};

export function formatDateTimeFr(value?: string | null) {
  if (!value) return sourceText("—");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateFr(value?: string | null) {
  if (!value) return sourceText("—");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Human-readable byte size for an attached report file. */
export function formatFileSize(bytes?: number | null) {
  if (bytes === undefined || bytes === null) return sourceText("—");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] || "outline"}>
      {REPORT_STATUS_LABELS[status] || status}
    </Badge>
  );
}
