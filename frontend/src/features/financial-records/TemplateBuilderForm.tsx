"use client";
// Template builder extracted from app/(protected)/configuration/templates/page.tsx
// (v17.16). The markup below was spliced out of that page unchanged; only the
// Cancel action differs, because a route navigates where a panel just closed.
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { sourceText } from "@/lib/i18n/source-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceText } from "@/components/i18n/SourceText";
import { Plus, Trash2, Eye, Loader2, Edit } from "lucide-react";
import { configurationApi } from "@/features/configuration/api";
import { financialTemplatesApi } from "@/features/financial-records/api";
import type {
  FinancialDocumentTemplate,
  TemplateFieldInput,
  TemplateFieldType,
  TemplateWriteInput,
} from "@/features/financial-records/types";

const FIELD_TYPES: {
  value: TemplateFieldType;
  label: string;
}[] = [
  {
    value: "string",
    get label() {
      return sourceText("Text (single line)");
    },
  },
  {
    value: "text",
    get label() {
      return sourceText("Text (multi line)");
    },
  },
  {
    value: "integer",
    get label() {
      return sourceText("Whole number");
    },
  },
  {
    value: "decimal",
    get label() {
      return sourceText("Decimal number");
    },
  },
  {
    value: "boolean",
    get label() {
      return sourceText("Yes / No");
    },
  },
  {
    value: "date",
    get label() {
      return sourceText("Date");
    },
  },
  {
    value: "choice",
    get label() {
      return sourceText("Single choice");
    },
  },
  {
    value: "multi_choice",
    get label() {
      return sourceText("Multiple choice");
    },
  },
  {
    value: "email",
    get label() {
      return sourceText("Email");
    },
  },
  {
    value: "url",
    get label() {
      return sourceText("URL");
    },
  },
];
type BuilderField = TemplateFieldInput & {
  choices_text: string;
};
type BuilderForm = {
  record_type: string;
  name: string;
  description: string;
  effective_from: string;
  effective_to: string;
  fields: BuilderField[];
};
const blankField = (order: number): BuilderField => ({
  key: "",
  label: "",
  data_type: "string",
  is_required: false,
  display_order: order,
  section: "",
  help_text: "",
  default_value: null,
  choices: [],
  choices_text: "",
  max_length: null,
  validation: {},
  output_mapping: {},
  is_active: true,
});
const blankForm = (): BuilderForm => ({
  record_type: "",
  name: "",
  description: "",
  effective_from: "",
  effective_to: "",
  fields: [blankField(0)],
});

/** Maps a saved template onto the builder's editable shape. Lifted verbatim
 *  from the page's openEdit so an edited draft round-trips identically. */
export function templateToForm(template: FinancialDocumentTemplate): BuilderForm {
  return {
    record_type: template.record_type,
    name: template.name,
    description: template.description,
    effective_from: template.effective_from || "",
    effective_to: template.effective_to || "",
    fields: template.fields.map((field) => ({
      key: field.key,
      label: field.label,
      data_type: field.data_type,
      is_required: field.is_required,
      display_order: field.display_order,
      section: field.section,
      help_text: field.help_text,
      default_value: field.default_value,
      choices: field.choices,
      choices_text: field.choices.join(", "),
      max_length: field.max_length,
      validation: field.validation,
      output_mapping: field.output_mapping,
      is_active: field.is_active,
    })),
  };
}

