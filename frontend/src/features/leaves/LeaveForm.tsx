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
  reason: string;
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
  reason: "",
};

function leaveToValues(leave: Leave): LeaveFormValues {
  return {
    company: leave.company ? String(leave.company) : "",
    decision_number: leave.decision_number || "",
    decision_date: leave.decision_date ? leave.decision_date.split("T")[0] : "",
    personnel: String(leave.personnel ?? ""),
    employment: String(leave.employment ?? ""),
    leave_type: leave.leave_type || "",
    leave_type_other: leave.leave_type_other || "",
    start_date: leave.start_date ? leave.start_date.split("T")[0] : "",
    end_date: leave.end_date ? leave.end_date.split("T")[0] : "",
    reason: leave.reason || "",
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
      if (!values.company) return rows;
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

  const duration = leaveDurationDays(values.start_date, values.end_date);

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaveData) =>
      isEdit && leave
        ? leavesApi.update(leave.id, payload)
        : leavesApi.create(payload),
    onSuccess: (res) => {
      router.push(`/leaves/${(res as Leave).id}`);
    },
    onError: (err: any) => {
      setError(err?.message || sourceText("Failed to save leave."));
    },
  });

  const setField = <K extends keyof LeaveFormValues>(key: K, value: LeaveFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

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
    const payload: CreateLeaveData = {
      personnel: values.personnel,
      employment: values.employment,
      company: values.company,
      leave_type: values.leave_type,
      leave_type_other: values.leave_type_other,
      decision_number: values.decision_number,
      decision_date: values.decision_date,
      start_date: values.start_date,
      end_date: values.end_date,
      reason: values.reason,
      signed_document: attachment,
    };
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

              <div className="space-y-2 min-w-0">
                <Label>
                  <SourceText source="Attachment" />
                </Label>
                <Input
                  className="w-full"
                  type="file"
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
    </div>
  );
}
