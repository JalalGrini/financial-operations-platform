"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit,
  FilePlus2,
  Loader2,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { useRole } from "@/hooks/useRole";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { DefinitionList } from "@/components/ui/definition-list";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { Amount } from "@/components/ui/amount";
import { CopyButton } from "@/components/ui/copy-button";
import { configurationApi } from "@/features/configuration/api";
import { financialRecordsApi } from "@/features/financial-records/api";
import {
  buildFinancialRecordLineInput,
  canPostFinancialRecord,
  emptyFinancialRecordLineForm,
  requiredCancellationReason,
  type FinancialRecordLineForm,
} from "@/features/financial-records/contracts";
import type {
  CustomFieldDefinition,
  FinancialRecord,
  FinancialRecordCreateInput,
  FinancialRecordLine,
  FinancialRecordLineInput,
} from "@/features/financial-records/types";
import { partiesApi } from "@/features/parties/api";
import { ScheduleDate } from "@/components/ui/schedule-date";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

function money(value: string | number | undefined, currency: string): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(amount) ? amount : 0);
}
function fileSize(size: number): string {
  if (size < 1024) return `${size} ${sourceText("B")}`;
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} ${sourceText("KB")}`;
  return `${(size / (1024 * 1024)).toFixed(1)} ${sourceText("MB")}`;
}
function formatDateTimeFr(value?: string | null) {
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

function formatDateFr(value?: string | null) {
  if (!value) return sourceText("—");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const recordStatusLabels: Record<FinancialRecord["status"], string> = {
  draft: sourceText("Draft"),
  posted: sourceText("Posted"),
  cancelled: sourceText("Cancelled"),
};
function SummaryTile({
  title,
  value,
  helper,
  icon,
  tone = "default",
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-green-200/80 bg-green-50/70"
      : tone === "danger"
        ? "border-red-200/80 bg-red-50/70"
        : "border-border/70 bg-card/90";
  return (
    <Card className={toneClass + " shadow-[0_12px_28px_rgba(15,23,42,.05)]"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
          <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function statusVariant(status: FinancialRecord["status"]) {
  return status === "posted"
    ? "default"
    : status === "cancelled"
      ? "destructive"
      : "outline";
}
export default function FinancialRecordWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const [lineOpen, setLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<FinancialRecordLine | null>(
    null,
  );
  const [lineForm, setLineForm] = useState<FinancialRecordLineForm>(
    emptyFinancialRecordLineForm,
  );
  const [lineError, setLineError] = useState<string | null>(null);
  const [deleteLineTarget, setDeleteLineTarget] =
    useState<FinancialRecordLine | null>(null);
  const [postConfirm, setPostConfirm] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(
    null,
  );
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState<Record<string, string>>({});
  const [headerCustom, setHeaderCustom] = useState<Record<string, unknown>>({});
  const [headerError, setHeaderError] = useState<string | null>(null);

  // Every editor on this workspace is an inline panel rendered below the lines
  // table, so opening one from a button higher up changed something entirely
  // off-screen. Reveal each on open.
  const linePanelRef = useRevealOnOpen<HTMLDivElement>(lineOpen);
  const headerPanelRef = useRevealOnOpen<HTMLDivElement>(headerOpen);
  const cancelPanelRef = useRevealOnOpen<HTMLDivElement>(cancelOpen);
  const recordQuery = useQuery({
    queryKey: ["financial-records", "detail", id],
    queryFn: () => financialRecordsApi.get(id),
    enabled: Boolean(id),
  });
  const record = recordQuery.data;
  const { data: categories } = useQuery({
    queryKey: ["configuration:categories", "line-options"],
    queryFn: () =>
      configurationApi.categories.list({
        page_size: 500,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });
  const categoryOptions = (categories?.results || []).map((item) => ({
    value: item.id,
    label: item.full_path || item.name,
  }));
  const { data: clients } = useQuery({
    queryKey: ["parties:clients", "record-company", record?.company],
    queryFn: () =>
      partiesApi.clients.list({
        page_size: 500,
        company: record?.company,
        archive_state: "active",
      } as any),
    enabled: Boolean(record?.company),
  });
  const { data: suppliers } = useQuery({
    queryKey: ["parties:suppliers", "record-company", record?.company],
    queryFn: () =>
      partiesApi.suppliers.list({
        page_size: 500,
        company: record?.company,
        archive_state: "active",
      } as any),
    enabled: Boolean(record?.company),
  });
  const fieldDefinitions = useMemo(() => {
    const fields = record?.template_snapshot?.fields;
    return Array.isArray(fields) ? (fields as CustomFieldDefinition[]) : [];
  }, [record?.template_snapshot]);
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["financial-records", "detail", id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["financial-records", "list"],
      }),
    ]);
  };
  // This detail page had no role gating at all: a Director (read-only on the
  // server) was shown Edit header, Cancel, Post, Add line, Edit line, Delete
  // line, Upload and Remove file, and every one of them 403s on click.
  // CanManageFinancialRecord is the standard matrix, so writes are
  // Administrator+Assistant and the two DELETE calls are Administrator only.
  const { canWrite, canDelete } = useRole();

  const addLineMutation = useMutation({
    mutationFn: (payload: FinancialRecordLineInput) =>
      financialRecordsApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const updateLineMutation = useMutation({
    mutationFn: ({
      lineId,
      payload,
    }: {
      lineId: string;
      payload: FinancialRecordLineInput;
    }) => financialRecordsApi.updateLine(id, lineId, payload),
    onSuccess: invalidate,
  });
  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => financialRecordsApi.deleteLine(id, lineId),
    onSuccess: invalidate,
  });
  const postMutation = useMutation({
    mutationFn: () => financialRecordsApi.post(id),
    onSuccess: invalidate,
  });
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => financialRecordsApi.cancel(id, reason),
    onSuccess: invalidate,
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => financialRecordsApi.uploadAttachment(id, file),
    onSuccess: invalidate,
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      financialRecordsApi.deleteAttachment(id, attachmentId),
    onSuccess: invalidate,
  });
  const updateHeaderMutation = useMutation({
    mutationFn: (payload: Partial<FinancialRecordCreateInput>) =>
      financialRecordsApi.update(id, payload),
    onSuccess: invalidate,
  });
  const openHeaderEditor = () => {
    if (!record) return;
    setHeaderForm({
      record_date: record.record_date,
      description: record.description,
      notes: record.notes || "",
      currency: record.currency,
      category: record.category || "",
      client: record.client || "",
      supplier: record.supplier || "",
    });
    setHeaderCustom({ ...record.custom_fields });
    setHeaderError(null);
    setHeaderOpen(true);
  };
  const openLine = (line?: FinancialRecordLine) => {
    setEditingLine(line || null);
    setLineError(null);
    if (line) {
      const debit = Number(line.debit);
      setLineForm({
        description: line.description,
        category: line.category || "",
        side: debit > 0 ? "debit" : "credit",
        amount: String(debit > 0 ? line.debit : line.credit),
      });
    } else {
      setLineForm(emptyFinancialRecordLineForm);
    }
    setLineOpen(true);
  };
  const saveLine = async () => {
    setLineError(null);
    const built = buildFinancialRecordLineInput(lineForm);
    if (built.error || !built.payload)
      return setLineError(built.error || sourceText("Invalid line."));
    const payload: FinancialRecordLineInput = built.payload;
    try {
      if (editingLine)
        await updateLineMutation.mutateAsync({
          lineId: editingLine.id,
          payload,
        });
      else await addLineMutation.mutateAsync(payload);
      toast.success(sourceText(editingLine ? "Line updated" : "Line added"));
      setLineOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : sourceText("Line save failed");
      setLineError(message);
      toast.error(message);
    }
  };
  const saveHeader = async () => {
    setHeaderError(null);
    if (!headerForm.record_date)
      return setHeaderError(sourceText("Record date is required."));
    if (!headerForm.description?.trim())
      return setHeaderError(sourceText("Description is required."));
    const custom = { ...headerCustom };
    for (const definition of fieldDefinitions) {
      const value = custom[definition.key];
      if (
        definition.is_required &&
        (value === undefined || value === null || value === "")
      ) {
        return setHeaderError(
          `${definition.label} ${sourceText("is required")}.`,
        );
      }
      if (
        definition.data_type === "multi_choice" &&
        typeof value === "string"
      ) {
        custom[definition.key] = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
    try {
      await updateHeaderMutation.mutateAsync({
        record_date: headerForm.record_date,
        description: headerForm.description.trim(),
        notes: headerForm.notes || "",
        currency: (headerForm.currency || "MAD").toUpperCase(),
        category: headerForm.category || null,
        client: headerForm.client || null,
        supplier: headerForm.supplier || null,
        custom_fields: custom,
      });
      setHeaderOpen(false);
      toast.success(sourceText("Draft header updated"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : sourceText("Update failed");
      setHeaderError(message);
      toast.error(message);
    }
  };
  const postRecord = async () => {
    try {
      await postMutation.mutateAsync();
      setPostConfirm(false);
      toast.success(sourceText("Record posted to the ledger"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : sourceText("Posting failed"),
      );
    }
  };
  const cancelRecord = async () => {
    setCancelError(null);
    const validatedReason = requiredCancellationReason(cancelReason);
    if (validatedReason.error || !validatedReason.value)
      return setCancelError(
        validatedReason.error ||
          sourceText("A cancellation reason is required."),
      );
    try {
      await cancelMutation.mutateAsync(validatedReason.value);
      setCancelOpen(false);
      setCancelReason("");
      toast.success(sourceText("Posted record cancelled with an audit reason"));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : sourceText("Cancellation failed");
      setCancelError(message);
      toast.error(message);
    }
  };
  const uploadAttachment = async () => {
    if (!attachmentFile) return;
    try {
      await uploadMutation.mutateAsync(attachmentFile);
      setAttachmentFile(null);
      const input = document.getElementById(
        "record-attachment",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      toast.success(sourceText("Attachment uploaded"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : sourceText("Upload failed"),
      );
    }
  };
  if (recordQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (recordQuery.isError || !record) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => router.push("/financial-records")}
        >
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back" leading trailing />
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          <AlertCircle className="mb-2 h-6 w-6" />
          {recordQuery.error instanceof Error
            ? recordQuery.error.message
            : sourceText("Financial record not found.")}
        </div>
      </div>
    );
  }
  const savingLine = addLineMutation.isPending || updateLineMutation.isPending;
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Financial Records");
            },
            href: "/financial-records",
          },
          { label: record.reference, isCurrent: true },
        ]}
      />
      <PageHero
        icon={ReceiptText}
        eyebrow={record.record_type_name || "Financial record"}
        title={record.reference}
        description={record.company_name || sourceText("No company linked")}
        action={
          <div className="flex gap-2">
            {record.is_editable && canWrite && (
              <Button variant="outline" onClick={openHeaderEditor}>
                <Edit className="me-2 h-4 w-4" />
                <SourceText source="Edit header" leading trailing />
              </Button>
            )}
            {record.status === "posted" && canWrite && (
              <Button
                variant="destructive"
                onClick={() => {
                  setCancelError(null);
                  setCancelOpen(true);
                }}
              >
                <XCircle className="me-2 h-4 w-4" />
                <SourceText source="Cancel record" leading trailing />
              </Button>
            )}
            {record.status === "draft" && canWrite && (
              <Button
                onClick={() => setPostConfirm(true)}
                disabled={!canPostFinancialRecord(record)}
              >
                <CheckCircle2 className="me-2 h-4 w-4" />
                <SourceText source="Post to ledger" leading trailing />
              </Button>
            )}
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldCheck} label={sourceText("Status")} value={recordStatusLabels[record.status] || record.status} tone="primary" />
          <StatCard icon={ReceiptText} label={sourceText("Total debits")} value={money(record.debit_total, record.currency)} tone="indigo" />
          <StatCard icon={ReceiptText} label={sourceText("Total credits")} value={money(record.credit_total, record.currency)} tone="amber" />
          <StatCard icon={ReceiptText} label={sourceText("Balance")} value={money(record.balance, record.currency)} tone={Number(record.balance) === 0 ? "emerald" : "rose"} />
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText("Accounting guidance")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {sourceText("Validate the draft before posting it to the ledger")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sourceText(
              "Review counterparties, supporting files and debit-credit balance on the page before locking the record into accounting history.",
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              {sourceText(
                "Keep supporting files attached directly to the record for future audits.",
              )}
            </li>
            <li>
              {sourceText(
                "Use clear line descriptions so downstream reviews remain understandable.",
              )}
            </li>
            <li>
              {sourceText(
                "Cancel posted records only with a documented audit reason.",
              )}
            </li>
          </ul>
        </div>
      </section>

      {record.status === "draft" && !canPostFinancialRecord(record) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            <SourceText source="Posting is disabled until:" leading trailing />
          </p>
          <ul className="mt-1 list-disc ps-5 text-sm text-amber-800">
            {(record.post_blockers || []).map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}
      {record.status !== "draft" && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <strong>
            <SourceText source="Immutable accounting state." />
          </strong>
          <SourceText
            source="Posted and cancelled headers and lines cannot be changed. Supporting documents may still be added."
            leading
            trailing
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              <SourceText source="Record details" />
            </CardTitle>
            {record.template_name && (
              <Badge variant="outline">
                {record.template_name} · {sourceText("version")}{" "}
                {record.template_version}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="pt-2">
            <DefinitionList
              cols={2}
              items={[
                { label: sourceText("Date"), value: formatDateFr(record.record_date) },
                { label: sourceText("Currency"), value: record.currency },
                { label: sourceText("Category"), value: record.category_name || sourceText("—") },
                { label: sourceText("Client"), value: record.client_name || sourceText("—") },
                { label: sourceText("Supplier"), value: record.supplier_name || sourceText("—") },
                {
                  label: sourceText("Description"),
                  value: record.description,
                  wide: true,
                },
                ...fieldDefinitions.map((def) => ({
                  label: def.label,
                  value: Array.isArray(record.custom_fields[def.key])
                    ? (record.custom_fields[def.key] as unknown[]).join(", ")
                    : String(record.custom_fields[def.key] ?? sourceText("—")),
                })),
                ...(record.notes
                  ? [{ label: sourceText("Notes"), value: record.notes, wide: true }]
                  : []),
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Lifecycle" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Timeline>
              <TimelineItem
                tone="primary"
                title={sourceText("Created")}
                description={formatDateTimeFr(record.created_at)}
              />
              <TimelineItem
                tone="default"
                title={sourceText("Last updated")}
                description={formatDateTimeFr(record.updated_at)}
                isLast={!record.posted_at && !record.cancelled_at}
              />
              {record.posted_at && (
                <TimelineItem
                  tone="success"
                  title={sourceText("Posted to ledger")}
                  description={formatDateTimeFr(record.posted_at)}
                  isLast={!record.cancelled_at}
                />
              )}
              {record.cancelled_at && (
                <TimelineItem
                  tone="danger"
                  title={sourceText("Cancelled")}
                  description={formatDateTimeFr(record.cancelled_at)}
                  isLast
                >
                  {record.cancellation_reason && (
                    <p className="mt-1 rounded-lg border border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-surface))] px-3 py-2 text-xs text-[hsl(var(--danger))]">
                      {record.cancellation_reason}
                    </p>
                  )}
                </TimelineItem>
              )}
            </Timeline>
          </CardContent>
        </Card>
      </div>

      <Card padding="none">
        <CardHeader className="flex-row items-center justify-between p-6">
          <div>
            <CardTitle>
              <SourceText source="Debit / credit lines" />
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              <SourceText
                source="Each line carries exactly one side. The record must balance before posting."
                leading
                trailing
              />
            </p>
          </div>
          {record.is_editable && canWrite && (
            <Button size="sm" onClick={() => openLine()}>
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Add line" leading trailing />
            </Button>
          )}
        </CardHeader>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>
                <SourceText source="Description" />
              </TableHead>
              <TableHead>
                <SourceText source="Category" />
              </TableHead>
              <TableHead className="text-end">
                <SourceText source="Debit" />
              </TableHead>
              <TableHead className="text-end">
                <SourceText source="Credit" />
              </TableHead>
              {record.is_editable && (
                <TableHead className="w-24">
                  <SourceText source="Actions" />
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(record.lines || []).map((line) => (
              <TableRow className="row-hover" key={line.id}>
                <TableCell>{line.line_number}</TableCell>
                <TableCell>{line.description || sourceText("—")}</TableCell>
                <TableCell>{line.category_name || sourceText("—")}</TableCell>
                <TableCell className="text-end font-mono">
                  {Number(line.debit) > 0
                    ? money(line.debit, record.currency)
                    : sourceText("—")}
                </TableCell>
                <TableCell className="text-end font-mono">
                  {Number(line.credit) > 0
                    ? money(line.credit, record.currency)
                    : sourceText("—")}
                </TableCell>
                {record.is_editable && (
                  <TableCell>
                    <div className="flex">
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openLine(line)}
                          aria-label={sourceText("Edit line")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => setDeleteLineTarget(line)}
                          aria-label={sourceText("Delete line")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {(record.lines || []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={record.is_editable ? 6 : 5}
                  className="py-10 text-center text-muted-foreground"
                >
                  <SourceText
                    source="No lines yet. Add one debit and one credit line."
                    leading
                    trailing
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText source="Supporting documents" />
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          {canWrite && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="record-attachment"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx"
                onChange={(event) =>
                  setAttachmentFile(event.target.files?.[0] || null)
                }
              />
              <Button
                onClick={uploadAttachment}
                disabled={!attachmentFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus2 className="me-2 h-4 w-4" />
                )}
                <SourceText source="Upload" leading trailing />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <SourceText
              source="PDF, JPEG, PNG, CSV or XLSX; maximum 10 MB."
              leading
              trailing
            />
          </p>
          <div className="divide-y rounded-lg border">
            {(record.attachments || []).map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.content_type || sourceText("Unknown type")} ·{" "}
                    {fileSize(attachment.size_bytes)}
                  </p>
                </div>
                <div className="flex">
                  <Button asChild variant="ghost" size="icon">
                    <a
                      href={attachment.download_url}
                      aria-label={`${sourceText("Download file")} ${attachment.file_name}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600"
                      onClick={() => setDeleteAttachmentId(attachment.id)}
                      aria-label={`${sourceText("Remove file")} ${attachment.file_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(record.attachments || []).length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                <SourceText
                  source="No supporting documents."
                  leading
                  trailing
                />
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" asChild>
        <Link href="/financial-records">
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back to records" leading trailing />
        </Link>
      </Button>

      {lineOpen && (
        <Card
          ref={linePanelRef}
          className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              {editingLine ? sourceText("Edit line") : sourceText("Add line")}
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setLineOpen(false)}
              disabled={savingLine}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            {lineError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {lineError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Description" />
              </Label>
              <Input
                value={lineForm.description}
                onChange={(event) =>
                  setLineForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Category" />
              </Label>
              <Select
                value={lineForm.category || "none"}
                onValueChange={(value) =>
                  setLineForm((previous) => ({
                    ...previous,
                    category: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <SourceText source="None" />
                  </SelectItem>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Side *" />
                </Label>
                <Select
                  value={lineForm.side}
                  onValueChange={(value) =>
                    setLineForm((previous) => ({
                      ...previous,
                      side: value as "debit" | "credit",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">
                      <SourceText source="Debit" />
                    </SelectItem>
                    <SelectItem value="credit">
                      <SourceText source="Credit" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Amount *" />
                </Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={lineForm.amount}
                  onChange={(event) =>
                    setLineForm((previous) => ({
                      ...previous,
                      amount: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLineOpen(false)}
                disabled={savingLine}
              >
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button onClick={saveLine} disabled={savingLine}>
                {savingLine && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Save line" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {headerOpen && (
        <Card
          ref={headerPanelRef}
          className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Edit draft header" />
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setHeaderOpen(false)}
              disabled={updateHeaderMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {headerError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {headerError}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Date *" />
                </Label>
                <ScheduleDate
                  value={headerForm.record_date || "" || ""}
                  onChange={(val: string) =>
                    setHeaderForm((previous) => ({
                      ...previous,
                      record_date: val,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Currency" />
                </Label>
                <Input
                  maxLength={3}
                  value={headerForm.currency || ""}
                  onChange={(event) =>
                    setHeaderForm((previous) => ({
                      ...previous,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Description *" />
              </Label>
              <Input
                value={headerForm.description || ""}
                onChange={(event) =>
                  setHeaderForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Category" />
                </Label>
                <Select
                  value={headerForm.category || "none"}
                  onValueChange={(value) =>
                    setHeaderForm((previous) => ({
                      ...previous,
                      category: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <SourceText source="None" />
                    </SelectItem>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Client" />
                </Label>
                <Select
                  value={headerForm.client || "none"}
                  onValueChange={(value) =>
                    setHeaderForm((previous) => ({
                      ...previous,
                      client: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <SourceText source="None" />
                    </SelectItem>
                    {(clients?.results || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Supplier" />
                </Label>
                <Select
                  value={headerForm.supplier || "none"}
                  onValueChange={(value) =>
                    setHeaderForm((previous) => ({
                      ...previous,
                      supplier: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <SourceText source="None" />
                    </SelectItem>
                    {(suppliers?.results || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fieldDefinitions.map((definition) => (
              <div key={definition.key} className="space-y-1.5">
                {definition.data_type === "boolean" ? (
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(headerCustom[definition.key])}
                      onChange={(event) =>
                        setHeaderCustom((previous) => ({
                          ...previous,
                          [definition.key]: event.target.checked,
                        }))
                      }
                    />
                    {definition.label}
                  </label>
                ) : (
                  <>
                    <Label>
                      {definition.label}
                      {definition.is_required && " *"}
                    </Label>
                    {definition.data_type === "choice" ? (
                      <Select
                        value={String(headerCustom[definition.key] ?? "")}
                        onValueChange={(value) =>
                          setHeaderCustom((previous) => ({
                            ...previous,
                            [definition.key]: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {definition.choices.map((choice) => (
                            <SelectItem key={choice} value={choice}>
                              {choice}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={
                          definition.data_type === "date"
                            ? "date"
                            : ["integer", "decimal"].includes(
                                  definition.data_type,
                                )
                              ? "number"
                              : "text"
                        }
                        value={String(headerCustom[definition.key] ?? "")}
                        onChange={(event) =>
                          setHeaderCustom((previous) => ({
                            ...previous,
                            [definition.key]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </>
                )}
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Notes" />
              </Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                value={headerForm.notes || ""}
                onChange={(event) =>
                  setHeaderForm((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setHeaderOpen(false)}
                disabled={updateHeaderMutation.isPending}
              >
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button
                onClick={saveHeader}
                disabled={updateHeaderMutation.isPending}
              >
                {updateHeaderMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Save header" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cancelOpen && (
        <Card
          ref={cancelPanelRef}
          className="scroll-mt-24 border-red-200 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Cancel posted record" />
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <p className="text-sm text-muted-foreground">
              <SourceText
                source="Cancellation is retained in history and requires an audit reason."
                leading
                trailing
              />
            </p>
            {cancelError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {cancelError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Reason *" />
              </Label>
              <textarea
                rows={4}
                maxLength={500}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={sourceText("e.g., Duplicate of FRC-2026-00042")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCancelOpen(false)}
                disabled={cancelMutation.isPending}
              >
                <SourceText source="Keep record" leading trailing />
              </Button>
              <Button
                variant="destructive"
                onClick={cancelRecord}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Cancel record" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        isOpen={postConfirm}
        onClose={() => setPostConfirm(false)}
        onConfirm={postRecord}
        title={sourceText("Post to ledger")}
        description={`${sourceText("Post record prompt prefix")} ${record.reference}. ${sourceText("Its header and lines become immutable.")}`}
        confirmLabel={sourceText("Post record")}
        cancelLabel={sourceText("Keep draft")}
        isLoading={postMutation.isPending}
      />
      <ConfirmDialog
        isOpen={deleteLineTarget !== null}
        onClose={() => setDeleteLineTarget(null)}
        onConfirm={async () => {
          if (!deleteLineTarget) return;
          try {
            await deleteLineMutation.mutateAsync(deleteLineTarget.id);
            setDeleteLineTarget(null);
            toast.success(sourceText("Line removed"));
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : sourceText("Delete failed"),
            );
          }
        }}
        title={sourceText("Remove line")}
        description={`${sourceText("Remove line prompt prefix")} ${deleteLineTarget?.line_number ?? ""} ${sourceText("from this draft question")}`}
        confirmLabel={sourceText("Remove")}
        cancelLabel={sourceText("Keep line")}
        variant="destructive"
        isLoading={deleteLineMutation.isPending}
      />
      <ConfirmDialog
        isOpen={deleteAttachmentId !== null}
        onClose={() => setDeleteAttachmentId(null)}
        onConfirm={async () => {
          if (!deleteAttachmentId) return;
          try {
            await deleteAttachmentMutation.mutateAsync(deleteAttachmentId);
            setDeleteAttachmentId(null);
            toast.success(sourceText("Attachment removed"));
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : sourceText("Delete failed"),
            );
          }
        }}
        title={sourceText("Remove attachment")}
        description={sourceText(
          "Remove this file from the visible record? Its audit metadata is retained.",
        )}
        confirmLabel={sourceText("Remove")}
        cancelLabel={sourceText("Keep attachment")}
        variant="destructive"
        isLoading={deleteAttachmentMutation.isPending}
      />
    </div>
  );
}