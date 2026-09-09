"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  Building2,
  Briefcase,
  Calendar,
  FileText,
  FileCheck,
  AlertCircle as AlertCircleIcon,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import { useFormDirty } from "@/hooks/useFormDirty";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useUpdateCNSSDeclaration,
  useCNSSDeclarationDetail,
  useCompanies,
  usePersonnelSelect,
  useEmploymentsByPerson,
} from "@/features/personnel/hooks";
import {
  CNSSSituation,
  CNSSStopReason,
  CNSSMonthlySituation,
} from "@/features/personnel/types";
import { toast } from "@/components/ui/toast";
const updateCNSSSchema = z.object({
  person: z.string().min(1, "Person is required"),
  company: z.string().min(1, "Company is required"),
  employment: z.string().optional(),
  cnss_registration_number: z
    .string()
    .min(1, "CNSS registration number is required"),
  situation: z.nativeEnum(CNSSSituation),
  first_declaration_date: z
    .string()
    .min(1, "First declaration date is required"),
  declaration_start_date: z
    .string()
    .min(1, "Declaration start date is required"),
  declaration_stop_date: z.string().optional(),
  resignation_date: z.string().optional(),
  stop_reason: z.nativeEnum(CNSSStopReason).optional(),
  observations: z.string().optional(),
});
type UpdateCNSSForm = z.infer<typeof updateCNSSSchema>;
const situationOptions = [
  {
    value: CNSSSituation.DECLARED_BY_THIS_COMPANY,
    get label() {
      return sourceText("Declared by this Company");
    },
  },
  {
    value: CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER,
    get label() {
      return sourceText("Declared by Another Employer");
    },
  },
  {
    value: CNSSSituation.PERSONALLY_INSURED,
    get label() {
      return sourceText("Personally Insured");
    },
  },
  {
    value: CNSSSituation.NOT_DECLARED,
    get label() {
      return sourceText("Not Declared");
    },
  },
  {
    value: CNSSSituation.PENDING,
    get label() {
      return sourceText("Pending");
    },
  },
  {
    value: CNSSSituation.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: CNSSSituation.STOPPED,
    get label() {
      return sourceText("Stopped");
    },
  },
  {
    value: CNSSSituation.EXEMPT,
    get label() {
      return sourceText("Exempt");
    },
  },
  {
    value: CNSSSituation.UNKNOWN,
    get label() {
      return sourceText("Unknown");
    },
  },
  {
    value: CNSSSituation.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
];
const stopReasonOptions = [
  {
    value: CNSSStopReason.RESIGNATION,
    get label() {
      return sourceText("Resignation");
    },
  },
  {
    value: CNSSStopReason.TERMINATION,
    get label() {
      return sourceText("Termination");
    },
  },
  {
    value: CNSSStopReason.RETIREMENT,
    get label() {
      return sourceText("Retirement");
    },
  },
  {
    value: CNSSStopReason.DEATH,
    get label() {
      return sourceText("Death");
    },
  },
  {
    value: CNSSStopReason.COMPANY_CLOSURE,
    get label() {
      return sourceText("Company Closure");
    },
  },
  {
    value: CNSSStopReason.CONTRACT_END,
    get label() {
      return sourceText("Contract End");
    },
  },
  {
    value: CNSSStopReason.MUTUAL_AGREEMENT,
    get label() {
      return sourceText("Mutual Agreement");
    },
  },
  {
    value: CNSSStopReason.SUSPENSION,
    get label() {
      return sourceText("Suspension");
    },
  },
  {
    value: CNSSStopReason.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
];
export default function EditCNSSDeclarationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const updateMutation = useUpdateCNSSDeclaration();
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: cnssData, isLoading, error } = useCNSSDeclarationDetail(id);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateCNSSForm>({
    resolver: zodResolver(updateCNSSSchema),
    defaultValues: {},
  });
  const personId = useWatch({ control, name: "person" });
  const companyId = useWatch({ control, name: "company" });
  const employmentId = useWatch({ control, name: "employment" });
  const situation = useWatch({ control, name: "situation" });
  const stopReason = useWatch({ control, name: "stop_reason" });
  const currentValues = watch();
  const originalValues = useMemo(() => {
    if (!cnssData) return null;
    return {
      person: cnssData.person,
      company: cnssData.company,
      employment: cnssData.employment || "",
      cnss_registration_number: cnssData.cnss_registration_number,
      situation: cnssData.situation,
      first_declaration_date: cnssData.first_declaration_date
        ? cnssData.first_declaration_date.split("T")[0]
        : "",
      declaration_start_date: cnssData.declaration_start_date
        ? cnssData.declaration_start_date.split("T")[0]
        : "",
      declaration_stop_date: cnssData.declaration_stop_date
        ? cnssData.declaration_stop_date.split("T")[0]
        : "",
      resignation_date: cnssData.resignation_date
        ? cnssData.resignation_date.split("T")[0]
        : "",
      stop_reason: cnssData.stop_reason || undefined,
      observations: cnssData.observations || "",
    };
  }, [cnssData]);
  const formDirty = useFormDirty(originalValues, currentValues);
  const { data: employments } = useEmploymentsByPerson(personId);
  const hydratedIdRef = useRef<string | null>(null);

  /**
   * Human label for the locked employment.
   *
   * Derived during render rather than stored in state: the employments query
   * resolves after the declaration does, and writing the label into state from
   * an effect is the `react-hooks/set-state-in-effect` pattern this codebase
   * has already had to remove twice. Falls back to an em dash rather than to a
   * raw uuid, which is not information a user can act on.
   */
  const employmentLabel = React.useMemo(() => {
    if (!employmentId) return sourceText("Not linked to an employment");
    const match = (employments as any[] | undefined)?.find(
      (e) => e.id === employmentId,
    );
    if (!match) return sourceText("—");
    const title = match.job_title || sourceText("No title");
    return `${match.employee_reference ?? ""} · ${title}`.trim();
  }, [employmentId, employments]);
  // Hydrate once per record. Skipping when RHF `isDirty` is true left the
  // situation Select on "" (invalid enum) after its first paint, which also
  // made the dirty-save button look enabled against empty fields.
  useEffect(() => {
    if (!cnssData) return;
    if (hydratedIdRef.current === cnssData.id) return;
    hydratedIdRef.current = cnssData.id;
    reset({
      person: cnssData.person,
      company: cnssData.company,
      employment: cnssData.employment || "",
      cnss_registration_number: cnssData.cnss_registration_number,
      situation: cnssData.situation,
      first_declaration_date: cnssData.first_declaration_date
        ? cnssData.first_declaration_date.split("T")[0]
        : "",
      declaration_start_date: cnssData.declaration_start_date
        ? cnssData.declaration_start_date.split("T")[0]
        : "",
      declaration_stop_date: cnssData.declaration_stop_date
        ? cnssData.declaration_stop_date.split("T")[0]
        : "",
      resignation_date: cnssData.resignation_date
        ? cnssData.resignation_date.split("T")[0]
        : "",
      stop_reason: cnssData.stop_reason || undefined,
      observations: cnssData.observations || "",
    });
  }, [cnssData, reset]);
  const showStopFields = situation === CNSSSituation.STOPPED;
  const onSubmit = async (data: UpdateCNSSForm) => {
    setIsSubmitting(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== "" && v !== undefined),
      );
      await updateMutation.mutateAsync({ id, data: payload });
      toast.success(sourceText("CNSS declaration updated successfully"));
      router.push(`/personnel/cnss/${id}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update CNSS declaration");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancel = () => {
    router.back();
  };
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircleIcon className="h-12 w-12 text-red-600 mb-4" />
        <p className="text-red-600">
          <SourceText source="Failed to load CNSS declaration" />
        </p>
        <Button variant="outline" onClick={handleCancel} className="mt-4">
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back to List" leading trailing />
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("CNSS Declarations");
            },
            href: "/personnel/cnss",
          },
          {
            label: cnssData?.person_name || "Loading...",
            href: `/personnel/cnss/${id}`,
          },
          {
            get label() {
              return sourceText("Edit");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Edit CNSS Declaration")}
        description={`Update details for ${cnssData?.person_name || "CNSS declaration"}`}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to Profile" leading trailing />
          </Button>
        }
      />

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              <SourceText source="CNSS Declaration Details" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Person, company and employment are LOCKED on edit.
              *
              * Reported symptom: opening the edit screen showed empty pickers and
              * demanded that all three be chosen again.
              *
              * Cause: they were Radix `Select`s whose options arrive from three
              * separate queries (usePersonnelSelect, useCompanies,
              * useEmploymentsByPerson). `reset()` sets the ids as soon as the
              * declaration loads, but a Select renders its placeholder while no
              * `SelectItem` matches the current value - and the employment list
              * cannot even begin loading until `person` is populated. So the form
              * held the right ids while the screen looked blank, and re-picking
              * was the only way to make it look correct.
              *
              * Fix: stop offering the choice at all. These three fields identify
              * WHICH declaration this is - re-pointing a declaration at a
              * different person is a new declaration, not an edit. They are now
              * read-only, so there is nothing to re-select and nothing that can
              * render blank. The ids stay in form state via `reset()` and are
              * still submitted unchanged, so the payload is identical.
              *
              * `personnelOptions`, `companies` and `employments` are still read,
              * to resolve a human label for the employment. */}
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <SourceText source="Declaration subject (cannot be changed)" />
              </p>
              <dl className="grid gap-4 md:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    <SourceText source="Person" />
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {cnssData?.person_name || sourceText("—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    <SourceText source="Company" />
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {cnssData?.company_name || sourceText("—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    <SourceText source="Employment" />
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {employmentLabel}
                  </dd>
                </div>
              </dl>
              {/* Registered so the values travel with the submission even though
                * no visible control writes them. */}
              <input type="hidden" {...register("person")} />
              <input type="hidden" {...register("company")} />
              <input type="hidden" {...register("employment")} />
              {(errors.person || errors.company) && (
                <p className="mt-3 text-sm text-red-600">
                  <SourceText source="This declaration is missing its person or company link. Open it in the detail view and contact an administrator." />
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cnss_registration_number">
                  <SourceText
                    source="CNSS Registration Number *"
                    leading
                    trailing
                  />
                </Label>
                <Input
                  id="cnss_registration_number"
                  placeholder={sourceText("Enter CNSS registration number")}
                  {...register("cnss_registration_number")}
                  disabled={isSubmitting}
                />
                {errors.cnss_registration_number && (
                  <p className="text-sm text-red-600">
                    {errors.cnss_registration_number.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="situation">
                  <SourceText source="Situation *" />
                </Label>
                {situation ? (
                <Select
                  value={situation}
                  onValueChange={(value) => {
                    setValue("situation", value as CNSSSituation, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select situation")} />
                  </SelectTrigger>
                  <SelectContent>
                    {situationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                ) : (
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder={sourceText("Select situation")} />
                    </SelectTrigger>
                  </Select>
                )}
                {errors.situation && (
                  <p className="text-sm text-red-600">
                    {errors.situation.message}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Dates */}
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <SourceText source="Dates" leading trailing />
            </h3>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="first_declaration_date">
                  <SourceText
                    source="First Declaration Date *"
                    leading
                    trailing
                  />
                </Label>
                <ScheduleDate
                  id="first_declaration_date"
                  value={watch("first_declaration_date") ?? ""}
                  onChange={(val) => setValue("first_declaration_date", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting)}
                />
                {errors.first_declaration_date && (
                  <p className="text-sm text-red-600">
                    {errors.first_declaration_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="declaration_start_date">
                  <SourceText
                    source="Declaration Start Date *"
                    leading
                    trailing
                  />
                </Label>
                <ScheduleDate
                  id="declaration_start_date"
                  value={watch("declaration_start_date") ?? ""}
                  onChange={(val) => setValue("declaration_start_date", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting)}
                />
                {errors.declaration_start_date && (
                  <p className="text-sm text-red-600">
                    {errors.declaration_start_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="declaration_stop_date">
                  <SourceText source="Declaration Stop Date" leading trailing />
                </Label>
                <ScheduleDate
                  id="declaration_stop_date"
                  value={watch("declaration_stop_date") ?? ""}
                  onChange={(val) => setValue("declaration_stop_date", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting || !showStopFields)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resignation_date">
                  <SourceText source="Resignation Date" />
                </Label>
                <ScheduleDate
                  id="resignation_date"
                  value={watch("resignation_date") ?? ""}
                  onChange={(val) => setValue("resignation_date", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting || !showStopFields)}
                />
              </div>
            </div>

            {/* Stop Reason - conditional */}
            {showStopFields && (
              <>
                <Separator />
                <div className="space-y-2 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="font-medium text-amber-900 flex items-center gap-2">
                    <AlertCircleIcon className="h-4 w-4" />
                    <SourceText
                      source="Stop Information Required"
                      leading
                      trailing
                    />
                  </h4>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label htmlFor="stop_reason">
                        <SourceText source="Stop Reason *" />
                      </Label>
                      <Select
                        value={stopReason ?? ""}
                        onValueChange={(value) => {
                          setValue("stop_reason", value as CNSSStopReason, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={sourceText("Select stop reason")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {stopReasonOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.stop_reason && (
                        <p className="text-sm text-red-600">
                          {errors.stop_reason.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Observations */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Observations" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="observations">
              <SourceText source="Observations" />
            </Label>
            <textarea
              id="observations"
              rows={4}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder={sourceText("Additional observations (optional)")}
              {...register("observations")}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            <X className="me-2 h-4 w-4" />
            <SourceText source="Cancel" leading trailing />
          </Button>
          <Button type="submit" disabled={isSubmitting || !formDirty || Boolean(errors.situation)}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Updating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Update CNSS Declaration" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
