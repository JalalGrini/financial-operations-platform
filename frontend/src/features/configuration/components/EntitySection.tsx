"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Archive, RotateCcw, Edit, Loader2,
  RefreshCw
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleDate } from "@/components/ui/schedule-date";

import { SourceText } from "@/components/i18n/SourceText";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { Button } from "@/components/ui/button";
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
  DataTable,
  Pagination,
  SearchInput,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ExportButton } from "@/components/ui/export-button";
import { listExportApi, type ListExportKey } from "@/features/exports/api";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";

/**
 * Reusable entity-section: search + archive toggle + table + create/edit
 * dialog + archive/restore confirm — one generic implementation shared by the
 * configuration, parties, treasury and financial-records modules (Cycle 29).
 *
 * Data access is injected through the `crud` prop so the component stays
 * feature-agnostic; `queryKey` namespaces the TanStack Query cache.
 */
export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "select" | "date";
  options?: {
    value: string;
    label: string;
  }[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  step?: string;
  /** Read-only in edit mode (identity fields). */
  lockedInEdit?: boolean;
  visibleWhen?: {
    field: string;
    equals: string | number | boolean;
  };
}
export type ListQueryParams = Record<
  string,
  string | number | boolean | undefined
>;
export interface CrudApi<T> {
  list: (params?: ListQueryParams) => Promise<{
    count: number;
    results: T[];
  }>;
  create: (data: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  archive: (id: string) => Promise<unknown>;
  restore: (id: string) => Promise<unknown>;
}
export interface ColumnDef<T> {
  key: keyof T | string;
  header: React.ReactNode;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}
interface EntitySectionProps<
  T extends {
    id: string;
    name?: string;
    is_archived?: boolean;
  },
> {
  queryKey: string;
  crud: CrudApi<T>;
  title: string;
  description: string;
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  createDefaults?: Record<string, unknown>;
  /** Map a row to form values for the edit dialog. */
  getEditValues: (row: T) => Record<string, unknown>;
  /** Optional extra list params (e.g. fixed filters). */
  baseParams?: ListQueryParams;
  /**
   * Optional list-export endpoint key. When set, an Export button appears in
   * the section header. Clients and suppliers both render through this shared
   * section rather than through a page of their own, so wiring the button here
   * is what gives both of them one, instead of two near-identical copies.
   *
   * The export is sent with this section's fixed filters and its search box,
   * which is what the list query itself uses. The archived toggle is a
   * client-side view switch on the section, so it is deliberately not part of
   * the exported set.
   */
  exportKey?: ListExportKey;
  /** File name stem, e.g. "clients_export". Required when exportKey is set. */
  exportFilenameStem?: string;
  /** Optional final payload normalization / cross-field validation hook. */
  preparePayload?: (
    payload: Record<string, unknown>,
    formData: Record<string, unknown>,
    editingRow: T | null,
  ) => { payload?: Record<string, unknown>; error?: string };
}
export function EntitySection<
  T extends {
    id: string;
    name?: string;
    is_archived?: boolean;
  },
>({
  queryKey,
  crud,
  title,
  description,
  columns,
  fields,
  createDefaults = {},
  getEditValues,
  baseParams = {},
  exportKey,
  exportFilenameStem,
  preparePayload,
}: EntitySectionProps<T>) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useViewMode(queryKey, "table");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<T | null>(null);
  const params = useMemo(
    () => ({
      ...baseParams,
      page,
      page_size: 25,
      search: search || undefined,
      is_archived: showArchived,
    }),
    [baseParams, page, search, showArchived],
  );
  const { data, isLoading, refetch } = useQuery({
    queryKey: [queryKey, "list", params],
    queryFn: () => crud.list(params),
    placeholderData: (previousData) => previousData,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crud.create(payload),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => crud.update(id, payload),
    onSuccess: invalidate,
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => crud.archive(id),
    onSuccess: invalidate,
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => crud.restore(id),
    onSuccess: invalidate,
  });
  const saving = createMutation.isPending || updateMutation.isPending;
  const actionColumn: ColumnDef<T> = useMemo(
    () => ({
      key: "__actions",
      header: sourceText("Actions"),
      className: "w-28",
      render: (_value, row) => (
        <div className="flex items-center gap-1">
          {!row.is_archived && (
            <WriteOnly>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} title={sourceText("Edit")}>
                <Edit size={14} />
              </Button>
            </WriteOnly>
          )}
          {!row.is_archived ? (
            <WriteOnly>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => setArchiveTarget(row)} title={sourceText("Archive")}>
                <Archive size={14} />
              </Button>
            </WriteOnly>
          ) : (
            <WriteOnly>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => handleRestore(row)} title={sourceText("Restore")}>
                <RotateCcw size={14} />
              </Button>
            </WriteOnly>
          )}
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const openCreate = () => {
    setEditingRow(null);
    setFormData({ ...createDefaults });
    setFormError(null);
    setDialogOpen(true);
  };
  const openEdit = (row: T) => {
    setEditingRow(row);
    setFormData(getEditValues(row));
    setFormError(null);
    setDialogOpen(true);
  };
  const setField = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const isFieldVisible = (field: FieldDef): boolean =>
    !field.visibleWhen ||
    formData[field.visibleWhen.field] === field.visibleWhen.equals;
  const buildPayload = (): Record<string, unknown> | null => {
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      if (!isFieldVisible(field)) continue;
      const raw = formData[field.name];
      if (field.type === "checkbox") {
        payload[field.name] = Boolean(raw);
      } else if (field.type === "number") {
        if (raw === "" || raw === undefined || raw === null) continue;
        const n = field.step
          ? parseFloat(String(raw))
          : parseInt(String(raw), 10);
        if (Number.isNaN(n)) {
          setFormError(`${field.label} ${sourceText("must be a number")}.`);
          return null;
        }
        payload[field.name] = n;
      } else {
        if (raw === "" || raw === undefined || raw === null) {
          if (field.required) {
            setFormError(`${field.label} ${sourceText("is required")}.`);
            return null;
          }
          continue;
        }
        payload[field.name] = String(raw);
      }
    }
    return payload;
  };
  const handleSubmit = async () => {
    setFormError(null);
    const payload = buildPayload();
    if (!payload) return;
    const prepared = preparePayload
      ? preparePayload(payload, formData, editingRow)
      : { payload };
    if (!prepared.payload) {
      setFormError(prepared.error || sourceText("Save failed"));
      return;
    }
    try {
      if (editingRow) {
        await updateMutation.mutateAsync({
          id: editingRow.id,
          payload: prepared.payload,
        });
        toast.success(sourceText("Record updated successfully"));
      } else {
        await createMutation.mutateAsync(prepared.payload);
        toast.success(sourceText("Record created successfully"));
      }
      setDialogOpen(false);
      refetch();
    } catch (error: any) {
      const detail = error?.message || sourceText("Save failed");
      setFormError(detail);
      toast.error(detail);
    }
  };
  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveMutation.mutateAsync(archiveTarget.id);
      toast.success(sourceText("Record archived successfully"));
      setArchiveTarget(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || sourceText("Archive failed"));
    }
  };
  const handleRestore = async (row: T) => {
    try {
      await restoreMutation.mutateAsync(row.id);
      toast.success(sourceText("Record restored successfully"));
      refetch();
    } catch (error: any) {
      toast.error(error?.message || sourceText("Restore failed"));
    }
  };
  const allColumns = useMemo(
    () => [...columns, actionColumn],
    [columns, actionColumn],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportKey && (
            <ExportButton
              size="sm"
              filenameStem={exportFilenameStem || `${exportKey}_export`}
              onExport={(format) =>
                listExportApi(exportKey).download(
                  { ...baseParams, search: search || undefined },
                  format,
                )
              }
            />
          )}
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={sourceText("Search…")}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            <RotateCcw className="me-2 h-4 w-4" />
            {showArchived
              ? sourceText("Show Active")
              : sourceText("Show Archived")}
          </Button>
          <WriteOnly>
            <Button size="sm" onClick={openCreate} className="shadow-sm">
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="New" leading trailing />
            </Button>
          </WriteOnly>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <DataTable<T>
        data={data?.results || []}
        columns={allColumns}
        keyExtractor={(row: T) => row.id}
        isLoading={isLoading}
        emptyMessage={sourceText("No results found")}
        striped
        hoverable
        viewMode={viewMode}
      />
      {data && data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil((data?.count || 0) / 25)}
          totalCount={data?.count || 0}
          pageSize={25}
          onPageChange={setPage}
        />
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next && !saving) setDialogOpen(false);
        }}
      >
        <DialogContent size="xl" className="min-w-0">
          <DialogHeader>
            <DialogTitle>
              {editingRow
                ? `${sourceText("Edit")} ${title}`
                : `${sourceText("New")} ${title}`}
            </DialogTitle>
            <DialogDescription>
              {editingRow
                ? sourceText("Update the selected record below.")
                : sourceText("Fill in the fields below to create a new record.")}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          )}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {fields.filter(isFieldVisible).map((field) => (
              <div
                key={field.name}
                className={
                  field.type === "textarea"
                    ? "min-w-0 space-y-1.5 md:col-span-2"
                    : "min-w-0 space-y-1.5"
                }
              >
                {field.type === "checkbox" ? (
                  <label className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(formData[field.name])}
                      onChange={(e) => setField(field.name, e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {field.label}
                  </label>
                ) : (
                  <>
                    <Label htmlFor={`f_${field.name}`}>
                      {field.label}{" "}
                      {field.required && (
                        <span className="text-red-600">*</span>
                      )}
                    </Label>
                    {(field.lockedInEdit && editingRow) ? (
                      <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-sm text-foreground/80">
                        <span className="text-xs opacity-50">locked</span>
                        <span>
                          {field.type === "select"
                            ? (field.options?.find((o) => o.value === String(formData[field.name] ?? ""))?.label ?? String(formData[field.name] ?? "—"))
                            : String(formData[field.name] ?? "—")}
                        </span>
                      </div>
                    ) : field.type === "select" ? (
                      <Select
                        value={String(formData[field.name] ?? "")}
                        onValueChange={(v) => setField(field.name, v)}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              field.placeholder || sourceText("Select…")
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options || []).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={`f_${field.name}`}
                        rows={4}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={field.placeholder}
                        value={String(formData[field.name] ?? "")}
                        onChange={(e) => setField(field.name, e.target.value)}
                      />
                    ) : field.type === "date" ? (
                      <ScheduleDate
                        id={`f_${field.name}`}
                        value={String(formData[field.name] ?? "")}
                        onChange={(value) => setField(field.name, value)}
                      />
                    ) : (
                      <Input
                        id={`f_${field.name}`}
                        type={field.type === "number" ? "number" : "text"}
                        step={field.step}
                        placeholder={field.placeholder}
                        value={String(formData[field.name] ?? "")}
                        onChange={(e) => setField(field.name, e.target.value)}
                      />
                    )}
                    {field.help && (
                      <p className="text-xs text-muted-foreground">
                        {field.help}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              <SourceText source="Cancel" leading trailing />
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {editingRow ? sourceText("Save changes") : sourceText("Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title={sourceText("Archive record")}
        description={`${sourceText("Archive this record prompt prefix")} "${archiveTarget?.name ?? sourceText("this record")}". ${sourceText("It will disappear from active lists and can be restored later.")}`}
        confirmLabel={sourceText("Archive")}
        cancelLabel={sourceText("Cancel")}
        variant="destructive"
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
}
