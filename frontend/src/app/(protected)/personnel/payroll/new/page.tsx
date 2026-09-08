"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/ui/toast";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/searchable-select";
import { sourceText } from "@/lib/i18n/source-catalog";
import {
  useCreateAdjustment,
  useCreatePayroll,
  useEmploymentsByPerson,
  usePaymentMethods,
  usePersonnelSelect,
  useRecalculatePayroll,
  useRecordAdvance,
  useRecordFinalPayment,
  useRecordPartialPayment,
} from "@/features/personnel/hooks";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { GuidePanel } from "@/components/ui/guide-panel";
import {
  PayrollAdjustmentDirection,
  PayrollAdjustmentType,
  PayrollPaymentKind,
} from "@/features/personnel/types";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

const createPayrollSchema = z.object({
  person: z.string().min(1, sourceText("Employee is required.")),
  employment: z.string().min(1, sourceText("Employment is required.")),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  scheduled_working_days: z.number().int().positive().default(26),
  worked_days: z.number().int().min(0).optional(),
  absence_days: z.number().int().min(0).optional(),
  authorized_leave_days: z.number().int().min(0).optional(),
  unpaid_leave_days: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  observations: z.string().optional(),
});

type CreatePayrollForm = z.infer<typeof createPayrollSchema>;

type DraftAdjustment = {
  id: string;
  adjustment_type: PayrollAdjustmentType;
  direction: PayrollAdjustmentDirection;
  amount: string;
  effective_date: string;
  description: string;
  notes: string;
};

type DraftPayment = {
  id: string;
  kind: PayrollPaymentKind;
  amount: string;
  payment_date: string;
  payment_method?: string;
  reference_number: string;
  notes: string;
};

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const newAdjustment = (): DraftAdjustment => ({
  id: crypto.randomUUID(),
  adjustment_type: PayrollAdjustmentType.SUPPLEMENT,
  direction: PayrollAdjustmentDirection.ADDITION,
  amount: "",
  effective_date: todayInputValue(),
  description: "",
  notes: "",
});

const newPayment = (): DraftPayment => ({
  id: crypto.randomUUID(),
  kind: PayrollPaymentKind.PARTIAL,
  amount: "",
  payment_date: todayInputValue(),
  payment_method: "",
  reference_number: "",
  notes: "",
});

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

