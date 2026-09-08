"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  Check,
  CheckCircle,
  DollarSign,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  X,
} from "lucide-react";

import { SourceText } from "@/components/i18n/SourceText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { sourceText } from "@/lib/i18n/source-catalog";
import {
  useApprovePayroll,
  useCalculatePayroll,
  useCreateAdjustment,
  usePaymentMethods,
  usePayrollDetail,
  useRecalculatePayroll,
  useRecordAdvance,
  useRecordFinalPayment,
  useRecordPartialPayment,
  useUpdateAdjustment,
  useUpdatePayroll,
} from "@/features/personnel/hooks";
import {
  PayrollAdjustment,
  PayrollAdjustmentDirection,
  PayrollAdjustmentType,
  PayrollPaymentKind,
  PayrollStatus,
} from "@/features/personnel/types";
import { StatusBadge } from "@/features/personnel/components/common";
import { ScheduleDate } from "@/components/ui/schedule-date";
import {
  formatCurrency,
  formatDate,
} from "@/features/personnel/utils/formatters";

const updatePayrollSchema = z.object({
  scheduled_working_days: z.number().int().positive().optional(),
  worked_days: z.number().int().min(0).optional(),
  absence_days: z.number().int().min(0).optional(),
  authorized_leave_days: z.number().int().min(0).optional(),
  unpaid_leave_days: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  observations: z.string().optional(),
});

type UpdatePayrollForm = z.infer<typeof updatePayrollSchema>;
type TabKey = "details" | "adjustments" | "payments";

type AdjustmentDraft = {
  adjustment_type: PayrollAdjustmentType;
  direction: PayrollAdjustmentDirection;
  amount: string;
  effective_date: string;
  description: string;
  notes: string;
};

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const emptyAdjustment = (): AdjustmentDraft => ({
  adjustment_type: PayrollAdjustmentType.SUPPLEMENT,
  direction: PayrollAdjustmentDirection.ADDITION,
  amount: "",
  effective_date: todayInputValue(),
  description: "",
  notes: "",
});

const paymentKindOptions: Array<{ value: PayrollPaymentKind; label: string }> =
  [
    { value: PayrollPaymentKind.ADVANCE, label: sourceText("Advance") },
    { value: PayrollPaymentKind.PARTIAL, label: sourceText("Partial Payment") },
    { value: PayrollPaymentKind.FINAL, label: sourceText("Final Payment") },
  ];

const payrollStatusLabels: Record<string, string> = {
  draft: sourceText("Draft"),
  calculated: sourceText("Calculated"),
  approved: sourceText("Approved"),
  paid: sourceText("Paid"),
  cancelled: sourceText("Cancelled"),
};

const paymentStatusLabels: Record<string, string> = {
  unpaid: sourceText("Unpaid"),
  partial: sourceText("Partial Payment"),
  paid: sourceText("Paid"),
  advance: sourceText("Advance"),
};

const adjustmentTypeOptions: Array<{
  value: PayrollAdjustmentType;
  label: string;
}> = [
  { value: PayrollAdjustmentType.SUPPLEMENT, label: sourceText("Supplement") },
  { value: PayrollAdjustmentType.BONUS, label: sourceText("Bonus") },
  { value: PayrollAdjustmentType.DEDUCTION, label: sourceText("Deduction") },
  { value: PayrollAdjustmentType.PENALTY, label: sourceText("Penalty") },
  {
    value: PayrollAdjustmentType.ADVANCE_RECOVERY,
    label: sourceText("Advance Recovery"),
  },
  { value: PayrollAdjustmentType.CORRECTION, label: sourceText("Correction") },
  { value: PayrollAdjustmentType.OTHER, label: sourceText("Other") },
];

const paymentKindLabel = (kind?: string) => {
  switch (kind) {
    case "advance":
      return sourceText("Advance");
    case "partial_payment":
    case "partial":
      return sourceText("Partial Payment");
    case "final_payment":
    case "final":
      return sourceText("Final Payment");
    case "adjustment":
      return sourceText("Adjustment");
    case "other":
      return sourceText("Other");
    default:
      return kind || sourceText("Payment");
  }
};

