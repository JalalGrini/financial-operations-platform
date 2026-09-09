"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  Briefcase,
  CreditCard,
  FileText,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useCreateEmployment,
  useCompanies,
  usePersonnelSelect,
} from "@/features/personnel/hooks";
import {
  ContractType,
  EmploymentStatus,
  EmploymentDepartureReason,
} from "@/features/personnel/types";
import {
  buildEmploymentPayload,
  CONTRACT_TYPES_REQUIRING_END_DATE,
  employmentFormSchema,
  getEmploymentFieldErrors,
  type EmploymentFormValues,
} from "@/features/personnel/employment-contract";
import { toast } from "@/components/ui/toast";
import { GROUP_COMPANY_VALUE } from "@/lib/company-scope";
import { EmploymentPayoutFields } from "@/features/personnel/components/EmploymentPayoutFields";
import { ScheduleDate } from "@/components/ui/schedule-date";
const contractTypeOptions = [
  {
    value: ContractType.PERMANENT,
    get label() {
      return sourceText("Permanent (CDI)");
    },
  },
  {
    value: ContractType.FIXED_TERM,
    get label() {
      return sourceText("Fixed-term (CDD)");
    },
  },
  {
    value: ContractType.TEMPORARY,
    get label() {
      return sourceText("Temporary");
    },
  },
  {
    value: ContractType.INTERNSHIP,
    get label() {
      return sourceText("Internship");
    },
  },
  {
    value: ContractType.APPRENTICESHIP,
    get label() {
      return sourceText("Apprenticeship");
    },
  },
  {
    value: ContractType.SEASONAL,
    get label() {
      return sourceText("Seasonal");
    },
  },
  {
    value: ContractType.PART_TIME,
    get label() {
      return sourceText("Part-time");
    },
  },
  {
    value: ContractType.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
];
const employmentStatusOptions = [
  {
    value: EmploymentStatus.ACTIVE,
    get label() {
      return sourceText("Active");
    },
  },
  {
    value: EmploymentStatus.ON_LEAVE,
    get label() {
      return sourceText("On Leave");
    },
  },
  {
    value: EmploymentStatus.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: EmploymentStatus.RESIGNED,
    get label() {
      return sourceText("Resigned");
    },
  },
  {
    value: EmploymentStatus.TERMINATED,
    get label() {
      return sourceText("Terminated");
    },
  },
  {
    value: EmploymentStatus.RETIRED,
    get label() {
      return sourceText("Retired");
    },
  },
  {
    value: EmploymentStatus.FORMER,
    get label() {
      return sourceText("Former");
    },
  },
  {
    value: EmploymentStatus.CNSS_ONLY,
    get label() {
      return sourceText("CNSS Only");
    },
  },
  {
    value: EmploymentStatus.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
];
const departureReasonOptions = [
  {
    value: EmploymentDepartureReason.RESIGNATION,
    get label() {
      return sourceText("Resignation");
    },
  },
  {
    value: EmploymentDepartureReason.TERMINATION,
    get label() {
      return sourceText("Termination");
    },
  },
  {
    value: EmploymentDepartureReason.RETIREMENT,
    get label() {
      return sourceText("Retirement");
    },
  },
  {
    value: EmploymentDepartureReason.DEATH,
    get label() {
      return sourceText("Death");
    },
  },
  {
    value: EmploymentDepartureReason.CONTRACT_END,
    get label() {
      return sourceText("Contract End");
    },
  },
  {
    value: EmploymentDepartureReason.MUTUAL_AGREEMENT,
    get label() {
      return sourceText("Mutual Agreement");
    },
  },
  {
    value: EmploymentDepartureReason.REDUNDANCY,
    get label() {
      return sourceText("Redundancy");
    },
  },
  {
    value: EmploymentDepartureReason.MEDICAL,
    get label() {
      return sourceText("Medical");
    },
  },
  {
    value: EmploymentDepartureReason.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
];
export default function CreateEmploymentPage() {
  const router = useRouter();
  const createMutation = useCreateEmployment();
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<EmploymentFormValues>({
    resolver: zodResolver(employmentFormSchema),
    defaultValues: {
      employment_status: EmploymentStatus.ACTIVE,
      default_monthly_working_days: 26,
      authorized_leave_days_per_year: 18,
      payout_method: "cash",
    },
  });
  const employmentStatus = useWatch({ control, name: "employment_status" });
  const contractType = useWatch({ control, name: "contract_type" });
  const personId = useWatch({ control, name: "person" });
  const companyId = useWatch({ control, name: "company" });
  const departureReason = useWatch({ control, name: "departure_reason" });
  const payoutMethod = useWatch({ control, name: "payout_method" });
  const ribValue = useWatch({ control, name: "rib" });
  const requiresEndDate =
    CONTRACT_TYPES_REQUIRING_END_DATE.includes(contractType);
  const showDepartureFields =
    employmentStatus === EmploymentStatus.RESIGNED ||
    employmentStatus === EmploymentStatus.TERMINATED ||
    employmentStatus === EmploymentStatus.RETIRED ||
    employmentStatus === EmploymentStatus.FORMER;
  useEffect(() => {
    if (payoutMethod !== "bank") return;
    const selected = companies?.find((company) => company.id === companyId);
    if (selected?.rib && !ribValue) {
      setValue("rib", selected.rib, { shouldDirty: true, shouldValidate: true });
    }
  }, [companies, companyId, payoutMethod, ribValue, setValue]);
  const onSubmit = async (data: EmploymentFormValues) => {
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync(buildEmploymentPayload(data));
      toast.success(sourceText("Employment created successfully"));
      router.push("/personnel/employments");
      router.refresh();
    } catch (error: any) {
      const fieldErrors = getEmploymentFieldErrors(error);
      for (const [field, message] of Object.entries(fieldErrors)) {
        setError(field as keyof EmploymentFormValues, {
          type: "server",
          message,
        });
      }
      toast.error(error?.message || "Failed to create employment");
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
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("Employments");
            },
            href: "/personnel/employments",
          },
          {
            get label() {
              return sourceText("Create Employment");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Create Employment")}
        description={sourceText(
          "Add a new employment contract for an employee",
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
              <Briefcase className="h-5 w-5" />
              <SourceText source="Employment Details" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Employee & Company Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="person">
                  <SourceText source="Employee *" />
                </Label>
                <SearchableSelect
                  value={personId ?? ""}
                  onChange={(value) => {
                    setValue("person", value, { shouldDirty: true, shouldValidate: true });
                  }}
                  disabled={isSubmitting}
                  placeholder={sourceText("Select employee")}
                  searchPlaceholder={sourceText("Search by name, reference or CIN")}
                  options={(personnelOptions ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                    hint: [p.reference, p.cin ? `CIN: ${p.cin}` : null].filter(Boolean).join(" · "),
                  }))}
                />
                {errors.person && (
                  <p className="text-sm text-red-600">
                    {sourceText(errors.person.message ?? "")}
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
                    setValue("company", value, { shouldDirty: true, shouldValidate: true });
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select company")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GROUP_COMPANY_VALUE}>
                      {sourceText("Tout le groupe")}
                    </SelectItem>
                    {companies?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.reference})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.company && (
                  <p className="text-sm text-red-600">
                    {sourceText(errors.company.message ?? "")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="employee_reference">
                  <SourceText source="Employee Reference *" />
                </Label>
                <Input
                  id="employee_reference"
                  placeholder={sourceText("e.g., EMP-001")}
                  {...register("employee_reference")}
                  disabled={isSubmitting}
                />
                {errors.employee_reference && (
                  <p className="text-sm text-red-600">
                    {sourceText(errors.employee_reference.message ?? "")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="job_title">
                  <SourceText source="Job Title" />
                </Label>
                <Input
                  id="job_title"
                  placeholder={sourceText("e.g., Senior Accountant")}
                  {...register("job_title")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">
                  <SourceText source="Department" />
                </Label>
                <Input
                  id="department"
                  placeholder={sourceText("e.g., Finance")}
                  {...register("department")}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="work_domain">
                  <SourceText source="Work Domain" />
                </Label>
                <Input
                  id="work_domain"
                  placeholder={sourceText("e.g., Accounting")}
                  {...register("work_domain")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="work_city">
                  <SourceText source="Work City" />
                </Label>
                <Input
                  id="work_city"
                  placeholder={sourceText("e.g., Casablanca")}
                  {...register("work_city")}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Separator />

            {/* Contract Details */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <SourceText source="Contract Details" leading trailing />
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contract_type">
                    <SourceText source="Contract Type *" />
                  </Label>
                  <Select
                    value={contractType ?? ""}
                    onValueChange={(value) => {
                      setValue("contract_type", value as ContractType, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={sourceText("Select contract type")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {contractTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.contract_type && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.contract_type.message ?? "")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employment_status">
                    <SourceText source="Employment Status *" />
                  </Label>
                  <Select
                    value={employmentStatus ?? ""}
                    onValueChange={(value) => {
                      setValue("employment_status", value as EmploymentStatus, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={sourceText("Select status")} />
                    </SelectTrigger>
                    <SelectContent>
                      {employmentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.employment_status && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.employment_status.message ?? "")}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="hire_date">
                    <SourceText source="Hire Date *" />
                  </Label>
                  <ScheduleDate
                    id="hire_date"
                    value={watch("hire_date") ?? ""}
                    onChange={(val) => setValue("hire_date", val, { shouldDirty: true, shouldValidate: true })}
                    disabled={(isSubmitting)}
                  />
                  {errors.hire_date && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.hire_date.message ?? "")}
                    </p>
                  )}
                </div>

                <div className="space-y-2 min-w-0">
                  <Label htmlFor="employment_end_date">
                    <SourceText source="End Date" leading />{" "}
                    {requiresEndDate && <span className="text-red-600">*</span>}
                  </Label>
                  <ScheduleDate
                    id="employment_end_date"
                    value={watch("employment_end_date") ?? ""}
                    onChange={(val) => setValue("employment_end_date", val, { shouldDirty: true, shouldValidate: true })}
                    disabled={(isSubmitting || !requiresEndDate)}
                  />
                  {requiresEndDate && (
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Required for fixed-duration contracts (CDD, temporary, internship…)"
                        leading
                        trailing
                      />
                    </p>
                  )}
                  {errors.employment_end_date && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.employment_end_date.message ?? "")}
                    </p>
                  )}
                </div>

                <div className="space-y-2 min-w-0">
                  <Label htmlFor="default_monthly_working_days">
                    <SourceText
                      source="Default Working Days *"
                      leading
                      trailing
                    />
                  </Label>
                  <Input
                    id="default_monthly_working_days"
                    type="number"
                    min="1"
                    max="31"
                    {...register("default_monthly_working_days", {
                      valueAsNumber: true,
                    })}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="authorized_leave_days_per_year">
                    <SourceText source="Authorized leave days per year" />
                  </Label>
                  <Input
                    id="authorized_leave_days_per_year"
                    type="number"
                    min="0"
                    max="365"
                    {...register("authorized_leave_days_per_year", {
                      valueAsNumber: true,
                    })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Used when creating leaves. Extra days require confirmation." />
                  </p>
                </div>
              </div>

              {/* Per-employee day pricing. Optional on purpose: left blank, payroll
                  keeps deriving the rate from gross salary / scheduled days, which
                  is how every employment behaved before these existed. */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="worked_day_rate">
                    <SourceText source="Worked-day rate" leading trailing />
                  </Label>
                  <Input
                    id="worked_day_rate"
                    type="text"
                    inputMode="decimal"
                    placeholder={sourceText("Auto (gross / working days)")}
                    {...register("worked_day_rate")}
                    error={errors.worked_day_rate?.message ? sourceText(errors.worked_day_rate.message) : undefined}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Leave empty to derive it from the gross salary." />
                  </p>
                  {errors.worked_day_rate && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.worked_day_rate.message ?? "")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="absence_day_rate">
                    <SourceText source="Absence-day rate" leading trailing />
                  </Label>
                  <Input
                    id="absence_day_rate"
                    type="text"
                    inputMode="decimal"
                    placeholder={sourceText("Same as worked-day rate")}
                    {...register("absence_day_rate")}
                    error={errors.absence_day_rate?.message ? sourceText(errors.absence_day_rate.message) : undefined}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Amount deducted per unpaid absence day." />
                  </p>
                  {errors.absence_day_rate && (
                    <p className="text-sm text-red-600">
                      {sourceText(errors.absence_day_rate.message ?? "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Departure Fields - conditional */}
              {showDepartureFields && (
                <div className="space-y-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="font-medium text-amber-900 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <SourceText
                      source="Departure Information Required"
                      leading
                      trailing
                    />
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="departure_reason">
                        <SourceText
                          source="Departure Reason *"
                          leading
                          trailing
                        />
                      </Label>
                      <Select
                        value={departureReason ?? ""}
                        onValueChange={(value) => {
                          setValue(
                            "departure_reason",
                            value as unknown as EmploymentDepartureReason,
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={sourceText("Select departure reason")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {departureReasonOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.departure_reason && (
                        <p className="text-sm text-red-600">
                          {sourceText(errors.departure_reason.message ?? "")}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="resignation_date">
                        <SourceText
                          source="Resignation Date *"
                          leading
                          trailing
                        />
                      </Label>
                      <ScheduleDate
                        id="resignation_date"
                        value={watch("resignation_date") ?? ""}
                        onChange={(val) => setValue("resignation_date", val, { shouldDirty: true, shouldValidate: true })}
                        disabled={(isSubmitting)}
                      />
                      {errors.resignation_date && (
                        <p className="text-sm text-red-600">
                          {sourceText(errors.resignation_date.message ?? "")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Payment & Banking */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <SourceText source="Payment & Banking" leading trailing />
              </h3>

              <EmploymentPayoutFields
                payoutMethod={payoutMethod}
                rib={ribValue || ""}
                ribError={errors.rib?.message}
                disabled={isSubmitting}
                onPayoutChange={(value) =>
                  setValue("payout_method", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                onRibChange={(value) =>
                  setValue("rib", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>

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
                <SourceText source="Create Employment" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