export default function CreatePayrollPage() {
  const router = useRouter();
  const createMutation = useCreatePayroll();
  const createAdjustmentMutation = useCreateAdjustment();
  const recalculateMutation = useRecalculatePayroll();
  const recordAdvanceMutation = useRecordAdvance();
  const recordPartialMutation = useRecordPartialPayment();
  const recordFinalMutation = useRecordFinalPayment();
  const { data: personnelOptions } = usePersonnelSelect();
  const { data: paymentMethods } = usePaymentMethods();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dailyRateOverride, setDailyRateOverride] = useState<number | null>(null);
  const [absenceRateOverride, setAbsenceRateOverride] = useState<number | null>(null);
  const [initialAdjustments, setInitialAdjustments] = useState<
    DraftAdjustment[]
  >([]);
  const [initialPayments, setInitialPayments] = useState<DraftPayment[]>([]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CreatePayrollForm>({
    resolver: zodResolver(createPayrollSchema),
    defaultValues: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      scheduled_working_days: 26,
      worked_days: 0,
      absence_days: 0,
      authorized_leave_days: 0,
      unpaid_leave_days: 0,
      notes: "",
      observations: "",
    },
  });

  const personId = useWatch({ control, name: "person" });
  const employmentId = useWatch({ control, name: "employment" });
  const payrollYear = useWatch({ control, name: "year" });
  const payrollMonth = useWatch({ control, name: "month" });

  const { data: employments, isLoading: employmentsLoading } =
    useEmploymentsByPerson(personId);

  const monthOptions = useMemo(() => {
    const options: Array<{
      year: number;
      month: number;
      value: string;
      label: string;
    }> = [];
    const now = new Date();
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: date.toLocaleDateString(localeTag(), {
          month: "long",
          year: "numeric",
        }),
      });
    }
    return options;
  }, []);

  const handleMonthChange = (value: string) => {
    const match = monthOptions.find((option) => option.value === value);
    if (!match) return;
    setValue("year", match.year);
    setValue("month", match.month);
  };

  const selectedMonthOption = monthOptions.find(
    (option) => option.year === payrollYear && option.month === payrollMonth,
  );
  const selectedEmployment = employments?.find(
    (employment: any) => employment.id === employmentId,
  );

  const updateAdjustment = (
    id: string,
    key: keyof DraftAdjustment,
    value: string,
  ) => {
    setInitialAdjustments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  };

  const updatePayment = (
    id: string,
    key: keyof DraftPayment,
    value: string,
  ) => {
    setInitialPayments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  };

  const onSubmit = async (data: CreatePayrollForm) => {
    setIsSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        employment: data.employment,
        year: data.year,
        month: data.month,
        scheduled_working_days: data.scheduled_working_days,
        worked_days: data.worked_days ?? 0,
        absence_days: data.absence_days ?? 0,
        authorized_leave_days: data.authorized_leave_days ?? 0,
        unpaid_leave_days: data.unpaid_leave_days ?? 0,
        notes: data.notes || undefined,
        observations: data.observations || undefined,
      });

      for (const adjustment of initialAdjustments) {
        const amount = parseFloat(adjustment.amount);
        if (
          Number.isNaN(amount) ||
          amount <= 0 ||
          !adjustment.description.trim()
        ) {
          continue;
        }
        await createAdjustmentMutation.mutateAsync({
          payroll_record: created.id,
          adjustment_type: adjustment.adjustment_type,
          direction: adjustment.direction,
          amount,
          effective_date: adjustment.effective_date,
          description: adjustment.description,
          notes: adjustment.notes || undefined,
        });
      }

      if (initialAdjustments.length > 0 || dailyRateOverride != null || absenceRateOverride != null) {
        await recalculateMutation.mutateAsync({
          id: created.id,
          daily_rate_override: dailyRateOverride,
          absence_rate_override: absenceRateOverride,
        });
      }

      for (const payment of initialPayments) {
        const amount = parseFloat(payment.amount);
        if (Number.isNaN(amount) || amount <= 0) continue;
        const payload = {
          amount,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method || undefined,
          reference_number: payment.reference_number || undefined,
          notes: payment.notes || undefined,
        };
        if (payment.kind === PayrollPaymentKind.ADVANCE) {
          await recordAdvanceMutation.mutateAsync({
            payrollId: created.id,
            data: payload,
          });
        } else if (payment.kind === PayrollPaymentKind.FINAL) {
          await recordFinalMutation.mutateAsync({
            payrollId: created.id,
            data: payload,
          });
        } else {
          await recordPartialMutation.mutateAsync({
            payrollId: created.id,
            data: payload,
          });
        }
      }

      toast.success(sourceText("Payroll created successfully"));
      router.push(`/personnel/payroll/${created.id}`);
      router.refresh();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to create payroll"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Personnel"), href: "/personnel" },
          { label: sourceText("Payroll"), href: "/personnel/payroll" },
          { label: sourceText("Create Payroll"), isCurrent: true },
        ]}
      />

      <PageHeader
        title={sourceText("Create Payroll")}
        description={sourceText("Create a new payroll record for an employee")}
        action={
          <Button variant="outline" asChild>
            <Link href="/personnel/payroll">
              <ArrowLeft className="me-2 h-4 w-4" />
              <SourceText source="Back to List" leading trailing />
            </Link>
          </Button>
        }
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Plus} label={sourceText("Draft adjustments")} value={initialAdjustments.length} tone="indigo" />
          <StatCard icon={CreditCard} label={sourceText("Draft payments")} value={initialPayments.length} tone="amber" />
          <StatCard icon={Check} label={sourceText("Period")} value={selectedMonthOption?.label || `${String(payrollMonth).padStart(2, "0")}/${payrollYear}`} tone="primary" />
          <StatCard icon={ArrowLeft} label={sourceText("Employment")} value={selectedEmployment?.employee_reference || sourceText("None selected")} tone={selectedEmployment ? "emerald" : "rose"} />
        </div>

        <GuidePanel
          eyebrow={"Payroll creation guide"}
          title={"Prepare payroll, adjustments and payments in one pass"}
          body={"Create the payroll record, add adjustments that affect the calculation, then register any advance, partial or final payments before leaving the flow."}
          items={[
            "Choose the employment carefully so salary, company and assignment data stay aligned.",
            "Add only the adjustments that should affect this payroll month before recalculating.",
            "Use payment drafts when money was already advanced or settled during payroll preparation.",
          ]}
        />
      </section>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <SourceText source="Payroll Details" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="person">
                <SourceText source="Employee *" />
              </Label>
              <Combobox
                value={personId ?? ""}
                onChange={(value) =>
                  setValue("person", value, { shouldValidate: true })
                }
                disabled={isSubmitting}
                placeholder={sourceText("Select employee")}
                searchPlaceholder={sourceText("Search by name or reference")}
                options={(personnelOptions ?? []).map((p: any) => ({
                  value: p.id,
                  label: p.name,
                  hint: [p.reference, p.cin ? `CIN: ${p.cin}` : null].filter(Boolean).join(" · "),
                }))}
              />
              {errors.person ? (
                <p className="text-sm text-red-600">{errors.person.message}</p>
              ) : null}
            </div>

            {personId && (
              <div className="space-y-2">
                <Label htmlFor="employment">
                  <SourceText source="Employment *" />
                </Label>
                {employmentsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    <SourceText
                      source="Loading employments…"
                      leading
                      trailing
                    />
                  </p>
                ) : (
                  <Select
                    value={employmentId ?? ""}
                    onValueChange={(value) =>
                      setValue("employment", value, { shouldValidate: true })
                    }
                    disabled={isSubmitting || !employments?.length}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={sourceText("Select employment")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {employments?.map((employment: any) => (
                        <SelectItem key={employment.id} value={employment.id}>
                          {employment.person_name} -{" "}
                          {employment.employee_reference} (
                          {employment.company_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.employment ? (
                  <p className="text-sm text-red-600">
                    {errors.employment.message}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="payroll_month">
                  <SourceText source="Payroll Month *" />
                </Label>
                <Select
                  value={`${payrollYear}-${String(payrollMonth).padStart(2, "0")}`}
                  onValueChange={handleMonthChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select month")} />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_working_days">
                  <SourceText
                    source="Scheduled Working Days *"
                    leading
                    trailing
                  />
                </Label>
                <Input
                  id="scheduled_working_days"
                  type="number"
                  min="1"
                  max="31"
                  disabled={isSubmitting}
                  {...register("scheduled_working_days", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worked_days">
                  <SourceText source="Worked Days" />
                </Label>
                <Input
                  id="worked_days"
                  type="number"
                  min="0"
                  max="31"
                  disabled={isSubmitting}
                  {...register("worked_days", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="absence_days">
                  <SourceText source="Absence Days" />
                </Label>
                <Input
                  id="absence_days"
                  type="number"
                  min="0"
                  max="31"
                  disabled={isSubmitting}
                  {...register("absence_days", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authorized_leave_days">
                  <SourceText source="Authorized Leave Days" leading trailing />
                </Label>
                <Input
                  id="authorized_leave_days"
                  type="number"
                  min="0"
                  max="31"
                  disabled={isSubmitting}
                  {...register("authorized_leave_days", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unpaid_leave_days">
                  <SourceText source="Unpaid Leave Days" />
                </Label>
                <Input
                  id="unpaid_leave_days"
                  type="number"
                  min="0"
                  max="31"
                  disabled={isSubmitting}
                  {...register("unpaid_leave_days", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily_rate_override">
                  <SourceText source="Daily Rate Override (optional)" />
                </Label>
                <Input
                  id="daily_rate_override"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={sourceText("Auto-computed from gross ÷ working days")}
                  disabled={isSubmitting}
                  value={dailyRateOverride ?? ""}
                  onChange={(e) =>
                    setDailyRateOverride(
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Set a fixed per-day rate. Overrides the auto-computed rate and also sets the absence deduction per day." />
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="absence_rate_override">
                  <SourceText source="Absence/Leave Deduction Rate (optional)" />
                </Label>
                <Input
                  id="absence_rate_override"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={sourceText("Defaults to worked-day rate if blank")}
                  disabled={isSubmitting}
                  value={absenceRateOverride ?? ""}
                  onChange={(e) =>
                    setAbsenceRateOverride(
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Set a separate per-day deduction rate for unpaid leave and absence days. Leave blank to use the same rate as worked days." />
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notes">
                  <SourceText source="Notes" />
                </Label>
                <textarea
                  id="notes"
                  rows={4}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={isSubmitting}
                  {...register("notes")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="observations">
                  <SourceText source="Observations" />
                </Label>
                <textarea
                  id="observations"
                  rows={4}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={isSubmitting}
                  {...register("observations")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              <SourceText source="Adjustments" leading trailing />
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setInitialAdjustments((current) => [
                  ...current,
                  newAdjustment(),
                ])
              }
            >
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Add Adjustment" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {initialAdjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="No adjustments added yet"
                  leading
                  trailing
                />
              </p>
            ) : (
              initialAdjustments.map((adjustment, index) => (
                <div
                  key={adjustment.id}
                  className="space-y-4 rounded-2xl border p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      <SourceText source="Adjustment" leading /> #{index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setInitialAdjustments((current) =>
                          current.filter((item) => item.id !== adjustment.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Select
                      value={adjustment.adjustment_type}
                      onValueChange={(value) =>
                        updateAdjustment(
                          adjustment.id,
                          "adjustment_type",
                          value,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PayrollAdjustmentType).map((value) => (
                          <SelectItem key={value} value={value}>
                            {sourceText(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={adjustment.direction}
                      onValueChange={(value) =>
                        updateAdjustment(adjustment.id, "direction", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PayrollAdjustmentDirection.ADDITION}>
                          {sourceText("Addition")}
                        </SelectItem>
                        <SelectItem
                          value={PayrollAdjustmentDirection.DEDUCTION}
                        >
                          {sourceText("Deduction")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={sourceText("Amount *")}
                      value={adjustment.amount}
                      onChange={(event) =>
                        updateAdjustment(
                          adjustment.id,
                          "amount",
                          event.target.value,
                        )
                      }
                    />
                    <ScheduleDate
                      value={adjustment.effective_date || ""}
                      onChange={(val: string) =>
                        updateAdjustment(
                          adjustment.id,
                          "effective_date",
                          val,
                        )}
                    />
                    <Input
                      placeholder={sourceText("Description *")}
                      value={adjustment.description}
                      onChange={(event) =>
                        updateAdjustment(
                          adjustment.id,
                          "description",
                          event.target.value,
                        )
                      }
                    />
                    <Input
                      placeholder={sourceText("Notes")}
                      value={adjustment.notes}
                      onChange={(event) =>
                        updateAdjustment(
                          adjustment.id,
                          "notes",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              <SourceText source="Payments" leading trailing />
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setInitialPayments((current) => [...current, newPayment()])
              }
            >
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="Record Payment" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {initialPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="No payments recorded yet"
                  leading
                  trailing
                />
              </p>
            ) : (
              initialPayments.map((payment, index) => (
                <div
                  key={payment.id}
                  className="space-y-4 rounded-2xl border p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      <SourceText source="Payment" leading /> #{index + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setInitialPayments((current) =>
                          current.filter((item) => item.id !== payment.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Select
                      value={payment.kind}
                      onValueChange={(value) =>
                        updatePayment(payment.id, "kind", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PayrollPaymentKind.ADVANCE}>
                          {sourceText("Advance")}
                        </SelectItem>
                        <SelectItem value={PayrollPaymentKind.PARTIAL}>
                          {sourceText("Partial Payment")}
                        </SelectItem>
                        <SelectItem value={PayrollPaymentKind.FINAL}>
                          {sourceText("Final Payment")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={sourceText("Amount *")}
                      value={payment.amount}
                      onChange={(event) =>
                        updatePayment(payment.id, "amount", event.target.value)
                      }
                    />
                    <ScheduleDate
                      value={payment.payment_date || ""}
                      onChange={(val: string) =>
                        updatePayment(
                          payment.id,
                          "payment_date",
                          val,
                        )}
                    />
                    <Select
                      value={payment.payment_method || "__none__"}
                      onValueChange={(value) =>
                        updatePayment(
                          payment.id,
                          "payment_method",
                          value === "__none__" ? "" : value,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={sourceText("Select payment method")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {sourceText("None")}
                        </SelectItem>
                        {(paymentMethods || []).map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={sourceText("Reference number")}
                      value={payment.reference_number}
                      onChange={(event) =>
                        updatePayment(
                          payment.id,
                          "reference_number",
                          event.target.value,
                        )
                      }
                    />
                    <Input
                      placeholder={sourceText("Notes")}
                      value={payment.notes}
                      onChange={(event) =>
                        updatePayment(payment.id, "notes", event.target.value)
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/personnel/payroll">
              <X className="me-2 h-4 w-4" />
              <SourceText source="Cancel" leading trailing />
            </Link>
          </Button>
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              (!isDirty &&
                initialAdjustments.length === 0 &&
                initialPayments.length === 0)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Creating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Create Payroll" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
