"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Archive, Copy, Edit, Eye, Loader2, Plus, Send, Upload,
  RefreshCw,
  Search
} from "lucide-react";
import { toast } from "@/components/ui/toast";

import { SourceText } from "@/components/i18n/SourceText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { Breadcrumb } from "@/components/ui/page-components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterPopover } from "@/components/ui/filter-popover";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { configurationApi } from "@/features/configuration/api";
import { financialTemplatesApi } from "@/features/financial-records/api";

import type { FinancialDocumentTemplate } from "@/features/financial-records/types";
// AdminOnly, not WriteOnly, and this is a correctness fix rather than a
// tightening.
//
// FinancialDocumentTemplateViewSet declares
// `permission_classes = [IsAuthenticated, IsAdministratorOrReadOnly]`, so only
// an Administrator may write a template. WriteOnly resolves to Administrator OR
// Assistant, so every Assistant was shown New / Edit / Publish / Archive /
// Restore and got a 403 the moment they saved. The UI now states the rule the
// API actually enforces.
//
// Widening the API to WRITE_ROLES instead would grant Assistants a permission
// they do not have today over financial document templates. That is a product
// decision, not a bug fix, so it is deliberately NOT taken here.
import { AdminOnly } from "@/components/auth/WriteOnly";
import { GuidePanel } from "@/components/ui/guide-panel";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