function TemplateBuilder({
  editing,
  initialForm,
}: {
  editing: FinancialDocumentTemplate | null;
  initialForm: BuilderForm;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BuilderForm>(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data: recordTypes } = useQuery({
    queryKey: ["configuration:record-types", "template-options"],
    queryFn: () =>
      configurationApi["record-types"].list({
        page_size: 500,
        archive_state: "active",
      } as any),
    staleTime: 600000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["financial-templates"] });
    queryClient.invalidateQueries({
      queryKey: ["financial-records", "field-contract"],
    });
  };
  const createMutation = useMutation({
    mutationFn: financialTemplatesApi.create,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TemplateWriteInput> }) =>
      financialTemplatesApi.update(id, data),
    onSuccess: invalidate,
  });

  const cancel = () => router.push("/configuration/templates");
  const saving = createMutation.isPending || updateMutation.isPending;

  const updateField = (index: number, patch: Partial<BuilderField>) => {
    setForm((previous) => ({
      ...previous,
      fields: previous.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  };

  const saveTemplate = async () => {
    setFormError(null);
    if (!form.record_type)
      return setFormError(sourceText("Record type is required."));
    if (!form.name.trim())
      return setFormError(sourceText("Template name is required."));
    if (
      form.effective_from &&
      form.effective_to &&
      form.effective_to < form.effective_from
    ) {
      return setFormError(
        sourceText("Effective-to cannot precede effective-from."),
      );
    }
    const keys = new Set<string>();
    for (const field of form.fields) {
      const key = field.key.trim().toLowerCase();
      if (!key || !/^[a-z][a-z0-9_]*$/.test(key))
        return setFormError(
          sourceText(
            "Field keys must start with a letter and contain only lowercase letters, digits, and underscores.",
          ),
        );
      if (keys.has(key))
        return setFormError(`${sourceText("Duplicate field key:")} ${key}`);
      keys.add(key);
      if (!field.label.trim())
        return setFormError(`${sourceText("Label is required for")} ${key}.`);
      if (
        ["choice", "multi_choice"].includes(field.data_type) &&
        !field.choices_text.split(",").some((choice) => choice.trim())
      )
        return setFormError(
          `${field.label} ${sourceText("needs at least one choice.")}`,
        );
    }
    const fields: TemplateFieldInput[] = form.fields.map((field, index) => ({
      key: field.key.trim().toLowerCase(),
      label: field.label.trim(),
      data_type: field.data_type,
      is_required: Boolean(field.is_required),
      display_order: index,
      section: field.section?.trim() || "",
      help_text: field.help_text?.trim() || "",
      default_value: field.default_value === "" ? null : field.default_value,
      choices: ["choice", "multi_choice"].includes(field.data_type)
        ? field.choices_text
            .split(",")
            .map((choice) => choice.trim())
            .filter(Boolean)
        : [],
      max_length: field.max_length || null,
      validation: field.validation || {},
      output_mapping: field.output_mapping || {},
      is_active: true,
    }));
    const payload: TemplateWriteInput = {
      record_type: form.record_type,
      name: form.name.trim(),
      description: form.description.trim(),
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      output_mapping: {},
      fields,
    };
    try {
      if (editing) {
        const updates: Partial<TemplateWriteInput> = { ...payload };
        delete updates.record_type;
        await updateMutation.mutateAsync({ id: editing.id, data: updates });
        toast.success(sourceText("Draft template updated"));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(sourceText("Draft template created"));
      }
      router.push("/configuration/templates");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : sourceText("Template save failed");
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <Card className="border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]">
          <CardContent className="space-y-5 p-6">
            <div className="flex justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {editing
                    ? `${sourceText("Edit")} ${editing.name} · ${sourceText("version")} ${editing.version}`
                    : sourceText("New template draft")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  <SourceText
                    source="Published versions cannot be edited; create a new version for changes."
                    leading
                    trailing
                  />
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="me-1 h-4 w-4" />
                {showPreview
                  ? sourceText("Hide preview")
                  : sourceText("Preview")}
              </Button>
            </div>
            {formError && (
              <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Record type *" />
                </Label>
                <Select
                  value={form.record_type}
                  disabled={Boolean(editing)}
                  onValueChange={(value) =>
                    setForm((previous) => ({ ...previous, record_type: value }))
                  }
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
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Template name *" />
                </Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder={sourceText("e.g., Moroccan Purchase Invoice")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Description" />
              </Label>
              <textarea
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.description}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Effective from" />
                </Label>
                <ScheduleDate
                  value={form.effective_from || ""}
                  onChange={(val: string) =>
                    setForm((previous) => ({
                      ...previous,
                      effective_from: val,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Effective to" />
                </Label>
                <ScheduleDate
                  value={form.effective_to || ""}
                  onChange={(val: string) =>
                    setForm((previous) => ({
                      ...previous,
                      effective_to: val,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">
                  <SourceText source="Fields" />
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      fields: [
                        ...previous.fields,
                        blankField(previous.fields.length),
                      ],
                    }))
                  }
                >
                  <Plus className="me-1 h-4 w-4" />
                  <SourceText source="Add field" leading trailing />
                </Button>
              </div>
              {form.fields.map((field, index) => (
                <div key={index} className="rounded-lg border p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label>
                        <SourceText source="Key *" />
                      </Label>
                      <Input
                        value={field.key}
                        onChange={(event) =>
                          updateField(index, {
                            key: event.target.value
                              .toLowerCase()
                              .replace(/\s+/g, "_"),
                          })
                        }
                        placeholder={sourceText("invoice_number")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>
                        <SourceText source="Label *" />
                      </Label>
                      <Input
                        value={field.label}
                        onChange={(event) =>
                          updateField(index, { label: event.target.value })
                        }
                        placeholder={sourceText("Invoice number")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>
                        <SourceText source="Type *" />
                      </Label>
                      <Select
                        value={field.data_type}
                        onValueChange={(value) =>
                          updateField(index, {
                            data_type: value as TemplateFieldType,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex h-9 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(field.is_required)}
                          onChange={(event) =>
                            updateField(index, {
                              is_required: event.target.checked,
                            })
                          }
                        />
                        <SourceText source="Required" leading trailing />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            fields: previous.fields.filter(
                              (_item, position) => position !== index,
                            ),
                          }))
                        }
                        disabled={form.fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>
                        <SourceText source="Section" />
                      </Label>
                      <Input
                        value={field.section || ""}
                        onChange={(event) =>
                          updateField(index, { section: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>
                        <SourceText source="Help text" />
                      </Label>
                      <Input
                        value={field.help_text || ""}
                        onChange={(event) =>
                          updateField(index, { help_text: event.target.value })
                        }
                      />
                    </div>
                    {["choice", "multi_choice"].includes(field.data_type) ? (
                      <div className="space-y-1">
                        <Label>
                          <SourceText source="Choices (comma-separated) *" />
                        </Label>
                        <Input
                          value={field.choices_text}
                          onChange={(event) =>
                            updateField(index, {
                              choices_text: event.target.value,
                            })
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>
                          <SourceText source="Default value" />
                        </Label>
                        <Input
                          value={String(field.default_value ?? "")}
                          onChange={(event) =>
                            updateField(index, {
                              default_value: event.target.value,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {showPreview && (
              <Card variant="outlined">
                <CardHeader>
                  <CardTitle className="text-base">
                    <SourceText source="Form preview" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="mt-4 grid gap-4 sm:grid-cols-2">
                  {form.fields.map((field) => (
                    <div key={field.key || field.label} className="space-y-1">
                      <Label>
                        {field.label || sourceText("Untitled field")}{" "}
                        {field.is_required && "*"}
                      </Label>
                      {field.data_type === "boolean" ? (
                        <label className="flex gap-2 text-sm">
                          <input type="checkbox" disabled />
                          <SourceText source="Yes" leading trailing />
                        </label>
                      ) : field.data_type === "choice" ? (
                        <Select disabled>
                          <SelectTrigger>
                            <SelectValue placeholder={sourceText("Select…")} />
                          </SelectTrigger>
                        </Select>
                      ) : (
                        <Input
                          disabled
                          type={
                            field.data_type === "date"
                              ? "date"
                              : ["integer", "decimal"].includes(field.data_type)
                                ? "number"
                                : "text"
                          }
                        />
                      )}
                      {field.help_text && (
                        <p className="text-xs text-muted-foreground">
                          {field.help_text}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => cancel()}
                disabled={saving}
              >
                <SourceText source="Close" leading trailing />
              </Button>
              <Button onClick={saveTemplate} disabled={saving}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                <SourceText source="Save draft" leading trailing />
              </Button>
            </div>
          </CardContent>

    </Card>
  );
}

export function TemplateCreateForm() {
  return <TemplateBuilder editing={null} initialForm={blankForm()} />;
}

export function TemplateEditForm({
  template,
}: {
  template: FinancialDocumentTemplate;
}) {
  return (
    <TemplateBuilder editing={template} initialForm={templateToForm(template)} />
  );
}

/** Only drafts are editable: the API refuses writes to a published schema, so
 *  the route says so plainly instead of rendering a form that cannot save. */
export function TemplateEditLoader({ templateId }: { templateId: string }) {
  const query = useQuery({
    queryKey: ["financial-templates", "detail", templateId],
    queryFn: () => financialTemplatesApi.get(templateId),
    enabled: Boolean(templateId),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {sourceText("Loading")}
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-red-700">
            {sourceText("Template save failed")}
          </p>
          <Button variant="outline" asChild>
            <Link href="/configuration/templates">{sourceText("Cancel")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (query.data.status !== "draft") {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">
            {sourceText(
              "Publish a new version instead of editing a published schema in place.",
            )}
          </p>
          <Button variant="outline" asChild>
            <Link href="/configuration/templates">{sourceText("Cancel")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <TemplateEditForm template={query.data} />;
}
