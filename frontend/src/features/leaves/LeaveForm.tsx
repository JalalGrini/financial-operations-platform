"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { employmentApi } from "@/features/personnel/api";
import {
  useCompanies,
  usePersonnelSelect,
} from "@/features/personnel/hooks";
import {
  CreateLeaveData,
  LEAVE_TYPES,
  Leave,
  leaveDurationDays,
  leavesApi,
} from "@/features/leaves/api";
import { TICKET_ACCEPT, validateSingleUpload } from "@/lib/upload-limits";
import { GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import { cn } from "@/lib/utils";

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_LABELS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

type LeaveFormValues = {
  company: string;
  decision_number: string;
  decision_date: string;
  personnel: string;
  employment: string;
  leave_type: string;
  leave_type_other: string;
  start_date: string;
  end_date: string;
  national_holiday_days: string;
  international_holiday_days: string;
  reason: string;
  working_weekdays: number[];
};

const emptyValues: LeaveFormValues = {
  company: "",
  decision_number: "",
  decision_date: "",
  personnel: "",
  employment: "",
  leave_type: "",
  leave_type_other: "",
  start_date: "",
  end_date: "",
  national_holiday_days: "0",
  international_holiday_days: "0",
  reason: "",
  working_weekdays: [0, 1, 2, 3, 4, 5, 6],
};

function leaveToValues(leave: Leave): LeaveFormValues {
  return {
    company: leave.company ? String(leave.company) : GROUP_COMPANY_VALUE,
    decision_number: leave.decision_number || "",
    decision_date: leave.decision_date ? leave.decision_date.split("T")[0] : "",
    personnel: String(leave.personnel ?? ""),
    employment: String(leave.employment ?? ""),
    leave_type: leave.leave_type || "",
    leave_type_other: leave.leave_type_other || "",
    start_date: leave.start_date ? leave.start_date.split("T")[0] : "",
    end_date: leave.end_date ? leave.end_date.split("T")[0] : "",
    national_holiday_days: String(leave.national_holiday_days ?? 0),
    international_holiday_days: String(leave.international_holiday_days ?? 0),
    reason: leave.reason || "",
    working_weekdays:
      Array.isArray(leave.working_weekdays) && leave.working_weekdays.length
        ? leave.working_weekdays
        : [0, 1, 2, 3, 4, 5, 6],
  };
}

export function LeaveForm({ leave }: { leave?: Leave }) {
  const router = useRouter();
  const isEdit = Boolean(leave);
  const [values, setValues] = useState<LeaveFormValues>(
    leave ? leaveToValues(leave) : emptyValues,
  );
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [overQuota, setOverQuota] = useState<{
    remaining: number;
    chargeable: number;
  } | null>(null);

  useEffect(() => {
    if (leave) setValues(leaveToValues(leave));
  }, [leave]);

  const { data: companies = [] } = useCompanies();
  const { data: personnelOptions = [] } = usePersonnelSelect();
  const companyOptions = Array.isArray(companies) ? companies : [];
  const personOptions = Array.isArray(personnelOptions) ? personnelOptions : [];

  const { data: employments = [] } = useQuery({
    queryKey: ["employments-for-leave", values.personnel, values.company],
    queryFn: async () => {
      if (!values.personnel) return [];
      const response = await employmentApi.list({
        person: values.personnel,
        page_size: 200,
      } as any);
      const rows = response?.results ?? [];
      if (!values.company || values.company === GROUP_COMPANY_VALUE) return rows;
      return rows.filter((row) => String(row.company) === String(values.company));
    },
    enabled: Boolean(values.personnel),
  });

  const selectedEmployment = useMemo(() => {
    if (!employments.length) return null;
    if (values.employment) {
      return employments.find((row) => String(row.id) === String(values.employment)) ?? employments[0];
    }
    return employments[0];
  }, [employments, values.employment]);

  useEffect(() => {
    if (!selectedEmployment) return;
    setValues((prev) => {
      const nextEmployment = String(selectedEmployment.id);
      const nextCompany = String(selectedEmployment.company ?? prev.company);
      if (prev.employment === nextEmployment && prev.company === nextCompany) {
        return prev;
      }
      return { ...prev, employment: nextEmployment, company: nextCompany || prev.company };
    });
  }, [selectedEmployment]);

  const duration = leaveDurationDays(values.start_date, values.end_date, values.working_weekdays);
  const national = Number(values.national_holiday_days || 0);
  const international = Number(values.international_holiday_days || 0);
  const chargeable = Math.max(0, duration - national - international);
  const remainingLeave = selectedEmployment?.remaining_leave_days;

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaveData) =>
      isEdit && leave
        ? leavesApi.update(leave.id, payload)
        : leavesApi.create(payload),
    onSuccess: (res) => {
      setOverQuota(null);
      router.push(`/leaves/${(res as Leave).id}`);
    },
    onError: (err: any) => {
      const payload = err?.response?.data?.errors ?? err?.response?.data ?? {};
      if (payload.code === "leave_over_quota" || String(err?.message || "").includes("authorized days remain")) {
        setOverQuota({
          remaining: Number(payload.remaining_days ?? remainingLeave ?? 0),
          chargeable: Number(payload.chargeable_days ?? chargeable),
        });
        setError("");
        return;
      }
      setError(
        sourceText(
          String(
            (Array.isArray(payload.working_weekdays) && payload.working_weekdays[0]) ||
              (Array.isArray(payload.national_holiday_days) && payload.national_holiday_days[0]) ||
              (Array.isArray(payload.leave_type_other) && payload.leave_type_other[0]) ||
              payload.detail ||
              err?.message ||
              "Failed to save leave.",
          ),
        ),
      );
    },
  });

  const setField = <K extends keyof LeaveFormValues>(key: K, value: LeaveFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (confirmOverQuota = false): CreateLeaveData => ({
    personnel: values.personnel,
    employment: values.employment,
    company: values.company,
    leave_type: values.leave_type,
    leave_type_other: values.leave_type_other,
    decision_number: values.decision_number,
    decision_date: values.decision_date,
    start_date: values.start_date,
    end_date: values.end_date,
    national_holiday_days: national,
    international_holiday_days: international,
    working_weekdays: values.working_weekdays,
    confirm_over_quota: confirmOverQuota,
    reason: values.reason,
    signed_document: attachment,
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (
      !values.company ||
      !values.personnel ||
      !values.employment ||
      !values.leave_type ||
      !values.start_date ||
      !values.end_date
    ) {
      setError(sourceText("Please fill in all required fields."));
      return;
    }
    if (values.leave_type === "other" && !values.leave_type_other.trim()) {
      setError(sourceText("Please specify the leave type."));
      return;
    }
    const fileProblem = validateSingleUpload(attachment);
    if (fileProblem) {
      setError(sourceText(fileProblem));
      return;
    }
    const payload: CreateLeaveData = buildPayload(false);
    mutation.mutate(payload);
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              <SourceText source={isEdit ? "Edit Leave" : "New Leave Request"} />
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <SourceText source="Fill in the leave authorization details below." />
            </p>
          </div>
        </div>
      </div>

      <WriteOnly>
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Leave Details" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Company *" />
                  </Label>
                  <Select
                    value={values.company}
                    onValueChange={(value) => {
                      setValues((prev) => ({
                        ...prev,
                        company: value,
                        employment: "",
                      }));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={sourceText("Select company")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GROUP_COMPANY_VALUE}>
                        {sourceText("Tout le groupe")}
                      </SelectItem>
                      {companyOptions.map((company) => (
                        <SelectItem key={company.id} value={String(company.id)}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Decision No." />
                  </Label>
                  <Input
                    className="w-full"
                    value={values.decision_number}
                    onChange={(event) => setField("decision_number", event.target.value)}
                    placeholder={sourceText("Auto-generated if empty")}
                  />
                </div>

                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Decision date" />
                  </Label>
                  <ScheduleDate
                    id="decision_date"
                    value={values.decision_date}
                    onChange={(value) => setField("decision_date", value)}
                  />
                </div>

                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Employee *" />
                  </Label>
                  <SearchableSelect
                    value={values.personnel}
                    onChange={(value) => {
                      setValues((prev) => ({
                        ...prev,
                        personnel: value,
                        employment: "",
                      }));
                    }}
                    placeholder={sourceText("Select employee")}
                    searchPlaceholder={sourceText("Search...")}
                    options={personOptions.map((person) => ({
                      value: String(person.id),
                      label: person.name,
                      hint: person.reference,
                    }))}
                  />
                </div>

                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Job title" />
                  </Label>
                  <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {selectedEmployment?.job_title || leave?.job_title || "—"}
                  </div>
                </div>

                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Department" />
                  </Label>
                  <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {selectedEmployment?.department || leave?.department || "—"}
                  </div>
                </div>
              </div>

              <div className="space-y-2 min-w-0">
                <Label>
                  <SourceText source="Leave type *" />
                </Label>
                <Select
                  value={values.leave_type}
                  onValueChange={(value) => setField("leave_type", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={sourceText("Select type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.concat(
                      values.leave_type &&
                        !LEAVE_TYPES.some((type) => type.value === values.leave_type)
                        ? [{ value: values.leave_type, label: values.leave_type }]
                        : [],
                    ).map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {values.leave_type === "other" && (
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Other leave type *" />
                  </Label>
                  <Input
                    className="w-full"
                    value={values.leave_type_other}
                    onChange={(event) => setField("leave_type_other", event.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    <SourceText source="Working days" />
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setField("working_weekdays", [...ALL_WEEKDAYS])}
                  >
                    <SourceText source="Select all" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Unselect days they do not work. Those days are not counted." />
                </p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((day) => {
                    const selected = values.working_weekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const next = selected
                            ? values.working_weekdays.filter((value) => value !== day.value)
                            : [...values.working_weekdays, day.value].sort((a, b) => a - b);
                          if (next.length === 0) return;
                          setField("working_weekdays", next);
                        }}
                        className={cn(
                          "h-10 min-w-12 rounded-xl border px-3 text-sm font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-muted-foreground hover:bg-muted/60",
                        )}
                      >
                        {sourceText(day.label)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Start date *" />
                  </Label>
                  <ScheduleDate
                    id="start_date"
                    value={values.start_date}
                    onChange={(value) => setField("start_date", value)}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Return date *" />
                  </Label>
                  <ScheduleDate
                    id="end_date"
                    value={values.end_date}
                    onChange={(value) => setField("end_date", value)}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Duration (days)" />
                  </Label>
                  <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {duration}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="National holiday days" />
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-full"
                    value={values.national_holiday_days}
                    onChange={(event) => setField("national_holiday_days", event.target.value)}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="International holiday days" />
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-full"
                    value={values.international_holiday_days}
                    onChange={(event) => setField("international_holiday_days", event.target.value)}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>
                    <SourceText source="Chargeable days" />
                  </Label>
                  <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {chargeable}
                    {remainingLeave !== undefined ? ` · ${sourceText("Remaining")}: ${remainingLeave}` : ""}
                  </div>
                </div>
              </div>

              <div className="space-y-2 min-w-0">
                <Label>
                  <SourceText source="Attachment" />
                </Label>
                <Input
                  className="w-full"
                  type="file"
                  accept={TICKET_ACCEPT}
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                />
                {leave?.signed_document && !attachment && (
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="A file is already attached. Upload a new file to replace it." />
                  </p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label>
                  <SourceText source="Notes" />
                </Label>
                <Textarea
                  className="w-full resize-none"
                  value={values.reason}
                  onChange={(event) => setField("reason", event.target.value)}
                  rows={3}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  <SourceText source="Cancel" />
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  <SourceText source={isEdit ? "Save" : "Create Draft"} />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </WriteOnly>
      <ConfirmDialog
        isOpen={Boolean(overQuota)}
        onClose={() => setOverQuota(null)}
        onConfirm={() => {
          setOverQuota(null);
          mutation.mutate(buildPayload(true));
        }}
        title={sourceText("Leave days exceeded")}
        description={sourceText(
          "This leave uses more authorized days than remain this year. Create it anyway, or keep editing.",
        )}
        confirmLabel={sourceText("Create anyway")}
        cancelLabel={sourceText("Keep editing")}
        variant="destructive"
        isLoading={mutation.isPending}
      />
    </div>
  );
}