const adjustmentTypeLabel = (type?: string) => {
  switch (type) {
    case PayrollAdjustmentType.SUPPLEMENT:
      return sourceText("Supplement");
    case PayrollAdjustmentType.BONUS:
      return sourceText("Bonus");
    case PayrollAdjustmentType.DEDUCTION:
      return sourceText("Deduction");
    case PayrollAdjustmentType.PENALTY:
      return sourceText("Penalty");
    case PayrollAdjustmentType.ADVANCE_RECOVERY:
      return sourceText("Advance Recovery");
    case PayrollAdjustmentType.CORRECTION:
      return sourceText("Correction");
    case PayrollAdjustmentType.OTHER:
      return sourceText("Other");
    default:
      return type || sourceText("Adjustment");
  }
};

function SummaryTile({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
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
              {label}
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

export default function EditPayrollPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const updateMutation = useUpdatePayroll();
  const calculateMutation = useCalculatePayroll();
  const recalculateMutation = useRecalculatePayroll();
  const approveMutation = useApprovePayroll();
  const createAdjustmentMutation = useCreateAdjustment();
  const updateAdjustmentMutation = useUpdateAdjustment();
  const advanceMutation = useRecordAdvance();
  const partialMutation = useRecordPartialPayment();
  const finalMutation = useRecordFinalPayment();

  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dailyRateOverride, setDailyRateOverride] = useState<number | null>(null);
  const [absenceRateOverride, setAbsenceRateOverride] = useState<number | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentKind, setPaymentKind] = useState<PayrollPaymentKind>(
    PayrollPaymentKind.PARTIAL,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => todayInputValue());
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const paymentPanelRef = useRevealOnOpen<HTMLDivElement>(paymentDialogOpen);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustment | null>(null);
  const [adjustmentForm, setAdjustmentForm] =
    useState<AdjustmentDraft>(emptyAdjustment());

  // Both editors render below their lists. `editingAdjustment`/`editingPayment`
  // double as the re-reveal trigger so pressing Edit on a second row while the
  // editor is already open brings it back into view.
  const adjustmentPanelRef = useRevealOnOpen<HTMLDivElement>(
    adjustmentDialogOpen,
    editingAdjustment?.id,
  );

  const { data: payroll, isLoading, error, refetch } = usePayrollDetail(id);
  const { data: paymentMethods } = usePaymentMethods();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdatePayrollForm>({
    resolver: zodResolver(updatePayrollSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (!payroll || isDirty) return;
    reset({
      scheduled_working_days: payroll.scheduled_working_days,
      worked_days: payroll.worked_days ?? 0,
      absence_days: payroll.absence_days ?? 0,
      authorized_leave_days: payroll.authorized_leave_days ?? 0,
      unpaid_leave_days: payroll.unpaid_leave_days ?? 0,
      notes: payroll.notes || "",
      observations: payroll.observations || "",
    });
  }, [payroll, isDirty, reset]);

  const canCalculate = payroll?.status === PayrollStatus.DRAFT;
  const canApprove = payroll?.status === PayrollStatus.CALCULATED;
  // Lock all editable fields once the payroll is Calculated or Approved (HIGH-02)
  const isLocked =
    payroll?.status === PayrollStatus.CALCULATED ||
    payroll?.status === PayrollStatus.APPROVED ||
    payroll?.status === PayrollStatus.PAID;
  const canAdjust =
    payroll?.status === PayrollStatus.DRAFT ||
    payroll?.status === PayrollStatus.CALCULATED;
  const canRecalculate = canAdjust;
  const canRecordPayment =
    payroll?.status === PayrollStatus.APPROVED ||
    payroll?.status === PayrollStatus.CALCULATED ||
    payroll?.status === PayrollStatus.DRAFT;

  const adjustmentNet = useMemo(
    () => payroll?.adjustments_total?.net ?? 0,
    [payroll?.adjustments_total?.net],
  );

  const closePaymentDialog = () => {
    setPaymentDialogOpen(false);
    setPaymentAmount("");
    setPaymentDate(todayInputValue());
    setPaymentMethodId("");
    setPaymentReference("");
    setPaymentNotes("");
  };

  const openPaymentDialog = (kind: PayrollPaymentKind) => {
    setPaymentKind(kind);
    setPaymentDialogOpen(true);
    setActiveTab("payments");
  };

  const openNewAdjustment = () => {
    setEditingAdjustment(null);
    setAdjustmentForm(emptyAdjustment());
    setAdjustmentDialogOpen(true);
    setActiveTab("adjustments");
  };

  const openEditAdjustment = (adjustment: PayrollAdjustment) => {
    setEditingAdjustment(adjustment);
    setAdjustmentForm({
      adjustment_type: adjustment.adjustment_type,
      direction: adjustment.direction,
      amount: String(adjustment.amount ?? ""),
      effective_date: adjustment.effective_date?.split("T")[0] || "",
      description: adjustment.description || "",
      notes: adjustment.notes || "",
    });
    setAdjustmentDialogOpen(true);
    setActiveTab("adjustments");
  };

  const closeAdjustmentDialog = () => {
    setAdjustmentDialogOpen(false);
    setEditingAdjustment(null);
    setAdjustmentForm(emptyAdjustment());
  };

  const onSubmit = async (data: UpdatePayrollForm) => {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({ id, data });
      toast.success(sourceText("Payroll updated successfully"));
      await refetch();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to update payroll"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCalculate = async () => {
    try {
      await calculateMutation.mutateAsync(id);
      toast.success(sourceText("Payroll calculated successfully"));
      await refetch();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to calculate payroll"),
      );
    }
  };

  const handleRecalculate = async () => {
    try {
      await recalculateMutation.mutateAsync({
        id,
        daily_rate_override: dailyRateOverride,
        absence_rate_override: absenceRateOverride,
      });
      toast.success(sourceText("Payroll recalculated successfully"));
      await refetch();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to recalculate payroll"),
      );
    }
  };

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(id);
      toast.success(sourceText("Payroll approved successfully"));
      await refetch();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to approve payroll"),
      );
    }
  };

  const handleSubmitPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error(sourceText("Enter a valid payment amount"));
      return;
    }
    if (!paymentDate) {
      toast.error(sourceText("Enter a payment date"));
      return;
    }

    const payload = {
      amount,
      payment_date: paymentDate,
      payment_method: paymentMethodId || undefined,
      reference_number: paymentReference || undefined,
      notes: paymentNotes || undefined,
    };

    setPaymentSaving(true);
    try {
      if (paymentKind === PayrollPaymentKind.ADVANCE) {
        await advanceMutation.mutateAsync({ payrollId: id, data: payload });
      } else if (paymentKind === PayrollPaymentKind.FINAL) {
        await finalMutation.mutateAsync({ payrollId: id, data: payload });
      } else {
        await partialMutation.mutateAsync({ payrollId: id, data: payload });
      }
      toast.success(sourceText("Payment recorded successfully"));
      closePaymentDialog();
      await refetch();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to record payment"),
      );
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleSubmitAdjustment = async () => {
    const amount = parseFloat(adjustmentForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error(sourceText("Enter a valid adjustment amount"));
      return;
    }
    if (!adjustmentForm.description.trim()) {
      toast.error(sourceText("Adjustment description is required"));
      return;
    }
    if (!adjustmentForm.effective_date) {
      toast.error(sourceText("Effective date is required"));
      return;
    }

    setAdjustmentSaving(true);
    try {
      if (editingAdjustment) {
        await updateAdjustmentMutation.mutateAsync({
          id: editingAdjustment.id,
          data: {
            adjustment_type: adjustmentForm.adjustment_type,
            direction: adjustmentForm.direction,
            amount,
            effective_date: adjustmentForm.effective_date,
            description: adjustmentForm.description,
            notes: adjustmentForm.notes || undefined,
          },
        });
        toast.success(sourceText("Adjustment updated successfully"));
      } else {
        await createAdjustmentMutation.mutateAsync({
          payroll_record: id,
          adjustment_type: adjustmentForm.adjustment_type,
          direction: adjustmentForm.direction,
          amount,
          effective_date: adjustmentForm.effective_date,
          description: adjustmentForm.description,
          notes: adjustmentForm.notes || undefined,
        });
        toast.success(sourceText("Adjustment added successfully"));
      }
      await refetch();
      closeAdjustmentDialog();
    } catch (submitError: any) {
      toast.error(
        submitError?.message || sourceText("Failed to save adjustment"),
      );
    } finally {
      setAdjustmentSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !payroll) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href="/personnel/payroll">
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to List" leading trailing />
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-red-600">
            <SourceText source="Failed to load payroll data" leading trailing />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Personnel"), href: "/personnel" },
          { label: sourceText("Payroll"), href: "/personnel/payroll" },
          { label: payroll.reference, href: `/personnel/payroll/${id}` },
          { label: sourceText("Edit"), isCurrent: true },
        ]}
      />

      <PageHeader
        title={sourceText("Edit Payroll")}
        description={`${payroll.reference} · ${payroll.employee_name}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/personnel/payroll/${id}`}>
                <ArrowLeft className="me-2 h-4 w-4" />
                <SourceText source="Back" leading trailing />
              </Link>
            </Button>
            {canRecalculate && (
              <Button
                variant="outline"
                onClick={handleRecalculate}
                disabled={recalculateMutation.isPending}
              >
                <RefreshCcw className="me-2 h-4 w-4" />
                {recalculateMutation.isPending
                  ? sourceText("Recalculating...")
                  : sourceText("Recalculate")}
              </Button>
            )}
          </div>
        }
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={CheckCircle} label={sourceText("Status")} value={payrollStatusLabels[payroll.status] || payroll.status} tone="primary" />
          <StatCard icon={DollarSign} label={sourceText("Gross Salary")} value={formatCurrency(payroll.gross_salary_snapshot)} tone="indigo" />
          <StatCard icon={Calculator} label={sourceText("Net Salary")} value={formatCurrency(payroll.calculated_net_salary)} tone="emerald" />
          <StatCard icon={FileText} label={sourceText("Remaining")} value={formatCurrency(payroll.remaining_amount)} tone="rose" />
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText("Payroll guidance")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {sourceText(
              "Keep calculations, adjustments and payments consistent",
            )}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sourceText(
              "Update working days, adjustments and payment details on the same page so payroll totals stay auditable and easy to review.",
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              {sourceText(
                "Add adjustments before approval when payroll needs a manual correction.",
              )}
            </li>
            <li>
              {sourceText(
                "Recalculate after changes so the payroll snapshot reflects the latest inputs.",
              )}
            </li>
            <li>
              {sourceText(
                "Record advances, partial payments and final settlement directly from the payments tab.",
              )}
            </li>
          </ul>
        </div>
      </section>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Reference" />
                </p>
                <p className="font-mono text-sm font-medium">
                  {payroll.reference}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Employee" />
                </p>
                <p className="font-medium">{payroll.employee_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Company" />
                </p>
                <p className="font-medium">{payroll.company_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Period" />
                </p>
                <p className="font-medium">
                  {String(payroll.month).padStart(2, "0")}/{payroll.year}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={payroll.status} variant="payroll" />
              {canCalculate && (
                <Button
                  onClick={handleCalculate}
                  disabled={calculateMutation.isPending}
                >
                  <Calculator className="me-2 h-4 w-4" />
                  {calculateMutation.isPending
                    ? sourceText("Calculating...")
                    : sourceText("Calculate")}
                </Button>
              )}
              {canApprove && (
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="me-2 h-4 w-4" />
                  {approveMutation.isPending
                    ? sourceText("Approving...")
                    : sourceText("Approve")}
                </Button>
              )}
              {canRecordPayment && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <DollarSign className="me-2 h-4 w-4" />
                      <SourceText source="Record Payment" leading trailing />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {paymentKindOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => openPaymentDialog(option.value)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Payroll Details" leading trailing />
            </CardTitle>
            <div className="flex flex-wrap gap-2" role="tablist">
              {(
                [
                  ["details", sourceText("Details")],
                  ["adjustments", sourceText("Adjustments")],
                  ["payments", sourceText("Payments")],
                ] as Array<[TabKey, string]>
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={activeTab === key ? "primary" : "outline"}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {activeTab === "details" && (
            <form key={payroll?.id} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {isLocked && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {payroll?.status === PayrollStatus.APPROVED || payroll?.status === PayrollStatus.PAID
                      ? sourceText("This payroll is approved and fully locked.")
                      : sourceText("This payroll is calculated. Approve or reject before editing.")}
                  </span>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="scheduled_working_days">
                    <SourceText
                      source="Scheduled Working Days"
                      leading
                      trailing
                    />
                  </Label>
                  <Input
                    id="scheduled_working_days"
                    type="number"
                    min="1"
                    max="31"
                    disabled={isSubmitting || isLocked}
                    {...register("scheduled_working_days", {
                      valueAsNumber: true,
                    })}
                  />
                  {errors.scheduled_working_days && (
                    <p className="text-sm text-red-600">
                      {errors.scheduled_working_days.message}
                    </p>
                  )}
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
                    disabled={isSubmitting || isLocked}
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
                    disabled={isSubmitting || isLocked}
                    {...register("absence_days", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorized_leave_days">
                    <SourceText
                      source="Authorized Leave Days"
                      leading
                      trailing
                    />
                  </Label>
                  <Input
                    id="authorized_leave_days"
                    type="number"
                    min="0"
                    max="31"
                    disabled={isSubmitting || isLocked}
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
                    disabled={isSubmitting || isLocked}
                    {...register("unpaid_leave_days", { valueAsNumber: true })}
                  />
                </div>
              </div>

              {payroll.status !== PayrollStatus.DRAFT && (
                <>
                  <Separator />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label={sourceText("Gross Salary")}
                      value={formatCurrency(payroll.gross_salary_snapshot)}
                    />
                    <MetricCard
                      label={sourceText("Daily Rate (computed)")}
                      value={formatCurrency(payroll.daily_rate)}
                    />
                    <MetricCard
                      label={sourceText("Absence Deduction (computed)")}
                      value={formatCurrency(payroll.absence_deduction)}
                      tone="danger"
                    />
                    <MetricCard
                      label={sourceText("Net Salary")}
                      value={formatCurrency(payroll.calculated_net_salary)}
                      tone="success"
                    />
                  </div>
                  {["draft", "calculated"].includes(payroll.status) && (
                    <div className="grid gap-4 lg:grid-cols-2 rounded-xl border border-dashed border-border p-4 bg-muted/30">
                      <div className="space-y-1">
                        <Label htmlFor="edit_daily_rate_override" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <SourceText source="Daily Rate Override (optional)" />
                        </Label>
                        <Input
                          id="edit_daily_rate_override"
                          type="number"
                          min="0"
                          step="any"
                          placeholder={sourceText("Auto-computed from gross ÷ working days")}
                          value={dailyRateOverride ?? ""}
                          onChange={(e) => setDailyRateOverride(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                        <p className="text-xs text-muted-foreground">
                          <SourceText source="Override the per-day rate for worked days." />
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit_absence_rate_override" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <SourceText source="Absence/Leave Deduction Rate (optional)" />
                        </Label>
                        <Input
                          id="edit_absence_rate_override"
                          type="number"
                          min="0"
                          step="any"
                          placeholder={sourceText("Defaults to worked-day rate if blank")}
                          value={absenceRateOverride ?? ""}
                          onChange={(e) => setAbsenceRateOverride(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                        <p className="text-xs text-muted-foreground">
                          <SourceText source="Set a separate per-day deduction for absence and unpaid leave." />
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

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
                    disabled={isSubmitting || isLocked}
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
                    disabled={isSubmitting || isLocked}
                    {...register("observations")}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  <X className="me-2 h-4 w-4" />
                  <SourceText source="Cancel" leading trailing />
                </Button>
                <Button type="submit" disabled={isSubmitting || !isDirty || isLocked}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      <SourceText source="Updating..." leading trailing />
                    </>
                  ) : (
                    <>
                      <Check className="me-2 h-4 w-4" />
                      <SourceText source="Update Payroll" leading trailing />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {activeTab === "adjustments" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">
                    <SourceText source="Adjustments" leading trailing />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <SourceText
                      source="Add or edit the amounts used in the payroll calculation."
                      leading
                      trailing
                    />
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRecalculate}
                    disabled={!canRecalculate || recalculateMutation.isPending}
                  >
                    <RefreshCcw className="me-2 h-4 w-4" />
                    <SourceText source="Recalculate" leading trailing />
                  </Button>
                  <Button
                    type="button"
                    onClick={openNewAdjustment}
                    disabled={!canAdjust}
                  >
                    <Plus className="me-2 h-4 w-4" />
                    <SourceText source="Add Adjustment" leading trailing />
                  </Button>
                </div>
              </div>

              {adjustmentDialogOpen && (
                <Card
                  ref={adjustmentPanelRef}
                  className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
                >
                  <CardContent className="space-y-4 p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold">
                          {editingAdjustment ? (
                            <SourceText
                              source="Edit Adjustment"
                              leading
                              trailing
                            />
                          ) : (
                            <SourceText
                              source="Add Adjustment"
                              leading
                              trailing
                            />
                          )}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          <SourceText
                            source="Enter the amount, its direction, and the effective date directly on the page."
                            leading
                            trailing
                          />
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closeAdjustmentDialog}
                      >
                        <SourceText source="Close" leading trailing />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>
                          <SourceText source="Type" />
                        </Label>
                        <Select
                          value={adjustmentForm.adjustment_type}
                          onValueChange={(value) =>
                            setAdjustmentForm((current) => ({
                              ...current,
                              adjustment_type: value as PayrollAdjustmentType,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {adjustmentTypeOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>
                          <SourceText source="Direction" />
                        </Label>
                        <Select
                          value={adjustmentForm.direction}
                          onValueChange={(value) =>
                            setAdjustmentForm((current) => ({
                              ...current,
                              direction: value as PayrollAdjustmentDirection,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value={PayrollAdjustmentDirection.ADDITION}
                            >
                              {sourceText("Addition")}
                            </SelectItem>
                            <SelectItem
                              value={PayrollAdjustmentDirection.DEDUCTION}
                            >
                              {sourceText("Deduction")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="adjustment_amount">
                          <SourceText source="Amount" leading trailing />*
                        </Label>
                        <Input
                          id="adjustment_amount"
                          type="number"
                          min="0"
                          step="any"
                          value={adjustmentForm.amount}
                          onChange={(event) =>
                            setAdjustmentForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adjustment_effective_date">
                          <SourceText source="Effective date *" />
                        </Label>
                        <ScheduleDate
                          id="adjustment_effective_date"
                          value={adjustmentForm.effective_date || ""}
                          onChange={(val: string) =>
                            setAdjustmentForm((current) => ({
                              ...current,
                              effective_date: val,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjustment_description">
                        <SourceText source="Description *" />
                      </Label>
                      <Input
                        id="adjustment_description"
                        value={adjustmentForm.description}
                        onChange={(event) =>
                          setAdjustmentForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjustment_notes">
                        <SourceText source="Notes" />
                      </Label>
                      <Input
                        id="adjustment_notes"
                        value={adjustmentForm.notes}
                        onChange={(event) =>
                          setAdjustmentForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closeAdjustmentDialog}
                      >
                        <SourceText source="Cancel" leading trailing />
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmitAdjustment}
                        disabled={adjustmentSaving}
                      >
                        {adjustmentSaving ? (
                          <>
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            <SourceText source="Saving..." leading trailing />
                          </>
                        ) : editingAdjustment ? (
                          <SourceText source="Save changes" leading trailing />
                        ) : (
                          <SourceText
                            source="Add Adjustment"
                            leading
                            trailing
                          />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {payroll.adjustments?.length ? (
                <div className="space-y-3">
                  {payroll.adjustments.map((adjustment) => (
                    <div
                      key={adjustment.id}
                      className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-4"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              adjustment.direction ===
                              PayrollAdjustmentDirection.ADDITION
                                ? "default"
                                : "destructive"
                            }
                          >
                            {adjustment.direction ===
                            PayrollAdjustmentDirection.ADDITION
                              ? sourceText("Addition")
                              : sourceText("Deduction")}
                          </Badge>
                          <Badge variant="outline">
                            {adjustmentTypeLabel(adjustment.adjustment_type)}
                          </Badge>
                        </div>
                        <p className="font-medium">{adjustment.description}</p>
                        <div className="text-sm text-muted-foreground">
                          <span>{formatDate(adjustment.effective_date)}</span>
                          {adjustment.notes ? (
                            <span> · {adjustment.notes}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="text-end">
                          <p
                            className={`text-lg font-semibold ${
                              adjustment.direction ===
                              PayrollAdjustmentDirection.ADDITION
                                ? "text-green-700"
                                : "text-red-700"
                            }`}
                          >
                            {adjustment.direction ===
                            PayrollAdjustmentDirection.ADDITION
                              ? "+"
                              : "-"}
                            {formatCurrency(adjustment.amount)}
                          </p>
                          {adjustment.reference ? (
                            <p className="text-xs text-muted-foreground">
                              <SourceText source="Ref:" leading trailing />
                              {adjustment.reference}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditAdjustment(adjustment)}
                          disabled={!canAdjust}
                        >
                          <Pencil className="me-2 h-4 w-4" />
                          <SourceText source="Edit" leading trailing />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={sourceText("No adjustments added yet")} />
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  label={sourceText("Additions")}
                  value={formatCurrency(
                    payroll.adjustments_total?.additions ?? 0,
                  )}
                  tone="success"
                />
                <MetricCard
                  label={sourceText("Deductions")}
                  value={formatCurrency(
                    payroll.adjustments_total?.deductions ?? 0,
                  )}
                  tone="danger"
                />
                <MetricCard
                  label={sourceText("Net Adjustment")}
                  value={formatCurrency(adjustmentNet)}
                />
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">
                    <SourceText source="Payments" leading trailing />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <SourceText
                      source="Record advances, partial payments, or final payments."
                      leading
                      trailing
                    />
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canRecordPayment}
                    >
                      <Plus className="me-2 h-4 w-4" />
                      <SourceText source="Record Payment" leading trailing />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {paymentKindOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => openPaymentDialog(option.value)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {paymentDialogOpen && (
                <Card
                  ref={paymentPanelRef}
                  className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
                >
                  <CardContent className="space-y-4 p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold">
                          {sourceText("Record payment")}
                          {": "}
                          {paymentKindLabel(paymentKind)}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          <SourceText
                            source="Enter the payment details directly on the page and save them without opening a popup."
                            leading
                            trailing
                          />
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closePaymentDialog}
                      >
                        <SourceText source="Close" leading trailing />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="payment_amount">
                          <SourceText source="Amount" leading trailing />*
                        </Label>
                        <Input
                          id="payment_amount"
                          type="number"
                          min="0"
                          step="any"
                          value={paymentAmount}
                          onChange={(event) =>
                            setPaymentAmount(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_date">
                          <SourceText source="Payment date *" />
                        </Label>
                        <ScheduleDate
                          id="payment_date"
                          value={paymentDate || ""}
                          onChange={(val: string) =>
                            setPaymentDate(val)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="payment_method_select">
                          <SourceText source="Payment method" />
                        </Label>
                        <Select
                          value={paymentMethodId || "__none__"}
                          onValueChange={(value) =>
                            setPaymentMethodId(
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
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_reference">
                          <SourceText source="Reference number" />
                        </Label>
                        <Input
                          id="payment_reference"
                          value={paymentReference}
                          onChange={(event) =>
                            setPaymentReference(event.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payment_notes">
                        <SourceText source="Notes" />
                      </Label>
                      <Input
                        id="payment_notes"
                        value={paymentNotes}
                        onChange={(event) =>
                          setPaymentNotes(event.target.value)
                        }
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closePaymentDialog}
                      >
                        <SourceText source="Cancel" leading trailing />
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmitPayment}
                        disabled={paymentSaving}
                      >
                        {paymentSaving ? (
                          <>
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            <SourceText source="Saving..." leading trailing />
                          </>
                        ) : (
                          <SourceText
                            source="Record payment"
                            leading
                            trailing
                          />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {payroll.payments?.length ? (
                <div className="space-y-3">
                  {payroll.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">
                            {paymentKindLabel(payment.payment_kind)}
                          </Badge>
                          <Badge variant="outline">
                            {payment.payment_method_name ||
                              payment.payment_method ||
                              sourceText("None")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <SourceText source="Date:" leading />{" "}
                          {formatDate(payment.payment_date)}
                        </p>
                        {payment.reference ? (
                          <p className="text-xs text-muted-foreground">
                            <SourceText source="Ref:" leading trailing />
                            {payment.reference}
                          </p>
                        ) : null}
                        {payment.notes ? (
                          <p className="text-sm text-muted-foreground">
                            {payment.notes}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-lg font-semibold text-green-700">
                        {formatCurrency(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={sourceText("No payments recorded yet")} />
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  label={sourceText("Net Salary")}
                  value={formatCurrency(payroll.calculated_net_salary)}
                />
                <MetricCard
                  label={sourceText("Total Paid")}
                  value={formatCurrency(payroll.total_paid)}
                  tone="success"
                />
                <MetricCard
                  label={sourceText("Remaining")}
                  value={formatCurrency(payroll.remaining_amount)}
                  tone="warning"
                />
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Payment Status" />
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={payroll.payment_status || "unpaid"}
                      variant="payroll"
                    />
                    <span className="text-sm text-muted-foreground">
                      {paymentStatusLabels[
                        payroll.payment_status || "unpaid"
                      ] ||
                        payroll.payment_status ||
                        sourceText("Unpaid")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
