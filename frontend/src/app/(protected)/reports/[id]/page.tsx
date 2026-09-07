"use client";

/**
 * Report detail — /reports/{id}.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The reports list renders a view button linking to `/reports/{id}`, but this
 * route did not exist, so every attempt to inspect a report hit Next's 404.
 * The backend detail endpoint (`GET /reports/reports/{id}/`) was already there
 * and already returned the version history; only the page was missing.
 *
 * WHAT "EDIT" MEANS HERE
 * ----------------------
 * A report is deliberately NOT editable field-by-field. The backend viewset
 * omits put/patch from `http_method_names` and `get_update_block_reason`
 * permanently refuses generic updates: an approved report is a historical
 * record. The domain's edit operation is REGENERATION, which creates a new
 * version and keeps every prior one. This page therefore exposes the real
 * workflow (regenerate with a reason, submit for review, approve or reject)
 * instead of a form that the server would reject.
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarRange,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileCheck,
  FileText,
  History,
  Layers,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Breadcrumb, PageHeader } from "@/components/ui/page-components";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagAction } from "@/components/collaboration/TagAction";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { reportsApi } from "@/features/reports/api";
import {
  REPORT_STATUS_LABELS,
  ReportStatusBadge,
  formatDateFr,
  formatDateTimeFr,
  formatFileSize,
} from "@/features/reports/presentation";
import type { ReportValue, ReportVersion } from "@/features/reports/types";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";

/** Pull a usable message out of a DRF error body instead of "request failed". */
function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const detail = record.detail ?? record.message;
    if (typeof detail === "string" && detail) return detail;
    const first = Object.values(record).find(
      (value) => typeof value === "string" || Array.isArray(value),
    );
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === "string") return first;
  }
  const message = (error as { message?: string })?.message;
  return message || fallback;
}

