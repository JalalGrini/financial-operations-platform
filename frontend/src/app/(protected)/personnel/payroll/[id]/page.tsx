"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  User,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  FileCheck,
  MapPin,
  MoreHorizontal,
  Archive,
  RotateCcw,
  Plus,
  Edit,
  Eye,
  Trash2,
  Calculator,
  CheckCircle,
  DollarSign,
  ArrowUpRight,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { Badge } from "@/components/ui/badge";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { SourceText } from "@/components/i18n/SourceText";
import {
  StatusBadge,
  PersonnelAvatar,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import {
  PayrollStatus,
  PayrollPaymentKind,
  ContractType,
} from "@/features/personnel/types";
import { statusLabels } from "@/features/personnel/api";
import { formatDate } from "@/features/personnel/utils/formatters";
import {
  usePayrollDetail,
  useArchivePayroll,
  useRestorePayroll,
  useCalculatePayroll,
  useApprovePayroll,
} from "@/features/personnel/hooks";
import { apiClient } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useExperience } from "@/lib/experience";

function formatPayrollNumber(
  value: number | string | null | undefined,
  locale: "en" | "fr" | "ar",
) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
  ).format(amount);
}

function humanizeEnumValue(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(" ");
}

function adjustmentTypeLabel(value: string) {
  return sourceText(
    statusLabels.payrollAdjustmentType[
      value as keyof typeof statusLabels.payrollAdjustmentType
    ] || humanizeEnumValue(value),
  );
}

function paymentKindLabel(value: string) {
  return sourceText(
    statusLabels.payrollPaymentKind[value as PayrollPaymentKind] ||
      humanizeEnumValue(value),
  );
}

