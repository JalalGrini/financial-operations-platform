"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScheduleDate } from "@/components/ui/schedule-date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { configurationApi } from "@/features/configuration/api";
import { financialRecordsApi } from "@/features/financial-records/api";
import type { FinancialRecordCreateInput } from "@/features/financial-records/types";
import {
  buildQuickClientPayload,
  emptyQuickClient,
  normalizeTemplateDefaults,
  validateQuickClient,
  type QuickClientInput,
} from "@/features/financial-records/contracts";
import { partiesApi } from "@/features/parties/api";
import { useCompanies } from "@/features/personnel/hooks";

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Create form for a financial record draft.
 *
 * WHY THIS IS A COMPONENT AND NOT A PANEL
 * ---------------------------------------
 * This markup used to be an inline panel rendered below the stat strip and the
 * guidance card on the list page. Pressing "New Record" changed something
 * off-screen, which is why `useRevealOnOpen` had to scroll it into view. The
 * owner asked for every create/edit to be its own page instead, which removes
 * the class of bug rather than compensating for it: a route cannot be
 * off-screen, it survives a refresh, and it can be linked to directly.
 *
 * The body is the panel's markup unchanged, so the working form is preserved
 * exactly. Only three things differ: no reveal ref, no duplicate heading (the
 * page hero carries it), and "Close" is now "Cancel" and returns to the list.
 *
 * The create payload shape is pinned server-side by
 * `backend/apps/financial_records/tests/test_ui_save_journey.py`.
 */
