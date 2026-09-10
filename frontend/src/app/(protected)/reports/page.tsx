"use client";
import { useRouter } from "next/navigation";
import { sourceText } from "@/lib/i18n/source-catalog";
import { TagAction } from "@/components/collaboration/TagAction";
/**
 * Reports registry (Cycle 29, M5) — generated reports and their versions.
 *
 * Backend workflow (blueprint Section 5/7/9):
 *   generate -> Preview version -> submit-for-review -> Pending Review ->
 *   approve/reject -> official, versioned, immutable. New versions supersede,
 *   never overwrite. XLSX export per version.
 *
 * Backend: /api/v1/reports/reports/ + /api/v1/reports/versions/.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

import { SourceText } from "@/components/i18n/SourceText";
import {
  Plus,
  Loader2,
  FileCheck,
  RotateCcw,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Upload,
} from "lucide-react";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  SearchInput,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import { reportsApi } from "@/features/reports/api";
import {
  ReportStatusBadge as StatusBadgeView,
  formatDateTimeFr,
} from "@/features/reports/presentation";
import { configurationApi } from "@/features/configuration/api";
import { useCompanies } from "@/features/personnel/hooks";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import type { GeneratedReport, ReportVersion } from "@/features/reports/types";
import { ScheduleDate } from "@/components/ui/schedule-date";

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthStartInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { GuidePanel } from "@/components/ui/guide-panel";



export default function ReportsRegistryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const { data: companies } = useCompanies();
  const companyOptions = (companies || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const { data: reportTypes } = useQuery({
    queryKey: ["configuration:report-types", "options"],
    queryFn: () =>
      configurationApi["report-types"].list({
        page_size: 200,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 10,
  });
  const reportTypeOptions = (reportTypes?.results || []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState<Record<string, string>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const [manageTarget, setManageTarget] = useState<GeneratedReport | null>(
    null,
  );
  const [regenerateTarget, setRegenerateTarget] =
    useState<GeneratedReport | null>(null);
  const [regenerateReason, setRegenerateReason] = useState("");

  // All three panels render below the reports table, so the buttons that open
  // them appeared to do nothing when the table was long.
  const generatePanelRef = useRevealOnOpen<HTMLDivElement>(generateOpen);
  const managePanelRef = useRevealOnOpen<HTMLDivElement>(!!manageTarget);
  const regeneratePanelRef = useRevealOnOpen<HTMLDivElement>(!!regenerateTarget);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  const params = useMemo(
    () => ({
      page,
      page_size: 25,
      search: search || undefined,
      status: statusFilter || undefined,
    }),
    [page, search, statusFilter],
  );
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reports", "list", params],
    queryFn: () => reportsApi.list(params),
    placeholderData: (prev) => prev,
  });
  const driftQuery = useQuery({
    queryKey: ["reports", "outdated-drift"],
    queryFn: () => reportsApi.outdatedDrift(),
    enabled: isAdministrator,
  });
  const visibleReports = data?.results || [];
  const pendingCount = visibleReports.filter(
    (report) =>
      report.status === "pending_review" || report.status === "preview",
  ).length;
  const approvedCount = visibleReports.filter(
    (report) => report.status === "approved",
  ).length;
  const driftCount = Array.isArray(driftQuery.data)
    ? driftQuery.data.length
    : 0;
  // Versions for the report currently being managed
  const { data: versions, refetch: refetchVersions } = useQuery({
    queryKey: ["reports", "versions", manageTarget?.id],
    queryFn: () =>
      reportsApi.versions.list({ report: manageTarget!.id, page_size: 100 }),
    enabled: !!manageTarget,
  });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const generateMutation = useMutation({
    mutationFn: ({
      payload,
      file,
    }: {
      payload: Record<string, unknown>;
      file: File | null;
    }) =>
      file
        ? reportsApi.uploadReady(payload as Record<string, string>, file)
        : reportsApi.generate(payload),
    onSuccess: () => {
      invalidateAll();
      toast.success(
        sourceText(
          "Report generated as a Preview version \u2014 submit it for review to make it official.",
        ),
      );
      setGenerateOpen(false);
      setReadyFile(null);
      refetch();
    },
    onError: (e: any) => {
      const detail = e?.message || sourceText("Generation failed");
      setGenerateError(detail);
      toast.error(detail);
    },
  });
  const regenerateMutation = useMutation({
    // Carries the current version's figures into the new version. The old call
    // passed only a reason, which the server rejected with 400 (it also
    // requires `values`, because generate() stores what it is handed and
    // recomputes nothing), so this button could never succeed.
    mutationFn: ({ report, reason }: { report: GeneratedReport; reason: string }) =>
      reportsApi.regenerateCarryingForward(report, reason),
    onSuccess: () => {
      invalidateAll();
      toast.success(
        sourceText("New version generated (previous versions preserved)."),
      );
      setRegenerateTarget(null);
      setRegenerateReason("");
      if (manageTarget) refetchVersions();
    },
    onError: (e: any) =>
      toast.error(e?.message || sourceText("Regeneration failed")),
  });
  const submitMutation = useMutation({
    mutationFn: (versionId: string) =>
      reportsApi.versions.submitForReview(versionId),
    onSuccess: () => {
      invalidateAll();
      refetchVersions();
      toast.success(sourceText("Submitted for review"));
    },
    onError: (e: any) => toast.error(e?.message || sourceText("Submit failed")),
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
    onSuccess: (_data, vars) => {
      invalidateAll();
      refetchVersions();
      toast.success(
        vars.approved
          ? sourceText("Version approved — now official")
          : sourceText("Version rejected"),
      );
    },
    onError: (e: any) => toast.error(e?.message || sourceText("Review failed")),
  });
  const openGenerate = () => {
    setGenerateForm({
      mode: "manual",
      period_start: currentMonthStartInputValue(),
      period_end: todayInputValue(),
      period_label: "",
    });
    setGenerateError(null);
    setReadyFile(null);
    setGenerateOpen(true);
  };
  const setGenerateField = (name: string, value: string) =>
    setGenerateForm((prev) => ({ ...prev, [name]: value }));
  const handleGenerate = () => {
    setGenerateError(null);
    if (!generateForm.company)
      return setGenerateError(sourceText("Company is required."));
    if (!generateForm.report_type)
      return setGenerateError(sourceText("Report type is required."));
    if (!generateForm.period_start)
      return setGenerateError(sourceText("Period start is required."));
    if (!generateForm.period_end)
      return setGenerateError(sourceText("Period end is required."));
    if (generateForm.period_end < generateForm.period_start)
      return setGenerateError(
        sourceText("Period end cannot precede period start."),
      );
    const label =
      generateForm.period_label ||
      `${generateForm.period_start} → ${generateForm.period_end}`;
    if (readyFile && readyFile.size > 10 * 1024 * 1024) {
      return setGenerateError(sourceText("Each file must be 10 MB or smaller."));
    }
    generateMutation.mutate({
      file: readyFile,
      payload: {
        company: generateForm.company,
        report_type: generateForm.report_type,
        period_start: generateForm.period_start,
        period_end: generateForm.period_end,
        period_label: label,
        mode: generateForm.mode || "manual",
      },
    });
  };
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Reports");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={FileCheck}
        eyebrow="Document registry"
        title={sourceText("Reports Registry")}
        description={sourceText("Generate reports, route them through review, approve and export official versions. Each version is immutable once approved.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            onClick={openGenerate}
          >
            <Plus className="me-2 h-4 w-4" />
            <SourceText source="Generate Report" leading trailing />
          </Button>
        </WriteOnly>}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={FileCheck} label={sourceText("Pending review")} value={pendingCount} tone="amber" />
          <StatCard icon={CheckCircle} label={sourceText("Approved")} value={approvedCount} tone="emerald" />
          <StatCard icon={RotateCcw} label={sourceText("Source drift")} value={driftCount} tone="rose" />
        </div>

        <GuidePanel
          eyebrow={"Reports operations guide"}
          title={"Review generated versions before treating them as official"}
          body={"Use this registry to generate report drafts, route them through review, and regenerate only when the source data or reporting need truly changed."}
          items={[
            "Choose a clean period range before generating the report so the label and exported version stay understandable.",
            "Use review status to prioritize validation and approvals.",
            "Regenerate only when source data changed or a new official version is required.",
          ]}
        />
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={sourceText("Search reference, label…")}
        />
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={sourceText("All status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <SourceText source="All status" />
            </SelectItem>
            {[
              { value: "preview", label: sourceText("Preview") },
              { value: "pending_review", label: sourceText("Pending review") },
              { value: "approved", label: sourceText("Approved") },
              { value: "rejected", label: sourceText("Rejected") },
              { value: "outdated", label: sourceText("Outdated") },
            ].map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isAdministrator && (
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                <SourceText source="Source-drift diagnostics" />
              </h2>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Official reports whose source Financial Records changed without a matching outdated transition."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => driftQuery.refetch()}
            >
              <SourceText source="Refresh" leading trailing />
            </Button>
          </div>
          {driftQuery.isLoading ? (
            <Loader2 className="mt-3 h-5 w-5 animate-spin" />
          ) : driftQuery.isError ? (
            <p className="mt-3 text-sm text-red-700">
              <SourceText
                source="Diagnostics could not be loaded."
                leading
                trailing
              />
            </p>
          ) : (driftQuery.data || []).length === 0 ? (
            <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <SourceText
                source="No stale report-source drift detected."
                leading
                trailing
              />
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {(driftQuery.data || []).map((row) => (
                <div
                  key={row.report.id}
                  className="rounded border border-red-200 bg-red-50 p-3 text-sm"
                >
                  <strong>
                    {row.report.reference} · {sourceText("version")}{" "}
                    {row.version_number}
                  </strong>
                  <p>
                    {row.stale_financial_record_ids.length}
                    <SourceText
                      source="stale source record(s)"
                      leading
                      trailing
                    />
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sourceText("Report")}</TableHead>
              <TableHead className="hidden md:table-cell">{sourceText("Company")}</TableHead>
              <TableHead>{sourceText("Status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{sourceText("Period")}</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.results || []).map((row) => (
              <TableRow className="row-hover" key={row.id}>
                <TableCell>
                  <div>
                    {/* GeneratedReport has no name/title: `reference` is its
                        human-facing identifier and `period_label` its period. */}
                    <p className="font-medium text-foreground">{row.reference}</p>
                    <p className="text-xs text-muted-foreground">{row.report_type_name || sourceText("—")}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.company_name || sourceText("—")}</TableCell>
                <TableCell><Badge variant={(row as any).status === "published" ? "default" : (row as any).status === "pending_review" ? "warning" : "outline"}>{(row as any).status_label || (row as any).status}</Badge></TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{row.period_label || sourceText("—")}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <TagAction resourceType="reports.generatedreport" targetId={row.id} compact />
                    <ExpandingActions
                      actions={[
                        { label: sourceText("View"), icon: <Eye size={14} />, onClick: () => router.push(`/reports/${row.id}`) },
                        ...(row.current_version
                          ? [{
                              label: sourceText("Download"),
                              icon: <Download size={14} />,
                              onClick: () => {
                                void reportsApi.versions.exportXlsx(
                                  row.current_version!,
                                  row.reference,
                                );
                              },
                            }]
                          : []),
                        { label: sourceText("Versions"), icon: <FileCheck size={14} />, onClick: () => setManageTarget(row) },
                        { label: sourceText("Regenerate"), icon: <RotateCcw size={14} />, onClick: () => setRegenerateTarget(row), permission: "write" as const },
                      ]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
      </div>
      {data && data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil((data?.count || 0) / 25)}
          totalCount={data?.count || 0}
          pageSize={25}
          onPageChange={setPage}
        />
      )}

      {generateOpen && (
        <div
          ref={generatePanelRef}
          className="scroll-mt-24 rounded-3xl border border-primary/20 bg-background p-6 shadow-[0_16px_38px_rgba(15,23,42,.08)] space-y-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                <SourceText source="Generate Report" />
              </h3>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Generate the report directly on the page, then review versions below."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGenerateOpen(false)}
              disabled={generateMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </div>
          {generateError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {generateError}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 xl:col-span-2">
              <Label>
                <SourceText source="Company *" />
              </Label>
              <Select
                value={generateForm.company || ""}
                onValueChange={(v) => setGenerateField("company", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={sourceText("Select company")} />
                </SelectTrigger>
                <SelectContent>
                  {companyOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 xl:col-span-2">
              <Label>
                <SourceText source="Report type *" />
              </Label>
              <Select
                value={generateForm.report_type || ""}
                onValueChange={(v) => setGenerateField("report_type", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={sourceText("Select report type")} />
                </SelectTrigger>
                <SelectContent>
                  {reportTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Period start *" />
              </Label>
              <ScheduleDate
                value={generateForm.period_start || "" || ""}
                onChange={(val: string) =>
                  setGenerateField("period_start", val)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Period end *" />
              </Label>
              <ScheduleDate
                value={generateForm.period_end || "" || ""}
                onChange={(val: string) => setGenerateField("period_end", val)}
              />
            </div>
            <div className="space-y-1.5 xl:col-span-2">
              <Label>
                <SourceText source="Period label" />
              </Label>
              <Input
                value={generateForm.period_label || ""}
                onChange={(e) =>
                  setGenerateField("period_label", e.target.value)
                }
                placeholder={sourceText("e.g., August 2026 (auto if empty)")}
              />
            </div>
            <div className="space-y-1.5 rounded-xl border border-dashed p-4 md:col-span-2 xl:col-span-4">
              <Label htmlFor="ready-report-file">
                <SourceText source="Upload a ready file (optional)" />
              </Label>
              <Input
                id="ready-report-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={(event) =>
                  setReadyFile(event.target.files?.[0] || null)
                }
              />
              <p className="text-xs text-muted-foreground">
                <SourceText source="Leave this empty to generate the report from platform data. A ready file follows the same preview and approval workflow." />
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGenerateOpen(false)}
              disabled={generateMutation.isPending}
            >
              <SourceText source="Cancel" leading trailing />
            </Button>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending && (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              )}
              <SourceText source="Generate" leading trailing />
            </Button>
          </div>
        </div>
      )}

      {/* Versions panel */}
      {manageTarget && (
        <div
          ref={managePanelRef}
          className="scroll-mt-24 rounded-2xl border bg-card p-6 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {manageTarget.report_type_name} — {manageTarget.period_label}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {manageTarget.reference} · {manageTarget.company_name}
                  <SourceText
                    source="· every version is preserved"
                    leading
                    trailing
                  />
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageTarget(null)}
              >
                <SourceText source="Close" leading trailing />
              </Button>
            </div>

            <div className="space-y-3">
              {(versions?.results || []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  <SourceText
                    source="No versions yet — regenerate to create one."
                    leading
                    trailing
                  />
                </p>
              )}
              {(versions?.results || []).map((v: ReportVersion) => (
                <div
                  key={v.id}
                  className="space-y-3 rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium">
                        {sourceText("version")} {v.version_number}
                      </span>
                      <StatusBadgeView status={v.status} />
                      {v.is_partial && (
                        <Badge variant="outline">
                          <SourceText source="partial" />
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeFr(v.generated_at)}
                    </span>
                  </div>
                  {(v.missing_periods || []).length > 0 && (
                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <SourceText source="Missing periods:" leading trailing />
                      {v.missing_periods.join(", ")}
                      <SourceText source="(missing ≠ zero)" leading trailing />
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {(v.status === "preview" || v.status === "draft") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitMutation.mutate(v.id)}
                        disabled={submitMutation.isPending}
                      >
                        <FileCheck className="me-1 h-4 w-4" />
                        <SourceText
                          source="Submit for review"
                          leading
                          trailing
                        />
                      </Button>
                    )}
                    {v.status === "pending_review" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            approveMutation.mutate({
                              versionId: v.id,
                              approved: true,
                            })
                          }
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="me-1 h-4 w-4" />
                          <SourceText source="Approve" leading trailing />
                        </Button>
                        <div className="flex min-w-52 flex-1 items-center gap-1">
                          <Input
                            placeholder={sourceText(
                              "Rejection notes (required)",
                            )}
                            value={rejectNotes[v.id] || ""}
                            onChange={(e) =>
                              setRejectNotes((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            className="h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              const notes = (rejectNotes[v.id] || "").trim();
                              if (!notes) {
                                toast.error(
                                  sourceText("Rejection requires notes"),
                                );
                                return;
                              }
                              approveMutation.mutate({
                                versionId: v.id,
                                approved: false,
                                notes,
                              });
                            }}
                            disabled={approveMutation.isPending}
                          >
                            <XCircle className="me-1 h-4 w-4" />
                            <SourceText source="Reject" leading trailing />
                          </Button>
                        </div>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        reportsApi.versions
                          .exportXlsx(
                            v.id,
                            `${manageTarget.reference}_${sourceText("version")}_${v.version_number}`,
                          )
                          .catch((e) =>
                            toast.error(
                              e?.message || sourceText("Export failed"),
                            ),
                          )
                      }
                    >
                      <Download className="me-1 h-4 w-4" />
                      <SourceText source="XLSX" leading trailing />
                    </Button>
                    {v.ready_file_download_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reportsApi.versions
                            .downloadReadyFile(v)
                            .catch((e) =>
                              toast.error(
                                e?.message || sourceText("Download failed"),
                              ),
                            )
                        }
                      >
                        <Upload className="me-1 h-4 w-4 rotate-180" />
                        <SourceText source="Ready file" leading trailing />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Regenerate panel */}
      {regenerateTarget && (
        <div
          ref={regeneratePanelRef}
          className="scroll-mt-24 rounded-2xl border bg-card p-6 shadow-[0_16px_38px_rgba(15,23,42,.08)] space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">
                <SourceText source="Regenerate" leading trailing />
                {regenerateTarget.reference}
              </h3>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Creates a new version — the previous ones are preserved."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setRegenerateTarget(null)}
              disabled={regenerateMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </div>
          <div className="space-y-1.5 max-w-xl">
            <Label>
              <SourceText source="Reason *" />
            </Label>
            <Input
              value={regenerateReason}
              onChange={(e) => setRegenerateReason(e.target.value)}
              placeholder={sourceText("Why is this being regenerated?")}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setRegenerateTarget(null)}
              disabled={regenerateMutation.isPending}
            >
              <SourceText source="Cancel" leading trailing />
            </Button>
            <Button
              onClick={() => {
                if (!regenerateReason.trim()) {
                  toast.error(sourceText("A reason is required"));
                  return;
                }
                regenerateMutation.mutate({
                  report: regenerateTarget,
                  reason: regenerateReason.trim(),
                });
              }}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending && (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              )}
              <SourceText source="Regenerate" leading trailing />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