export default function PayrollProfilePage() {
  /*
   * Related Records tab state.
   *
   * The tab strip below used to render both tabs with aria-selected permanently
   * false and onClick={() => {}}, while the Adjustments and Payments panels
   * both rendered at once, separated by a divider. So the tabs were pure
   * decoration: clicking did nothing, and assistive tech was told that neither
   * tab was selected. This state drives both the selected styling and which
   * panel renders.
   */
  const [relatedTab, setRelatedTab] = useState<"adjustments" | "payments">(
    "adjustments",
  );
  const { locale } = useExperience();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const archiveMutation = useArchivePayroll();
  const restoreMutation = useRestorePayroll();
  const calculateMutation = useCalculatePayroll({
    onSuccess: () => {
      toast.success(sourceText("Payroll calculated."));
      refetch();
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to calculate payroll");
    },
  });
  const approveMutation = useApprovePayroll({
    onSuccess: () => {
      toast.success(sourceText("Payroll approved."));
      refetch();
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to approve payroll");
    },
  });
  const { data: payrollData, isLoading, error, refetch } = usePayrollDetail(id);
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, action: null });
  const handleArchive = () => setActionConfirm({ open: true, action: 'archive' });
  const handleRestore = () => setActionConfirm({ open: true, action: 'restore' });
  const handleDelete = () => setActionConfirm({ open: true, action: 'delete' });
  const executeConfirmedAction = async () => {
    const { action } = actionConfirm;
    setActionConfirm({ open: false, action: null });
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id, reason: "Archived from profile" });
        toast.success(sourceText("Payroll archived successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to archive payroll");
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(id);
        toast.success(sourceText("Payroll restored successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to restore payroll");
      }
    } else if (action === 'delete') {
      // Audit fix: wires to the backend's confirmation-gated permanent purge
      // (Administrator-only, refused for approved/paid payrolls by domain guard).
      try {
        await apiClient.delete(`/personnel/payrolls/${id}/permanent/`, { data: { confirm: true } });
        toast.success(sourceText("Payroll record permanently deleted."));
        router.push("/personnel/payroll");
      } catch (error: any) {
        toast.error(
          error?.response?.data?.detail || error?.message || "Failed to delete payroll",
        );
      }
    }
  };
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={sourceText("Payroll Profile")}
          description={sourceText("Loading...")}
        />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={sourceText("Payroll Profile")}
          description={sourceText("Error loading data")}
        />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
          <p className="text-red-600">
            <SourceText source="Failed to load payroll data" />
          </p>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mt-4"
          >
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to List" leading trailing />
          </Button>
        </div>
      </div>
    );
  }
  const payroll = payrollData;
  const isLocked =
    payroll?.status === PayrollStatus.CALCULATED ||
    payroll?.status === PayrollStatus.APPROVED;
  const isArchived = payroll?.status === PayrollStatus.CANCELLED || false;
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
              return sourceText("Payroll");
            },
            href: "/personnel/payroll",
          },
          { label: payroll?.reference || "Loading...", isCurrent: true },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={payroll?.reference || "Payroll Profile"}
        description={`${payroll?.employee_name} • ${payroll?.year}-${payroll?.month ? String(payroll.month).padStart(2, "0") : ""}`}
        action={
          <ExpandingActions actions={[{ permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/payroll/${id}/edit`) }, ...(!isArchived ? [{ permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: handleArchive, variant: "warning" as const }] : [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: handleRestore, variant: "success" as const }])]} />
        }
      />

      {/* Main Info Card */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <SourceText source="Overview" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-6">
              <PersonnelAvatar name={payroll?.employee_name || ""} size="xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-4">
                  <StatusBadge
                    status={payroll?.status || "draft"}
                    variant="payroll"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Reference" />
                    </p>
                    <p className="font-mono text-sm font-medium">
                      {payroll?.reference}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Employee Reference"
                        leading
                        trailing
                      />
                    </p>
                    <p className="font-medium">{payroll?.employee_reference}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Company" />
                    </p>
                    <p className="font-medium">{payroll?.company_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Period" />
                    </p>
                    <p className="font-medium">
                      {payroll?.year}-
                      {payroll?.month?.toString().padStart(2, "0")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Status" />
                    </p>
                    <StatusBadge
                      status={payroll?.status || "draft"}
                      variant="payroll"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Created" />
                    </p>
                    <p className="font-medium">
                      {payroll?.created_at
                        ? formatDate(payroll.created_at)
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Employment Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                <SourceText source="Employment Details" leading trailing />
              </h3>
              <p className="text-sm text-muted-foreground">
                <SourceText source="Employment reference:" leading trailing />
                {payroll?.employee_reference}
              </p>
            </div>

            <Separator />

            {/* Payroll Calculation Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                <SourceText source="Payroll Calculation" leading trailing />
              </h3>
              {payroll && payroll.status !== PayrollStatus.DRAFT ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Gross Salary" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatPayrollNumber(
                          payroll.gross_salary_snapshot,
                          locale,
                        )}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Daily Rate" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatPayrollNumber(payroll.daily_rate, locale)}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText
                          source="Absence Deduction"
                          leading
                          trailing
                        />
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-red-600">
                        {formatPayrollNumber(payroll.absence_deduction, locale)}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Supplements" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-green-600">
                        {formatPayrollNumber(payroll.supplements_total, locale)}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Deductions" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-red-600">
                        {formatPayrollNumber(
                          payroll.other_deductions_total,
                          locale,
                        )}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-800">
                        <SourceText source="Net Salary" />
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-green-800">
                        {formatPayrollNumber(
                          payroll.calculated_net_salary,
                          locale,
                        )}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Attendance Summary */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Scheduled Days" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {payroll.scheduled_working_days}
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Worked Days" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {payroll.worked_days || 0}
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText source="Absence Days" leading trailing />
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-red-600">
                        {payroll.absence_days || 0}
                      </p>
                    </div>
                    <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <SourceText
                          source="Authorized Leave"
                          leading
                          trailing
                        />
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {payroll.authorized_leave_days || 0}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    <SourceText
                      source="Payroll not yet calculated. Use the Calculate action to generate payroll details."
                      leading
                      trailing
                    />
                  </p>
                </div>
              )}
            </div>

            {payroll?.notes && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Notes" />
                  </p>
                  <p className="whitespace-pre-wrap">{payroll.notes}</p>
                </div>
              </>
            )}

            {payroll?.observations && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Observations" />
                  </p>
                  <p className="whitespace-pre-wrap">{payroll.observations}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sidebar - Quick Stats & Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <SourceText source="Summary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Net Salary" />
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPayrollNumber(payroll?.calculated_net_salary, locale)}
                <SourceText source="MAD" leading trailing />
              </p>
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Total Paid" />
              </p>
              <p className="text-2xl font-bold tabular-nums text-blue-600">
                {formatPayrollNumber(payroll?.total_paid, locale)}
                <SourceText source="MAD" leading trailing />
              </p>
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Remaining" />
              </p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">
                {formatPayrollNumber(payroll?.remaining_amount, locale)}
                <SourceText source="MAD" leading trailing />
              </p>
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Payment Status" />
              </p>
              <StatusBadge
                status={payroll?.payment_status || "unpaid"}
                variant="payroll"
              />
            </div>

            <Separator />

            {/* Adjustments Summary */}
            {payroll?.adjustments_total && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  <SourceText source="Adjustments" leading trailing />
                </h4>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-800">
                      <SourceText source="Additions" />
                    </p>
                    <p className="text-lg font-bold text-green-800">
                      {formatPayrollNumber(
                        payroll.adjustments_total.additions,
                        locale,
                      )}{" "}
                      <SourceText source="MAD" leading trailing />
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-800">
                      <SourceText source="Deductions" />
                    </p>
                    <p className="text-lg font-bold text-red-800">
                      {formatPayrollNumber(
                        payroll.adjustments_total.deductions,
                        locale,
                      )}{" "}
                      <SourceText source="MAD" leading trailing />
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-800">
                      <SourceText source="Net Adjustment" />
                    </p>
                    <p className="text-lg font-bold text-blue-800">
                      {formatPayrollNumber(
                        payroll.adjustments_total.net,
                        locale,
                      )}
                      <SourceText source="MAD" leading trailing />
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Quick Actions */}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => router.push(`/personnel/payroll/${id}/edit`)}
                disabled={isLocked || payroll?.status !== PayrollStatus.DRAFT}
              >
                <Edit className="me-2 h-4 w-4" />
                <SourceText source="Edit Payroll" leading trailing />
              </Button>
              {payroll?.status === PayrollStatus.DRAFT && (
                <Button
                  className="w-full"
                  onClick={() => calculateMutation.mutate(id)}
                  disabled={calculateMutation.isPending}
                >
                  <Calculator className="me-2 h-4 w-4" />
                  {calculateMutation.isPending ? "Calculating..." : "Calculate"}
                </Button>
              )}
              {payroll?.status === PayrollStatus.CALCULATED && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => approveMutation.mutate(id)}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="me-2 h-4 w-4" />
                  {approveMutation.isPending ? "Approving..." : "Approve"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for related data */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-lg">
              <SourceText source="Related Records" />
            </CardTitle>
            <div className="flex gap-1 border-b pb-2" role="tablist">
              {(["adjustments", "payments"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  type="button"
                  aria-selected={relatedTab === tab}
                  onClick={() => setRelatedTab(tab)}
                  className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    relatedTab === tab
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "adjustments" && <Calculator className="h-4 w-4" />}
                  {tab === "payments" && <DollarSign className="h-4 w-4" />}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Adjustments */}
          {relatedTab === "adjustments" && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              <SourceText source="Adjustments" leading trailing />
            </h3>
            {payroll?.adjustments && payroll.adjustments.length > 0 ? (
              <>
                <div className="space-y-2">
                  {payroll.adjustments.map((adj: any) => (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              adj.direction === "addition"
                                ? "default"
                                : "destructive"
                            }
                          >
                            {adj.direction === "addition" ? "+" : "-"}
                            {adjustmentTypeLabel(adj.adjustment_type)}
                          </Badge>
                          <Badge variant="outline">
                            {adjustmentTypeLabel(adj.adjustment_type)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {adj.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <SourceText source="Effective:" leading />{" "}
                          {adj.effective_date
                            ? formatDate(adj.effective_date)
                            : "-"}
                        </p>
                      </div>
                      <div className="text-end">
                        <p
                          className={`text-2xl font-bold tabular-nums ${adj.direction === "addition" ? "text-green-600" : "text-red-600"}`}
                        >
                          {adj.direction === "addition" ? "+" : "-"}
                          {formatPayrollNumber(adj.amount, locale)}
                          <SourceText source="MAD" leading trailing />
                        </p>
                        {adj.reference && (
                          <p className="text-xs text-muted-foreground">
                            <SourceText source="Ref:" leading trailing />
                            {adj.reference}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {payroll?.adjustments_total && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-800">
                        <SourceText source="Additions" />
                      </p>
                      <p className="text-xl font-bold text-green-800">
                        {formatPayrollNumber(
                          payroll.adjustments_total.additions,
                          locale,
                        )}{" "}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-red-800">
                        <SourceText source="Deductions" />
                      </p>
                      <p className="text-xl font-bold text-red-800">
                        {formatPayrollNumber(
                          payroll.adjustments_total.deductions,
                          locale,
                        )}{" "}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-800">
                        <SourceText source="Net Adjustment" />
                      </p>
                      <p className="text-xl font-bold text-blue-800">
                        {formatPayrollNumber(
                          payroll.adjustments_total.net,
                          locale,
                        )}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                <SourceText
                  source="No adjustments added yet"
                  leading
                  trailing
                />
              </p>
            )}
          </div>
          )}

          {/* Payments */}
          {relatedTab === "payments" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                <SourceText source="Payments" leading trailing />
              </h3>
            </div>
            {payroll?.payments && payroll.payments.length > 0 ? (
              <>
                <div className="space-y-2">
                  {payroll.payments.map((payment: any) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              payment.payment_kind === "advance"
                                ? "default"
                                : payment.payment_kind === "partial"
                                  ? "secondary"
                                  : "default"
                            }
                          >
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
                          {payment.payment_date
                            ? formatDate(payment.payment_date)
                            : "-"}
                        </p>
                        {payment.reference && (
                          <p className="text-xs text-muted-foreground">
                            <SourceText source="Ref:" leading trailing />
                            {payment.reference}
                          </p>
                        )}
                      </div>
                      <div className="text-end">
                        <p className="text-2xl font-bold tabular-nums text-green-600">
                          {formatPayrollNumber(payment.amount, locale)}
                          <SourceText source="MAD" leading trailing />
                        </p>
                        {payment.notes && (
                          <p className="text-xs text-muted-foreground">
                            {payment.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                <SourceText
                  source="No payments recorded yet"
                  leading
                  trailing
                />
              </p>
            )}

            {/* Payment Summary */}
            {payroll && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Net Salary" />
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {formatPayrollNumber(payroll.calculated_net_salary, locale)}
                    <SourceText source="MAD" leading trailing />
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-800">
                    <SourceText source="Total Paid" />
                  </p>
                  <p className="text-xl font-bold text-blue-800">
                    {formatPayrollNumber(payroll.total_paid, locale)}
                    <SourceText source="MAD" leading trailing />
                  </p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs text-amber-800">
                    <SourceText source="Remaining" />
                  </p>
                  <p className="text-xl font-bold text-amber-800">
                    {formatPayrollNumber(payroll.remaining_amount, locale)}
                    <SourceText source="MAD" leading trailing />
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-800">
                    <SourceText source="Payment Status" />
                  </p>
                  <StatusBadge
                    status={payroll.payment_status || "unpaid"}
                    variant="payroll"
                  />
                </div>
              </div>
            )}
          </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive Payroll") :
          actionConfirm.action === 'restore' ? sourceText("Restore Payroll") :
          sourceText("Delete Payroll")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this payroll record? This action can be reversed.") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this archived payroll record?") :
          sourceText("Permanently delete this payroll record? This cannot be undone.")
        }
        confirmLabel={
          actionConfirm.action === 'archive' ? sourceText("Archive") :
          actionConfirm.action === 'restore' ? sourceText("Restore") :
          sourceText("Delete")
        }
        variant={actionConfirm.action === 'delete' ? "destructive" : "default"}
        isLoading={archiveMutation.isPending || restoreMutation.isPending}
      />
    </div>
  );
}