function SummaryTile({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/90 shadow-[0_12px_28px_rgba(15,23,42,.05)]">
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

function templateVariant(status: FinancialDocumentTemplate["status"]) {
  return status === "published"
    ? "default"
    : status === "archived"
      ? "destructive"
      : "outline";
}

function formatDateValue(value?: string | null) {
  if (!value) return sourceText("Open-ended");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

const templateStatusLabels: Record<
  FinancialDocumentTemplate["status"],
  string
> = {
  draft: sourceText("Draft"),
  published: sourceText("Published"),
  archived: sourceText("Archived"),
};

export default function DocumentTemplatesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [publishTarget, setPublishTarget] =
    useState<FinancialDocumentTemplate | null>(null);
  const [archiveTarget, setArchiveTarget] =
    useState<FinancialDocumentTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // The import panel renders below the template list.
  const importPanelRef = useRevealOnOpen<HTMLDivElement>(importOpen);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRecordType, setImportRecordType] = useState("");
  const [importName, setImportName] = useState("");
  const { data: recordTypes } = useQuery({
    queryKey: ["configuration:record-types", "template-options"],
    queryFn: () =>
      configurationApi["record-types"].list({
        page_size: 500,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });
  const templateQuery = useQuery({
    queryKey: ["financial-templates", recordTypeFilter, showArchived],
    queryFn: () =>
      financialTemplatesApi.list({
        page_size: 500,
        record_type: recordTypeFilter || undefined,
        archive_state: showArchived ? "archived" : "active",
      }),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["financial-templates"] });
    queryClient.invalidateQueries({
      queryKey: ["financial-records", "field-contract"],
    });
  };
  const publishMutation = useMutation({
    mutationFn: (id: string) => financialTemplatesApi.publish(id),
    onSuccess: invalidate,
  });
  const versionMutation = useMutation({
    mutationFn: financialTemplatesApi.newVersion,
    onSuccess: invalidate,
  });
  const archiveMutation = useMutation({
    mutationFn: financialTemplatesApi.archive,
    onSuccess: invalidate,
  });
  const restoreMutation = useMutation({
    mutationFn: financialTemplatesApi.restore,
    onSuccess: invalidate,
  });
  const importMutation = useMutation({
    mutationFn: ({
      file,
      recordType,
      name,
    }: {
      file: File;
      recordType: string;
      name: string;
    }) => financialTemplatesApi.importXlsx(file, recordType, name),
    onSuccess: invalidate,
  });
  const publish = async () => {
    if (!publishTarget) return;
    try {
      await publishMutation.mutateAsync(publishTarget.id);
      toast.success(
        `${sourceText("Published template prompt prefix")} ${publishTarget.name} · ${sourceText("version")} ${publishTarget.version} ${sourceText("Published template prompt suffix")}`,
      );
      setPublishTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : sourceText("Publish failed"),
      );
    }
  };
  const archive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveMutation.mutateAsync(archiveTarget.id);
      toast.success(
        sourceText("Template archived; existing records retain their snapshot"),
      );
      setArchiveTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : sourceText("Archive failed"),
      );
    }
  };
  const templates = templateQuery.data?.results || [];
  const draftCount = templates.filter(
    (template) => template.status === "draft",
  ).length;
  const publishedCount = templates.filter(
    (template) => template.status === "published",
  ).length;
  const defaultCount = templates.filter(
    (template) => template.is_default,
  ).length;
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Configuration");
            },
            href: "/configuration",
          },
          {
            get label() {
              return sourceText("Document Templates");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={Send}
        eyebrow="Document schema registry"
        title={sourceText("Financial Document Templates")}
        description={sourceText("Build fields manually or import a deterministic Excel field sheet, then review and publish.")}
        action={<AdminOnly>
          <div className="flex gap-2">
            <Button
              variant="onHeroOutline"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="me-2 h-4 w-4" />
              <SourceText source="Import Excel" leading trailing />
            </Button>
            <Button variant="onHero" asChild>
              <Link href="/configuration/templates/new">
                <Plus className="me-2 h-4 w-4" />
                <SourceText source="New template draft" leading trailing />
              </Link>
            </Button>
          </div>
        </AdminOnly>}
      />
      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Eye} label={sourceText("Visible versions")} value={templates.length} tone="primary" />
          <StatCard icon={Edit} label={sourceText("Drafts")} value={draftCount} tone="amber" />
          <StatCard icon={Send} label={sourceText("Published")} value={publishedCount} tone="emerald" />
          <StatCard icon={Copy} label={sourceText("Defaults")} value={defaultCount} tone="indigo" />
        </div>

        <GuidePanel
          eyebrow={"Template governance guide"}
          title={"Version financial document schemas deliberately"}
          body={"Use drafts for experimentation, publish only reviewed versions, and keep old snapshots archived so record history stays stable."}
          items={[
            "Keep field keys stable because they become part of the document contract.",
            "Publish a new version instead of editing a published schema in place.",
            "Use Excel import for deterministic field sheets, then review the generated draft before publishing.",
          ]}
        />
      </section>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={sourceText("Search by template name, record type, version...")}
                className="ps-10"
              />
            </div>
            <FilterPopover
              groups={[
                { key: "recordType", label: sourceText("Record Type"), options: (recordTypes?.results || []).map((item) => ({ value: item.id, label: item.name })) },
                { key: "status", label: sourceText("Status"), options: [
                  { value: "draft", label: sourceText("Draft") },
                  { value: "published", label: sourceText("Published") },
                  { value: "archived", label: sourceText("Archived") },
                ]},
              ]}
              selected={{ recordType: recordTypeFilter ? [recordTypeFilter] : [] }}
              onSelectedChange={(next) => setRecordTypeFilter(next.recordType?.[0] ?? "")}
              onReset={() => setRecordTypeFilter("")}
            />
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived(!showArchived)}
              className="shrink-0 gap-2"
            >
              <Archive className="h-4 w-4" />
              {showArchived ? sourceText("View active") : sourceText("View archive")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-lg"
              onClick={() => templateQuery.refetch()}
              disabled={templateQuery.isLoading}
              title={sourceText("Refresh")}
            >
              {templateQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
      {templateQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      )}
      {templateQuery.isError && (
        <p className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          {templateQuery.error instanceof Error
            ? templateQuery.error.message
            : sourceText("Template list failed.")}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{template.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {template.record_type_name}
                  <SourceText source="· version" leading trailing />
                  {template.version}
                </p>
              </div>
              <div className="flex gap-1">
                <Badge variant={templateVariant(template.status)}>
                  {templateStatusLabels[template.status] || template.status}
                </Badge>
                {template.is_default && (
                  <Badge variant="outline">
                    <SourceText source="Default" />
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="mt-4 space-y-4">
              <p className="text-sm">
                {template.description || sourceText("No description.")}
              </p>
              <div className="flex flex-wrap gap-2">
                {template.fields.map((field) => (
                  <Badge key={field.id || field.key} variant="outline">
                    {field.label}
                    {field.is_required ? " *" : ""}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {template.fields.length} {sourceText("fields")}
                <SourceText source="· effective" leading trailing />
                {sourceText("Effective range")}{" "}
                {template.effective_from
                  ? formatDateValue(template.effective_from)
                  : sourceText("immediately")}
                {template.effective_to
                  ? ` ${sourceText("to")} ${formatDateValue(template.effective_to)}`
                  : ` · ${sourceText("Open-ended")}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <AdminOnly>
                  {/* `!template.is_archived` matters as well as the draft check:
                    * an archived draft is still status "draft", so Edit and
                    * Publish were offered on it and the API refuses both. Restore
                    * is the only action an archived template has, and it is
                    * rendered further down. */}
                  {template.status === "draft" && !template.is_archived && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={`/configuration/templates/${template.id}/edit`}
                        >
                          <Edit className="me-1 h-4 w-4" />
                          <SourceText source="Edit" leading trailing />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setPublishTarget(template)}
                      >
                        <Send className="me-1 h-4 w-4" />
                        <SourceText source="Publish" leading trailing />
                      </Button>
                    </>
                  )}
                </AdminOnly>
                {/* "New version" was ungated entirely. It calls versionMutation,
                  * which POSTs a new draft, so a Director saw it and got a 403.
                  * Not listed in any handover; found while re-gating this page. */}
                <AdminOnly>
                {template.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const draft = await versionMutation.mutateAsync(
                          template.id,
                        );
                        toast.success(
                          `${sourceText("Created draft version")} ${draft.version}`,
                        );
                        router.push(
                          `/configuration/templates/${draft.id}/edit`,
                        );
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : sourceText("Version creation failed"),
                        );
                      }
                    }}
                    disabled={versionMutation.isPending}
                  >
                    <Copy className="me-1 h-4 w-4" />
                    <SourceText source="New version" leading trailing />
                  </Button>
                )}
                </AdminOnly>
                {/* Archive was ungated too, for the same reason. */}
                <AdminOnly>
                {!template.is_archived && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-amber-700"
                    onClick={() => setArchiveTarget(template)}
                  >
                    <Archive className="me-1 h-4 w-4" />
                    <SourceText source="Archive" leading trailing />
                  </Button>
                )}
                </AdminOnly>
                <AdminOnly>
                  {template.is_archived && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700"
                      onClick={async () => {
                        try {
                          await restoreMutation.mutateAsync(template.id);
                          toast.success(
                            sourceText("Template restored as a draft"),
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : sourceText("Template restore failed"),
                          );
                        }
                      }}
                      disabled={restoreMutation.isPending}
                    >
                      <RotateCcw className="me-1 h-4 w-4" />
                      <SourceText source="Restore" leading trailing />
                    </Button>
                  )}
                </AdminOnly>
              </div>
            </CardContent>
          </Card>
        ))}
        {!templateQuery.isLoading && templates.length === 0 && (
          <div className="lg:col-span-2 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            <SourceText source="No" leading trailing />
            {showArchived ? sourceText("archived") : sourceText("active")}
            <SourceText source="template versions." leading trailing />
          </div>
        )}
      </div>


        </CardContent>
      </Card>
      {importOpen && (
        <Card
          ref={importPanelRef}
          className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  <SourceText source="Import Excel template" />
                </h3>
                <p className="text-sm text-muted-foreground">
                  <SourceText
                    source="Column A: label. Optional B: type, C: required, D: choices, E: section. The result is always a reviewable draft."
                    leading
                    trailing
                  />
                </p>
              </div>
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                <SourceText source="Close" leading trailing />
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5 xl:col-span-2">
                <Label>
                  <SourceText source="Record type *" />
                </Label>
                <Select
                  value={importRecordType}
                  onValueChange={setImportRecordType}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={sourceText("Select record type")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(recordTypes?.results || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>
                  <SourceText source="Template name *" />
                </Label>
                <Input
                  value={importName}
                  onChange={(event) => setImportName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5 rounded-xl border border-dashed p-4 md:col-span-2 xl:col-span-4">
                <Label>
                  <SourceText source="Excel workbook *" />
                </Label>
                <Input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) =>
                    setImportFile(event.target.files?.[0] || null)
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button
                disabled={
                  !importFile ||
                  !importRecordType ||
                  !importName.trim() ||
                  importMutation.isPending
                }
                onClick={async () => {
                  if (!importFile) return;
                  try {
                    await importMutation.mutateAsync({
                      file: importFile,
                      recordType: importRecordType,
                      name: importName.trim(),
                    });
                    toast.success(
                      sourceText("Excel template imported as a draft"),
                    );
                    setImportOpen(false);
                    setImportFile(null);
                    setImportName("");
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : sourceText("Excel import failed"),
                    );
                  }
                }}
              >
                {importMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Import draft" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        isOpen={publishTarget !== null}
        onClose={() => setPublishTarget(null)}
        onConfirm={publish}
        title={sourceText("Publish template version")}
        description={`${sourceText("Publish template version prompt prefix")} ${publishTarget?.name || ""} · ${sourceText("version")} ${publishTarget?.version || ""} ${sourceText("Publish template version prompt suffix")}`}
        confirmLabel={sourceText("Publish")}
        cancelLabel={sourceText("Keep draft")}
        isLoading={publishMutation.isPending}
      />
      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archive}
        title={sourceText("Archive template version")}
        description={`${archiveTarget?.name || sourceText("Template")} · ${sourceText("version")} ${archiveTarget?.version || ""} · ${sourceText("Existing Financial Records keep their immutable schema snapshot. New records stop using this version.")}`}
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Keep template")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
}