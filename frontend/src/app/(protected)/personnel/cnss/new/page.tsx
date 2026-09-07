"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  FileCheck,
  Calendar,
  Building2,
  Briefcase,
  User,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
import { Combobox } from "@/components/ui/searchable-select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useCreateCNSSDeclaration,
  usePersonnelSelect,
  useCompanies,
  useEmploymentsByPerson,
} from "@/features/personnel/hooks";
import {
  CNSSSituation,
  CNSSStopReason,
  type CNSSDeclarationCreate,
} from "@/features/personnel/types";
import { toast } from "@/components/ui/toast";
import { ScheduleDate } from "@/components/ui/schedule-date";

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const createCNSSSchema = z.object({
  person: z.string().min(1, sourceText("Employee is required")),
  company: z.string().min(1, sourceText("Company is required")),
  employment: z.string().optional(),
  cnss_registration_number: z
    .string()
    .min(1, sourceText("CNSS registration number is required")),
  situation: z.nativeEnum(CNSSSituation),
  first_declaration_date: z
    .string()
    .min(1, sourceText("First declaration date is required")),
  declaration_start_date: z
    .string()
    .min(1, sourceText("Declaration start date is required")),
  declaration_stop_date: z.string().optional(),
  resignation_date: z.string().optional(),
  stop_reason: z.nativeEnum(CNSSStopReason).optional(),
  observations: z.string().optional(),
});
type CreateCNSSForm = z.infer<typeof createCNSSSchema>;
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
export default function CreateCNSSDeclarationPage() {
  const router = useRouter();
  const createMutation = useCreateCNSSDeclaration();
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateCNSSForm>({
    resolver: zodResolver(createCNSSSchema),
    defaultValues: {
      situation: CNSSSituation.DECLARED_BY_THIS_COMPANY,
    },
  });
  const personId = useWatch({ control, name: "person" });
  const companyId = useWatch({ control, name: "company" });
  const employmentId = useWatch({ control, name: "employment" });
  const situationValue = useWatch({ control, name: "situation" });
  const firstDeclarationDate = useWatch({
    control,
    name: "first_declaration_date",
  });
  const declarationStartDate = useWatch({
    control,
    name: "declaration_start_date",
  });
  const stopReason = useWatch({ control, name: "stop_reason" });
  const showStopFields = situationValue === CNSSSituation.STOPPED;
  // Fetch employments for selected person and company
  const { data: employments, isLoading: employmentsLoading } =
    useEmploymentsByPerson(personId);
  // Set default dates to today
  useEffect(() => {
    if (!firstDeclarationDate) {
      setValue("first_declaration_date", todayInputValue());
    }
    if (!declarationStartDate) {
      setValue("declaration_start_date", todayInputValue());
    }
  }, [declarationStartDate, firstDeclarationDate, setValue]);
  const onSubmit = async (data: CreateCNSSForm) => {
    setIsSubmitting(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== "" && v !== undefined),
      ) as unknown as CNSSDeclarationCreate;
      await createMutation.mutateAsync(payload);
      toast.success(sourceText("CNSS Declaration created successfully"));
      router.push("/personnel/cnss");
      router.refresh();
    } catch (error: any) {
      toast.error(
        error?.message || sourceText("Failed to create CNSS declaration"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancel = () => {
    router.back();
  };
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel",
          },
          {
            get label() {
              return sourceText("CNSS");
            },
            href: "/personnel/cnss",
          },
          {
            get label() {
              return sourceText("Create CNSS Declaration");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Create CNSS Declaration")}
        description={sourceText(
          "Register a new CNSS declaration for an employee",
        )}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to List" leading trailing />
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
            {/* Employee & Company Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="person">
                  <SourceText source="Employee *" />
                </Label>
                {/* Combobox rather than the plain Select: this list is
                  * every person on the platform, and a scroll-only picker gets
                  * unusable well before it gets long. Typing filters on name,
                  * reference and CIN, accent-insensitively, so "se" finds
                  * "Sécurité" and so does "securite". */}
                <Combobox
                  id="person"
                  value={personId ?? ""}
                  onChange={(value) =>
                    setValue("person", value, { shouldValidate: true })
                  }
                  disabled={isSubmitting}
                  placeholder={sourceText("Select employee")}
                  searchPlaceholder={sourceText("Search by name, reference or CIN")}
                  options={(personnelOptions ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                    hint: [p.reference, p.cin ? `CIN: ${p.cin}` : null]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                />
                {errors.person && (
                  <p className="text-sm text-red-600">
                    {errors.person.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">
                  <SourceText source="Company *" />
                </Label>
                <Select
                  value={companyId ?? ""}
                  onValueChange={(value) => {
                    setValue("company", value, { shouldValidate: true });
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select company")} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.reference})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.company && (
                  <p className="text-sm text-red-600">
                    {errors.company.message}
                  </p>
                )}
              </div>
            </div>

            {/* Employment Selection (optional, filtered by person & company) */}
            {personId && companyId && (
              <div className="space-y-2">
                <Label htmlFor="employment">
                  <SourceText source="Employment (Optional)" />
                </Label>
                {employmentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    <SourceText
                      source="Loading employments…"
                      leading
                      trailing
                    />
                  </div>
                ) : (
                  <Select
                    value={employmentId ?? ""}
                    onValueChange={(value) => {
                      setValue("employment", value, { shouldValidate: true });
                    }}
                    disabled={
                      isSubmitting || !employments || employments.length === 0
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={sourceText("Select employment")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {employments?.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.person_name} - {e.employee_reference} (
                          {e.company_name}) -{" "}
                          {e.job_title || sourceText("No title")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.employment && (
                  <p className="text-sm text-red-600">
                    {errors.employment.message}
                  </p>
                )}
                {!employmentsLoading &&
                  employments &&
                  employments.length === 0 && (
                    <p className="text-sm text-amber-600">
                      <SourceText
                        source="No active employments found for this employee at this company"
                        leading
                        trailing
                      />
                    </p>
                  )}
              </div>
            )}

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
                <Select
                  value={situationValue ?? ""}
                  onValueChange={(value) => {
                    setValue("situation", value as CNSSSituation, {
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
              <SourceText source="Declaration Dates" leading trailing />
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
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
                  onChange={(val) => setValue("first_declaration_date", val)}
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
                  onChange={(val) => setValue("declaration_start_date", val)}
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
                  onChange={(val) => setValue("declaration_stop_date", val)}
                  disabled={(isSubmitting)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resignation_date">
                  <SourceText source="Resignation Date" />
                </Label>
                <ScheduleDate
                  id="resignation_date"
                  value={watch("resignation_date") ?? ""}
                  onChange={(val) => setValue("resignation_date", val)}
                  disabled={(isSubmitting)}
                />
              </div>
            </div>

            {/* Stop Fields - conditional */}
            {showStopFields && (
              <div className="space-y-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h4 className="font-medium text-amber-900 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <SourceText
                    source="Stop Information Required"
                    leading
                    trailing
                  />
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="stop_reason">
                      <SourceText source="Stop Reason *" />
                    </Label>
                    <Select
                      value={stopReason ?? ""}
                      onValueChange={(value) => {
                        setValue("stop_reason", value as CNSSStopReason, {
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

                  <div className="space-y-2">
                    <Label htmlFor="resignation_date">
                      <SourceText source="Resignation Date *" />
                    </Label>
                    <ScheduleDate
                      id="resignation_date"
                      value={watch("resignation_date") ?? ""}
                      onChange={(val) => setValue("resignation_date", val)}
                      disabled={(isSubmitting)}
                    />
                    {errors.resignation_date && (
                      <p className="text-sm text-red-600">
                        {errors.resignation_date.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Observations */}
            <div className="space-y-2">
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
            </div>
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
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Creating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Create CNSS Declaration" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