function ValueRow({
  value,
  depth,
  childrenByParent,
}: {
  value: ReportValue;
  depth: number;
  childrenByParent: Map<string, ReportValue[]>;
}) {
  const [open, setOpen] = useState(depth === 0);
  const children = childrenByParent.get(value.id) ?? [];
  const sources = value.sources ?? [];
  const hasDetail = children.length > 0 || sources.length > 0;

  return (
    <>
      <TableRow>
        <TableCell>
          <span
            className="flex items-center gap-1.5"
            style={{ paddingInlineStart: `${depth * 16}px` }}
          >
            {hasDetail ? (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={
                  open
                    ? sourceText("Collapse breakdown")
                    : sourceText("Expand breakdown")
                }
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block w-[18px]" />
            )}
            <span className="font-medium">{value.label}</span>
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {value.key}
        </TableCell>
        <TableCell>{value.period_label || sourceText("—")}</TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          {value.amount === null || value.amount === undefined
            ? sourceText("—")
            : Number(value.amount).toLocaleString("fr-MA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
        </TableCell>
        <TableCell>
          {value.is_available ? (
            <Badge variant="outline" className="text-xs">
              {sourceText("Available")}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              {sourceText("Missing")}
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {open && sources.length > 0 && (
        <TableRow className="row-hover bg-muted/30">
          <TableCell colSpan={5}>
            <div
              className="space-y-1 text-xs"
              style={{ paddingInlineStart: `${depth * 16 + 26}px` }}
            >
              <p className="font-medium text-muted-foreground">
                {sourceText("Source financial records")}
              </p>
              <ul className="space-y-0.5">
                {sources.map((source) => (
                  <li key={source.id} className="flex items-center gap-2">
                    {source.financial_record ? (
                      <Link
                        href={`/financial-records/${source.financial_record}`}
                        className="font-mono text-primary underline-offset-2 hover:underline"
                      >
                        {source.financial_record_reference ||
                          source.financial_record}
                      </Link>
                    ) : (
                      <span className="font-mono text-muted-foreground">
                        {sourceText("Unknown record")}
                      </span>
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {Number(source.contribution_amount ?? 0).toLocaleString(
                        "fr-MA",
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </TableCell>
        </TableRow>
      )}

      {open &&
        children.map((child) => (
          <ValueRow
            key={child.id}
            value={child}
            depth={depth + 1}
            childrenByParent={childrenByParent}
          />
        ))}
    </>
  );
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id as string;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const roles = getEffectiveRoles(user);
  const canApprove = roles.includes("Administrator") || roles.includes("Director");

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateReason, setRegenerateReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ReportVersion | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [approveTarget, setApproveTarget] = useState<ReportVersion | null>(null);

  const regeneratePanelRef = useRevealOnOpen<HTMLDivElement>(regenerateOpen);
  const rejectPanelRef = useRevealOnOpen<HTMLDivElement>(!!rejectTarget);

  const {
    data: report,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["reports", "detail", reportId],
    queryFn: () => reportsApi.get(reportId),
    enabled: !!reportId,
  });

  const versions = useMemo(
    () =>
      [...(report?.versions ?? [])].sort(
        (a, b) => b.version_number - a.version_number,
      ),
    [report?.versions],
  );

  // Default to whichever version the report currently points at, falling back
  // to the newest one.
  const activeVersionId =
    selectedVersionId ?? report?.current_version ?? versions[0]?.id ?? null;
  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;

  const { data: values, isLoading: valuesLoading } = useQuery({
    queryKey: ["reports", "values", activeVersionId],
    queryFn: () => reportsApi.versions.values(activeVersionId!),
    enabled: !!activeVersionId,
  });

  /** parent id -> children, so the drill-down renders as a tree. */
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ReportValue[]>();
    (values ?? []).forEach((row) => {
      if (row.parent) {
        const list = map.get(row.parent) ?? [];
        list.push(row);
        map.set(row.parent, list);
      }
    });
    return map;
  }, [values]);

  const rootValues = useMemo(
    () => (values ?? []).filter((row) => !row.parent),
    [values],
  );

  const attachments = useMemo(
    () => versions.filter((v) => !!v.ready_file_download_url),
    [versions],
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["reports"] });
  }

  const regenerateMutation = useMutation({
    mutationFn: (reason: string) =>
      reportsApi.regenerateCarryingForward(
        { id: reportId, current_version: report?.current_version ?? null },
        reason,
      ),
    onSuccess: (version) => {
      toast.success(
        sourceText("New version created — previous versions are preserved."),
      );
      setRegenerateOpen(false);
      setRegenerateReason("");
      setSelectedVersionId(version.id);
      invalidate();
    },
    onError: (err) =>
      toast.error(errorMessage(err, sourceText("Regeneration failed"))),
  });

  const submitMutation = useMutation({
    mutationFn: (versionId: string) =>
      reportsApi.versions.submitForReview(versionId),
    onSuccess: () => {
      toast.success(sourceText("Submitted for review."));
      invalidate();
    },
    onError: (err) =>
      toast.error(errorMessage(err, sourceText("Could not submit for review"))),
  });

  const approveMutation = useMutation({
    mutationFn: ({
      versionId,
      approved,
      notes,
    }: {
      versionId: string;
      approved: boolean;
      notes?: string;
    }) => reportsApi.versions.approve(versionId, approved, notes),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.approved
          ? sourceText("Report approved.")
          : sourceText("Report rejected."),
      );
      setApproveTarget(null);
      setRejectTarget(null);
      setRejectNotes("");
      invalidate();
    },
    onError: (err) =>
      toast.error(errorMessage(err, sourceText("Review action failed"))),
  });

  const exportMutation = useMutation({
    mutationFn: (version: ReportVersion) =>
      reportsApi.versions.exportXlsx(
        version.id,
        `${report?.reference ?? "report"}-v${version.version_number}`,
      ),
    onError: (err) => toast.error(errorMessage(err, sourceText("Export failed"))),
  });

  const downloadMutation = useMutation({
    mutationFn: (version: ReportVersion) =>
      reportsApi.versions.downloadReadyFile(version),
    onError: (err) =>
      toast.error(errorMessage(err, sourceText("Download failed"))),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="me-2 h-5 w-5 animate-spin" />
        {sourceText("Loading report…")}
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="space-y-6 p-6">
        <Breadcrumb
          items={[
            { label: sourceText("Reports"), href: "/reports" },
            { label: sourceText("Not found") },
          ]}
        />
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {sourceText("This report could not be loaded")}
            </CardTitle>
            <CardDescription>
              {errorMessage(
                error,
                sourceText(
                  "It may have been archived, or the link may be out of date.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push("/reports")}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {sourceText("Back to reports")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb
        items={[
          { label: sourceText("Reports"), href: "/reports" },
          { label: report.reference },
        ]}
      />

      <PageHeader
        title={report.reference}
        description={`${report.report_type_name ?? sourceText("Report")} · ${
          report.company_name ?? sourceText("Unknown company")
        } · ${report.period_label}`}
        icon={<FileCheck className="h-6 w-6" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TagAction resourceType="reports.generatedreport" targetId={report.id} compact />
            {activeVersion && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => exportMutation.mutate(activeVersion)}
                disabled={exportMutation.isPending}
              >
                <Download className="h-4 w-4" />
                {sourceText("Export XLSX")}
              </Button>
            )}
            <Button
              className="gap-2"
              onClick={() => setRegenerateOpen((o) => !o)}
            >
              <RotateCcw className="h-4 w-4" />
              {sourceText("Regenerate")}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/reports">
                <ArrowLeft className="me-2 h-4 w-4" />
                {sourceText("Back")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* StatCard renders text, not nodes, so this shows the status label
            rather than the badge; the badge itself appears per version below. */}
        <StatCard
          label={sourceText("Status")}
          value={REPORT_STATUS_LABELS[report.status] || report.status}
          icon={FileText}
        />
        <StatCard
          label={sourceText("Versions")}
          value={report.latest_version_number}
          icon={Layers}
          tone="blue"
        />
        <StatCard
          label={sourceText("Period")}
          value={report.period_label}
          icon={CalendarRange}
        />
        <StatCard
          label={sourceText("Attachments")}
          value={attachments.length}
          icon={Paperclip}
          tone={attachments.length ? "emerald" : undefined}
        />
      </div>

      {/* Regenerate panel. Inline rather than a modal to match the other
          screens, with useRevealOnOpen so the button never looks dead. */}
      {regenerateOpen && (
        <div ref={regeneratePanelRef} className="scroll-mt-24">
          <Card className="border-primary/40 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base">
                {sourceText("Regenerate this report")}
              </CardTitle>
              <CardDescription>
                {sourceText(
                  "Reports are versioned rather than edited in place: this creates a new version and keeps every earlier one as a record. The figures currently on record are carried over unchanged.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="regenerate-reason">
                  {sourceText("Reason (required)")}
                </Label>
                <Textarea
                  id="regenerate-reason"
                  data-reveal-focus
                  rows={3}
                  placeholder={sourceText(
                    "e.g. a source invoice was corrected after the first version",
                  )}
                  value={regenerateReason}
                  onChange={(e) => setRegenerateReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (!regenerateReason.trim()) {
                      toast.error(sourceText("A reason is required"));
                      return;
                    }
                    regenerateMutation.mutate(regenerateReason.trim());
                  }}
                  disabled={regenerateMutation.isPending}
                >
                  {regenerateMutation.isPending && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
                  {sourceText("Create new version")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRegenerateOpen(false);
                    setRegenerateReason("");
                  }}
                  disabled={regenerateMutation.isPending}
                >
                  {sourceText("Cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject panel — notes are mandatory on rejection (blueprint Section 7). */}
      {rejectTarget && (
        <div ref={rejectPanelRef} className="scroll-mt-24">
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base">
                {sourceText("Reject version")} v{rejectTarget.version_number}
              </CardTitle>
              <CardDescription>
                {sourceText(
                  "Rejection requires notes explaining what needs to change.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reject-notes">
                  {sourceText("Notes (required)")}
                </Label>
                <Textarea
                  id="reject-notes"
                  data-reveal-focus
                  rows={3}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!rejectNotes.trim()) {
                      toast.error(sourceText("Notes are required to reject"));
                      return;
                    }
                    approveMutation.mutate({
                      versionId: rejectTarget.id,
                      approved: false,
                      notes: rejectNotes.trim(),
                    });
                  }}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
                  {sourceText("Confirm rejection")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectTarget(null);
                    setRejectNotes("");
                  }}
                >
                  {sourceText("Cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{sourceText("Details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {sourceText("Company")}
            </p>
            <p className="flex items-center gap-1.5 font-medium">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {report.company_name ?? sourceText("—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {sourceText("Report type")}
            </p>
            <p className="font-medium">
              {report.report_type_name ?? sourceText("—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {sourceText("Period covered")}
            </p>
            <p className="font-medium">
              {formatDateFr(report.period_start)} → {formatDateFr(report.period_end)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {sourceText("Last updated")}
            </p>
            <p className="font-medium">{formatDateTimeFr(report.updated_at)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            {sourceText("Attached files")}
          </CardTitle>
          <CardDescription>
            {sourceText(
              "Files uploaded with a version. Generated versions have no attachment; export them as XLSX instead.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {sourceText("No files are attached to this report.")}
            </p>
          ) : (
            <ul className="divide-y">
              {attachments.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {version.ready_file_name || sourceText("Attached file")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      v{version.version_number} ·{" "}
                      {formatFileSize(version.ready_file_size_bytes)}
                      {version.ready_file_content_type
                        ? ` · ${version.ready_file_content_type}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => downloadMutation.mutate(version)}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {sourceText("Download")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Version history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {sourceText("Version history")}
          </CardTitle>
          <CardDescription>
            {sourceText(
              "Select a version to inspect its figures. Versions are never overwritten.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sourceText("Version")}</TableHead>
                  <TableHead>{sourceText("Status")}</TableHead>
                  <TableHead>{sourceText("Generated")}</TableHead>
                  <TableHead>{sourceText("Reviewed by")}</TableHead>
                  <TableHead>{sourceText("Reason / notes")}</TableHead>
                  <TableHead>{sourceText("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => {
                  const isActive = version.id === activeVersionId;
                  const isCurrent = version.id === report.current_version;
                  return (
                    <TableRow className={cn("row-hover", isActive && "bg-primary/5")}
                      key={version.id}
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelectedVersionId(version.id)}
                          className={cn(
                            "font-semibold underline-offset-2 hover:underline",
                            isActive && "text-primary",
                          )}
                          aria-label={`${sourceText("Inspect version")} ${version.version_number}`}
                        >
                          v{version.version_number}
                        </button>
                        {isCurrent && (
                          <Badge variant="outline" className="ms-2 text-[10px]">
                            {sourceText("Current")}
                          </Badge>
                        )}
                        {version.is_partial && (
                          <Badge
                            variant="destructive"
                            className="ms-2 text-[10px]"
                          >
                            {sourceText("Partial")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ReportStatusBadge status={version.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTimeFr(version.generated_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {version.reviewed_by_name || sourceText("—")}
                        {version.approved_at && (
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTimeFr(version.approved_at)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <span className="block truncate text-sm text-muted-foreground">
                          {version.regeneration_reason ||
                            version.notes ||
                            version.outdated_reason ||
                            sourceText("—")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {version.status === "preview" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              onClick={() => submitMutation.mutate(version.id)}
                              disabled={submitMutation.isPending}
                            >
                              <Send className="h-3 w-3" />
                              {sourceText("Submit")}
                            </Button>
                          )}
                          {version.status === "pending_review" && canApprove && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                                onClick={() => setApproveTarget(version)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3" />
                                {sourceText("Approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs text-destructive"
                                onClick={() => {
                                  setRejectTarget(version);
                                  setRejectNotes("");
                                }}
                              >
                                <XCircle className="h-3 w-3" />
                                {sourceText("Reject")}
                              </Button>
                            </>
                          )}
                          {version.status === "pending_review" && !canApprove && (
                            <span className="text-xs text-muted-foreground">
                              {sourceText("Awaiting an approver")}
                            </span>
                          )}
                          {version.ready_file_download_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => downloadMutation.mutate(version)}
                              aria-label={`${sourceText("Download file for version")} ${version.version_number}`}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => exportMutation.mutate(version)}
                            aria-label={`${sourceText("Export version")} ${version.version_number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {versions.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {sourceText("This report has no versions yet.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table></div>
          </div>
        </CardContent>
      </Card>

      {/* Figures for the selected version */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {sourceText("Figures")}
            {activeVersion ? ` — v${activeVersion.version_number}` : ""}
          </CardTitle>
          <CardDescription>
            {sourceText(
              "Expand a line to see the financial records behind it.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valuesLoading && (
            <p className="py-4 text-sm text-muted-foreground">
              {sourceText("Loading figures…")}
            </p>
          )}

          {!valuesLoading && rootValues.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              {activeVersion?.ready_file_download_url
                ? sourceText(
                    "This version is an uploaded file, so it has no computed figures. Download it above.",
                  )
                : sourceText("This version has no figures recorded.")}
            </p>
          )}

          {rootValues.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{sourceText("Label")}</TableHead>
                    <TableHead>{sourceText("Key")}</TableHead>
                    <TableHead>{sourceText("Period")}</TableHead>
                    <TableHead className="text-right">
                      {sourceText("Amount")}
                    </TableHead>
                    <TableHead>{sourceText("Availability")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rootValues.map((value) => (
                    <ValueRow
                      key={value.id}
                      value={value}
                      depth={0}
                      childrenByParent={childrenByParent}
                    />
                  ))}
                </TableBody>
              </Table></div>
            </div>
          )}

          {activeVersion?.is_partial &&
            (activeVersion.missing_periods?.length ?? 0) > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {sourceText("Partial report. Missing periods:")}{" "}
                {activeVersion.missing_periods.join(", ")}
              </p>
            )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={!!approveTarget}
        title={sourceText("Approve this version?")}
        description={
          approveTarget
            ? `${sourceText("Version")} v${approveTarget.version_number} ${sourceText(
                "becomes the official record. It can no longer be edited, only superseded by a new version.",
              )}`
            : ""
        }
        onConfirm={() =>
          approveTarget &&
          approveMutation.mutate({ versionId: approveTarget.id, approved: true })
        }
        onClose={() => setApproveTarget(null)}
        isLoading={approveMutation.isPending}
      />
    </div>
  );
}
