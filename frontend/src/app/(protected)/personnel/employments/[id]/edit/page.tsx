"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useUpdateEmployment,
  useEmploymentDetail,
  usePaymentMethods,
} from "@/features/personnel/hooks";
import { useCompanies, usePersonnelSelect } from "@/features/personnel/hooks";
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
import { ScheduleDate } from "@/components/ui/schedule-date";
import { GuidePanel } from "@/components/ui/guide-panel";
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

export default function EditEmploymentPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const updateMutation = useUpdateEmployment();
  const { data: companies } = useCompanies();
  const { data: personnelOptions } = usePersonnelSelect();
  const {
    data: paymentMethods,
    isLoading: paymentMethodsLoading,
    isError: paymentMethodsFailed,
    refetch: retryPaymentMethods,
  } = usePaymentMethods();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: employmentData, isLoading, error } = useEmploymentDetail(id);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<EmploymentFormValues>({
    resolver: zodResolver(employmentFormSchema),
    defaultValues: {
      default_monthly_working_days: 26,
    },
  });
  const employmentStatus = useWatch({ control, name: "employment_status" });
  const contractType = useWatch({ control, name: "contract_type" });
  const personId = useWatch({ control, name: "person" });
  const companyId = useWatch({ control, name: "company" });
  const departureReason = useWatch({ control, name: "departure_reason" });
  const paymentMethod = useWatch({ control, name: "payment_method" });
  const requiresEndDate =
    CONTRACT_TYPES_REQUIRING_END_DATE.includes(contractType);
  useEffect(() => {
    if (!requiresEndDate) {
      setValue("employment_end_date", "", { shouldValidate: true });
    }
  }, [requiresEndDate, setValue]);

  const showDepartureFields =
    employmentStatus === EmploymentStatus.RESIGNED ||
    employmentStatus === EmploymentStatus.TERMINATED ||
    employmentStatus === EmploymentStatus.RETIRED ||
    employmentStatus === EmploymentStatus.FORMER;
  // Populate form when data loads
  useEffect(() => {
    if (employmentData && !isDirty) {
      reset({
        person: employmentData.person,
        company: employmentData.company,
        employee_reference: employmentData.employee_reference,
        job_title: employmentData.job_title || "",
        department: employmentData.department || "",
        work_domain: employmentData.work_domain || "",
        work_city: employmentData.work_city || "",
        contract_type: employmentData.contract_type,
        employment_status: employmentData.employment_status,
        hire_date: employmentData.hire_date
          ? employmentData.hire_date.split("T")[0]
          : "",
        employment_end_date: employmentData.employment_end_date
          ? employmentData.employment_end_date.split("T")[0]
          : "",
        departure_reason: employmentData.departure_reason || undefined,
        resignation_date: employmentData.resignation_date
          ? employmentData.resignation_date.split("T")[0]
          : "",
        payment_method: employmentData.payment_method || "",
        rib: employmentData.rib || "",
        default_monthly_working_days:
          employmentData.default_monthly_working_days || 26,
        // `?? ""` rather than `|| ""`: a saved rate of 0 is a real price and must
        // stay in the field, where `||` would blank it and silently revert the
        // employment to the derived default on the next save.
        worked_day_rate:
          employmentData.worked_day_rate != null
            ? String(employmentData.worked_day_rate)
            : "",
        absence_day_rate:
          employmentData.absence_day_rate != null
            ? String(employmentData.absence_day_rate)
            : "",
        observations: employmentData.observations || "",
      });
    }
  }, [employmentData, isDirty, reset]);
  const onSubmit = async (data: EmploymentFormValues) => {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        id,
        data: buildEmploymentPayload(data),
      });
      toast.success(sourceText("Employment updated successfully"));
      router.push(`/personnel/employments/${id}`);
      router.refresh();
    } catch (error: any) {
      const fieldErrors = getEmploymentFieldErrors(error);
      for (const [field, message] of Object.entries(fieldErrors)) {
        setError(field as keyof EmploymentFormValues, {
          type: "server",
          message,
        });
      }
      toast.error(error?.message || sourceText("Failed to update employment"));
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
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <p className="text-red-600">
          <SourceText source="Failed to load employment data" />
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
            href: "/personnel",
          },
          {
            get label() {
              return sourceText("Employments");
            },
            href: "/personnel/employments",
          },
          {
            label: employmentData?.person_name || sourceText("Loading..."),
            href: `/personnel/employments/${id}`,
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
        title={sourceText("Edit Employment")}
        description={`${sourceText("Update details for")} ${employmentData?.person_name || sourceText("employment")}`}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to Profile" leading trailing />
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Briefcase} label={sourceText("Reference")} value={employmentData?.employee_reference || sourceText("Unavailable")} tone="primary" />
          <StatCard icon={FileText} label={sourceText("Contract mode")} value={contractType ? sourceText(contractType) : sourceText("Unknown")} tone="indigo" />
          <StatCard icon={AlertCircle} label={sourceText("Status")} value={employmentStatus ? sourceText(employmentStatus) : sourceText("Unknown")} tone="amber" />
          <StatCard icon={CreditCard} label={sourceText("Payment method")} value={paymentMethod ? sourceText("Configured") : sourceText("Not configured")} tone={paymentMethod ? "emerald" : "rose"} />
        </div>

        <GuidePanel
          eyebrow={"Employment edit guide"}
          title={"Keep contracts, locked identity fields and payment settings aligned"}
          body={"Use this page to adjust operational employment details without breaking the selected employee-company relationship or contract logic."}
          items={[
            "Employee, company and employee reference stay fixed so downstream payroll history remains traceable.",
            "Permanent contracts should stay open-ended while temporary contracts must keep a valid end date.",
            "Review payment methods and departure fields carefully because they affect payroll and closure workflows.",
          ]}
        />
      </section>

      {/* Form */}
      <form key={employmentData?.id} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                <Select
                  value={personId ?? ""}
                  onValueChange={(value) => {
                    setValue("person", value, { shouldValidate: true });
                  }}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select employee")} />
                  </SelectTrigger>
                  <SelectContent>
                    {personnelOptions?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.reference}){p.cin && ` - CIN: ${p.cin}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  disabled
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

            <p className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <SourceText
                source="Employee, company, and employee reference stay locked while editing this employment."
                leading
                trailing
              />
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="employee_reference">
                  <SourceText source="Employee Reference *" />
                </Label>
                <Input
                  id="employee_reference"
                  placeholder={sourceText("e.g., EMP-001")}
                  {...register("employee_reference")}
                  disabled
                />
                {errors.employee_reference && (
                  <p className="text-sm text-red-600">
                    {errors.employee_reference.message}
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
                      {errors.contract_type.message}
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
                      {errors.employment_status.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="hire_date">
                    <SourceText source="Hire Date *" />
                  </Label>
                  <ScheduleDate
                    id="hire_date"
                    value={watch("hire_date") ?? ""}
                    onChange={(val) => setValue("hire_date", val)}
                    disabled={(isSubmitting)}
                  />
                  {errors.hire_date && (
                    <p className="text-sm text-red-600">
                      {errors.hire_date.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employment_end_date">
                    <SourceText source="End Date" leading />{" "}
                    {requiresEndDate && <span className="text-red-600">*</span>}
                  </Label>
                  <ScheduleDate
                    id="employment_end_date"
                    value={watch("employment_end_date") ?? ""}
                    onChange={(val) => setValue("employment_end_date", val)}
                    disabled={(isSubmitting || !requiresEndDate)}
                  />
                  {requiresEndDate ? (
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Required for fixed-duration contracts (CDD, temporary, internship…)"
                        leading
                        trailing
                      />
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Permanent contracts (CDI) do not allow an end date."
                        leading
                        trailing
                      />
                    </p>
                  )}
                  {errors.employment_end_date && (
                    <p className="text-sm text-red-600">
                      {errors.employment_end_date.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
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
              </div>

              {/* Per-employee day pricing. Blank means payroll keeps deriving the
                  rate from gross salary / scheduled days. */}
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
                    error={errors.worked_day_rate?.message}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Leave empty to derive it from the gross salary." />
                  </p>
                  {errors.worked_day_rate && (
                    <p className="text-sm text-red-600">
                      {errors.worked_day_rate.message}
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
                    error={errors.absence_day_rate?.message}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Amount deducted per unpaid absence day." />
                  </p>
                  {errors.absence_day_rate && (
                    <p className="text-sm text-red-600">
                      {errors.absence_day_rate.message}
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
                  <div className="grid gap-4 md:grid-cols-3">
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
                            { shouldValidate: true },
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
                          {errors.departure_reason.message}
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
            </div>

            <Separator />

            {/* Payment & Banking */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <SourceText source="Payment & Banking" leading trailing />
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment_method">
                    <SourceText source="Payment Method" />
                  </Label>
                  <Select
                    value={paymentMethod || "__none__"}
                    onValueChange={(value) => {
                      setValue(
                        "payment_method",
                        value === "__none__" ? "" : value,
                        { shouldValidate: true },
                      );
                    }}
                    disabled={
                      isSubmitting ||
                      paymentMethodsLoading ||
                      paymentMethodsFailed
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          paymentMethodsLoading
                            ? sourceText("Loading payment methods…")
                            : sourceText("Select payment method")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <SourceText source="None" />
                      </SelectItem>
                      {(paymentMethods || []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {paymentMethodsFailed ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 underline"
                      onClick={() => retryPaymentMethods()}
                    >
                      <SourceText
                        source="Failed to load payment methods. Retry"
                        leading
                        trailing
                      />
                    </button>
                  ) : !paymentMethodsLoading &&
                    (paymentMethods || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="No active payment methods configured. An administrator can add one in Configuration."
                        leading
                        trailing
                      />
                    </p>
                  ) : null}
                  {errors.payment_method && (
                    <p className="text-sm text-red-600">
                      {errors.payment_method.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rib">
                    <SourceText source="RIB / IBAN" />
                  </Label>
                  <Input
                    id="rib"
                    placeholder={sourceText("Bank account details (optional)")}
                    {...register("rib")}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
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
                <SourceText source="Updating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Update Employment" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