export function RecordCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    record_date: todayInputValue(),
    currency: "MAD",
  });
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [quickClient, setQuickClient] =
    useState<QuickClientInput>(emptyQuickClient);
  const { data: companies } = useCompanies();
  const companyOptions = (companies || []).map((company) => ({
    value: company.id,
    label: company.name,
  }));
  const { data: recordTypes } = useQuery({
    queryKey: ["configuration:record-types", "options"],
    queryFn: () =>
      configurationApi["record-types"].list({
        page_size: 200,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });
  const recordTypeOptions = (recordTypes?.results || []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const { data: categories } = useQuery({
    queryKey: ["configuration:categories", "options"],
    queryFn: () =>
      configurationApi.categories.list({
        page_size: 200,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });
  const categoryOptions = (categories?.results || []).map((item) => ({
    value: item.id,
    label: item.full_path || item.name,
  }));
  const { data: clients, refetch: refetchClients } = useQuery({
    queryKey: ["parties:clients", "record-options"],
    queryFn: () =>
      partiesApi.clients.list({
        page_size: 500,
        archive_state: "active",
      } as any),
    staleTime: 300000,
  });
  const clientOptions = (clients?.results || [])
    .filter(
      (client) =>
        !form.company || !client.company || client.company === form.company,
    )
    .map((client) => ({ value: client.id, label: client.name }));
  const { data: suppliers } = useQuery({
    queryKey: ["parties:suppliers", "record-options"],
    queryFn: () =>
      partiesApi.suppliers.list({
        page_size: 500,
        archive_state: "active",
      } as any),
    staleTime: 300000,
  });
  const supplierOptions = (suppliers?.results || [])
    .filter(
      (supplier) =>
        !form.company || !supplier.company || supplier.company === form.company,
    )
    .map((supplier) => ({ value: supplier.id, label: supplier.name }));
  const fieldContractQuery = useQuery({
    queryKey: ["financial-records", "field-contract", form.record_type],
    queryFn: () => financialRecordsApi.customFieldContract(form.record_type),
    enabled: Boolean(form.record_type),
    staleTime: 300000,
  });
  const effectiveCustomFields = useMemo(
    () => ({
      ...normalizeTemplateDefaults(fieldContractQuery.data?.definitions || []),
      ...customFields,
    }),
    [fieldContractQuery.data?.definitions, customFields],
  );
  const createMutation = useMutation({
    mutationFn: financialRecordsApi.create,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["financial-records"] }),
  });
  const createClientMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      partiesApi.clients.create(payload),
    onSuccess: async (created) => {
      await refetchClients();
      setForm((previous) => ({ ...previous, client: created.id }));
      setQuickClient(emptyQuickClient);
      setShowNewClient(false);
      queryClient.invalidateQueries({ queryKey: ["parties:clients"] });
      toast.success(
        `${sourceText("Client created and selected:")} ${created.name}`,
      );
    },
    onError: (error: Error) =>
      toast.error(error.message || sourceText("Client creation failed")),
  });
  const setField = (name: string, value: string) =>
    setForm((previous) => ({ ...previous, [name]: value }));
  const submitQuickClient = () => {
    if (!form.company)
      return toast.error(sourceText("Choose the owning company first"));
    const validationError = validateQuickClient(quickClient);
    if (validationError) return toast.error(validationError);
    createClientMutation.mutate(
      buildQuickClientPayload(form.company, quickClient),
    );
  };
  const handleSubmit = async () => {
    setFormError(null);
    if (!form.company) return setFormError(sourceText("Company is required."));
    if (!form.record_type)
      return setFormError(sourceText("Record type is required."));
    if (!form.record_date)
      return setFormError(sourceText("Record date is required."));
    if (!form.description?.trim())
      return setFormError(sourceText("Description is required."));
    if (fieldContractQuery.isError)
      return setFormError(
        sourceText("The selected type template could not be loaded."),
      );
    const definitions = fieldContractQuery.data?.definitions || [];
    const normalizedFields: Record<string, unknown> = {
      ...effectiveCustomFields,
    };
    for (const definition of definitions) {
      const value = normalizedFields[definition.key];
      if (
        definition.is_required &&
        (value === undefined || value === null || value === "")
      ) {
        return setFormError(
          `${definition.label} ${sourceText("is required by this document type.")}`,
        );
      }
      if (
        definition.data_type === "multi_choice" &&
        typeof value === "string"
      ) {
        normalizedFields[definition.key] = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
    const payload: FinancialRecordCreateInput = {
      company: form.company,
      record_type: form.record_type,
      template: fieldContractQuery.data?.template?.id || null,
      category: form.category || null,
      client: form.client || null,
      supplier: form.supplier || null,
      record_date: form.record_date,
      description: form.description.trim(),
      notes: form.notes || "",
      currency: (form.currency || "MAD").toUpperCase(),
      custom_fields: normalizedFields,
    };
    try {
      const created = await createMutation.mutateAsync(payload);
      toast.success(
        sourceText("Draft created. Add balanced debit and credit lines next."),
      );
      router.push(`/financial-records/${created.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : sourceText("Save failed");
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <div className="rounded-3xl border border-primary/20 bg-background p-6 shadow-[0_16px_38px_rgba(15,23,42,.08)] space-y-4">
      {formError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Company *" />
          </Label>
          <Select
            value={form.company || ""}
            onValueChange={(value) => {
              setField("company", value);
              setField("client", "");
              setField("supplier", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={sourceText("Select company")} />
            </SelectTrigger>
            <SelectContent>
              {companyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Record type *" />
          </Label>
          <Select
            value={form.record_type || ""}
            onValueChange={(value) => {
              setField("record_type", value);
              setCustomFields({});
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={sourceText("Select type")} />
            </SelectTrigger>
            <SelectContent>
              {recordTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.record_type && (
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          {fieldContractQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="inline me-2 h-4 w-4 animate-spin" />
              <SourceText
                source="Loading document template…"
                leading
                trailing
              />
            </p>
          )}
          {fieldContractQuery.isError && (
            <p className="text-sm text-red-600">
              <SourceText
                source="Template loading failed. Creation is blocked to prevent an incomplete record."
                leading
                trailing
              />
            </p>
          )}
          {fieldContractQuery.data && (
            <>
              <div>
                <p className="text-sm font-medium">
                  {fieldContractQuery.data.template
                    ? `${fieldContractQuery.data.template.name} · ${sourceText("version")} ${fieldContractQuery.data.template.version}`
                    : sourceText("No published type template")}
                </p>
                <p className="text-xs text-muted-foreground">
                  <SourceText
                    source="Only fields assigned to this record type are shown."
                    leading
                    trailing
                  />
                </p>
              </div>
              {fieldContractQuery.data.definitions.map((definition) => (
                <div key={definition.key} className="space-y-1.5">
                  {definition.data_type === "boolean" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          effectiveCustomFields[definition.key],
                        )}
                        onChange={(event) =>
                          setCustomFields((previous) => ({
                            ...previous,
                            [definition.key]: event.target.checked,
                          }))
                        }
                      />
                      {definition.label}
                      {definition.is_required && (
                        <span className="text-red-600">*</span>
                      )}
                    </label>
                  ) : (
                    <>
                      <Label>
                        {definition.label}{" "}
                        {definition.is_required && (
                          <span className="text-red-600">*</span>
                        )}
                      </Label>
                      {definition.data_type === "choice" ? (
                        <Select
                          value={String(
                            effectiveCustomFields[definition.key] ?? "",
                          )}
                          onValueChange={(value) =>
                            setCustomFields((previous) => ({
                              ...previous,
                              [definition.key]: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={sourceText("Select…")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {definition.choices.map((choice) => (
                              <SelectItem key={choice} value={choice}>
                                {choice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : definition.data_type === "text" ? (
                        <textarea
                          rows={3}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={String(
                            effectiveCustomFields[definition.key] ?? "",
                          )}
                          onChange={(event) =>
                            setCustomFields((previous) => ({
                              ...previous,
                              [definition.key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <Input
                          type={
                            definition.data_type === "date"
                              ? "date"
                              : ["decimal", "integer"].includes(
                                    definition.data_type,
                                  )
                                ? "number"
                                : definition.data_type === "email"
                                  ? "email"
                                  : definition.data_type === "url"
                                    ? "url"
                                    : "text"
                          }
                          step={
                            definition.data_type === "decimal"
                              ? "any"
                              : definition.data_type === "integer"
                                ? "1"
                                : undefined
                          }
                          value={String(
                            effectiveCustomFields[definition.key] ?? "",
                          )}
                          onChange={(event) =>
                            setCustomFields((previous) => ({
                              ...previous,
                              [definition.key]: event.target.value,
                            }))
                          }
                          placeholder={
                            definition.data_type === "multi_choice"
                              ? sourceText("Comma-separated values")
                              : undefined
                          }
                        />
                      )}
                      {definition.help_text && (
                        <p className="text-xs text-muted-foreground">
                          {definition.help_text}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Category" />
          </Label>
          <Select
            value={form.category || "none"}
            onValueChange={(value) =>
              setField("category", value === "none" ? "" : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={sourceText("None")} />
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
            <SourceText source="Supplier" />
          </Label>
          <Select
            value={form.supplier || "none"}
            onValueChange={(value) =>
              setField("supplier", value === "none" ? "" : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={sourceText("None")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <SourceText source="None" />
              </SelectItem>
              {supplierOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label>
            <SourceText source="Client" />
          </Label>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setShowNewClient(!showNewClient)}
          >
            {showNewClient ? (
              <SourceText source="Close quick create" leading trailing />
            ) : (
              <SourceText source="+ Create client" leading trailing />
            )}
          </button>
        </div>
        <Select
          value={form.client || "none"}
          onValueChange={(value) =>
            setField("client", value === "none" ? "" : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={sourceText("None")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <SourceText source="None" />
            </SelectItem>
            {clientOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showNewClient && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex justify-between">
            <p className="text-sm font-medium">
              <SourceText source="Quick client" />
            </p>
            <Link
              href="/clients"
              className="text-xs text-primary hover:underline"
            >
              <SourceText
                source="Open full Clients page"
                leading
                trailing
              />
            </Link>
          </div>
          <Select
            value={quickClient.client_kind}
            onValueChange={(value) =>
              setQuickClient({
                ...emptyQuickClient,
                client_kind: value as "individual" | "organization",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organization">
                <SourceText source="Organization" />
              </SelectItem>
              <SelectItem value="individual">
                <SourceText source="Individual" />
              </SelectItem>
            </SelectContent>
          </Select>
          {quickClient.client_kind === "organization" ? (
            <Input
              placeholder={sourceText("Legal organization name *")}
              value={quickClient.name}
              onChange={(event) =>
                setQuickClient((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder={sourceText("First name *")}
                value={quickClient.first_name}
                onChange={(event) =>
                  setQuickClient((previous) => ({
                    ...previous,
                    first_name: event.target.value,
                  }))
                }
              />
              <Input
                placeholder={sourceText("Last name *")}
                value={quickClient.last_name}
                onChange={(event) =>
                  setQuickClient((previous) => ({
                    ...previous,
                    last_name: event.target.value,
                  }))
                }
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="email"
              placeholder={sourceText("Email")}
              value={quickClient.email}
              onChange={(event) =>
                setQuickClient((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
            />
            <Input
              placeholder={sourceText("Phone")}
              value={quickClient.phone}
              onChange={(event) =>
                setQuickClient((previous) => ({
                  ...previous,
                  phone: event.target.value,
                }))
              }
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={submitQuickClient}
            disabled={createClientMutation.isPending}
          >
            {createClientMutation.isPending && (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            )}
            <SourceText source="Create and select" leading trailing />
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Record date *" />
          </Label>
          <ScheduleDate
            value={form.record_date || "" || ""}
            onChange={(val: string) =>
              setField("record_date", val as any)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Currency" />
          </Label>
          <Input
            maxLength={3}
            value={form.currency || "MAD"}
            onChange={(event) =>
              setField("currency", event.target.value.toUpperCase())
            }
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>
          <SourceText source="Description *" />
        </Label>
        <Input
          value={form.description || ""}
          onChange={(event) => setField("description", event.target.value)}
          placeholder={sourceText("e.g., August office-rent invoice")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          <SourceText source="Notes" />
        </Label>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={form.notes || ""}
          onChange={(event) => setField("notes", event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/financial-records")}
          disabled={createMutation.isPending}
        >
          <SourceText source="Cancel" leading trailing />
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            createMutation.isPending ||
            fieldContractQuery.isLoading ||
            fieldContractQuery.isError
          }
        >
          {createMutation.isPending && (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          )}
          <SourceText source="Create draft" leading trailing />
        </Button>
      </div>
    </div>
  );
}
