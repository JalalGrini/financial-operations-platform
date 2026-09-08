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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { Badge } from "@/components/ui/badge";
import {
  StatusBadge,
  PersonnelAvatar,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { SourceText } from "@/components/i18n/SourceText";
import { statusLabels } from "@/features/personnel/api";
import { employmentPayoutLabel } from "@/features/personnel/components/EmploymentPayoutFields";
import { companyDisplayName } from "@/lib/company-scope";
import { EmploymentStatus, ContractType } from "@/features/personnel/types";
import { formatDate } from "@/features/personnel/utils/formatters";
import { useExperience } from "@/lib/experience";
import {
  useEmploymentDetail,
  useArchiveEmployment,
  useRestoreEmployment,
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

function formatEmploymentNumber(
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

function cnssSituationLabel(value: string) {
  return sourceText(
    statusLabels.cnssSituation[value as keyof typeof statusLabels.cnssSituation] ||
      humanizeEnumValue(value),
  );
}

export default function EmploymentProfilePage() {
  const { locale } = useExperience();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const archiveMutation = useArchiveEmployment();
  const restoreMutation = useRestoreEmployment();
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, action: null });
  const {
    data: employmentData,
    isLoading,
    error,
    refetch,
  } = useEmploymentDetail(id);
  const handleArchive = () => setActionConfirm({ open: true, action: 'archive' });
  const handleRestore = () => setActionConfirm({ open: true, action: 'restore' });
  const handleDelete = () => setActionConfirm({ open: true, action: 'delete' });
  const executeConfirmedAction = async () => {
    const { action } = actionConfirm;
    setActionConfirm({ open: false, action: null });
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id, reason: "Archived from profile" });
        toast.success(sourceText("Employment archived successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to archive employment");
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(id);
        toast.success(sourceText("Employment restored successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to restore employment");
      }
    } else if (action === 'delete') {
      // Audit fix: wires to the backend's confirmation-gated permanent purge
      // (Administrator-only; plain archive remains the reversible option).
      try {
        await apiClient.delete(`/personnel/employments/${id}/permanent/`, { data: { confirm: true } });
        toast.success(sourceText("Employment permanently deleted."));
        router.push("/personnel/employments");
      } catch (error: any) {
        toast.error(
          error?.response?.data?.detail || error?.message || "Failed to delete employment",
        );
      }
    }
  };
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={sourceText("Employment Profile")}
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
          title={sourceText("Employment Profile")}
          description={sourceText("Error loading data")}
        />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
          <p className="text-red-600">
            <SourceText source="Failed to load employment data" />
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
  const employment = employmentData;
  const isArchived =
    employment?.employment_status === EmploymentStatus.FORMER ||
    employment?.employment_status === EmploymentStatus.RESIGNED ||
    employment?.employment_status === EmploymentStatus.TERMINATED ||
    employment?.employment_status === EmploymentStatus.RETIRED;
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
          { label: employment?.person_name || "Loading...", isCurrent: true },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={employment?.person_name || "Employment Profile"}
        description={`${employment?.reference} • ${employment?.job_title || "No title"} • ${companyDisplayName(employment?.company_name, sourceText("Tout le groupe"))}`}
        action={
          <ExpandingActions actions={[{ permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/employments/${id}/edit`) }, ...(!isArchived ? [{ permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: handleArchive, variant: "warning" as const }] : [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: handleRestore, variant: "success" as const }]), { permission: "delete" as const, label: "Delete", icon: <Trash2 size={14} />, onClick: handleDelete, variant: "danger" as const }]} />
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
              <PersonnelAvatar name={employment?.person_name || ""} size="xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-4">
                  <StatusBadge
                    status={employment?.employment_status || "active"}
                    variant="employment"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Reference" />
                    </p>
                    <p className="font-mono text-sm font-medium">
                      {employment?.reference}
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
                    <p className="font-medium">
                      {employment?.employee_reference}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Company" />
                    </p>
                    <p className="font-medium">{companyDisplayName(employment?.company_name, sourceText("Tout le groupe"))}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Hire Date" />
                    </p>
                    <p className="font-medium">
                      {employment?.hire_date
                        ? formatDate(employment.hire_date)
                        : "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Contract Type" leading trailing />
                    </p>
                    <p className="font-medium capitalize">
                      {employment?.contract_type?.replace("_", " ")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Created" />
                    </p>
                    <p className="font-medium">
                      {employment?.created_at
                        ? formatDate(employment.created_at)
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Job Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                <SourceText source="Job Details" leading trailing />
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Job Title" />
                  </p>
                  <p className="font-medium">{employment?.job_title || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Department" />
                  </p>
                  <p className="font-medium">{employment?.department || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Work Domain" />
                  </p>
                  <p className="font-medium">
                    {employment?.work_domain || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Work City" />
                  </p>
                  <p className="font-medium">{employment?.work_city || "-"}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Contract Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <SourceText source="Contract Details" leading trailing />
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Contract Type" />
                  </p>
                  <p className="font-medium capitalize">
                    {employment?.contract_type?.replace("_", " ")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Employment Status" leading trailing />
                  </p>
                  <StatusBadge
                    status={employment?.employment_status || "active"}
                    variant="employment"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Hire Date" />
                  </p>
                  <p className="font-medium">
                    {employment?.hire_date
                      ? formatDate(employment.hire_date)
                      : "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="End Date" />
                  </p>
                  <p className="font-medium">
                    {employment?.employment_end_date
                      ? formatDate(employment.employment_end_date)
                      : "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText
                      source="Default Working Days"
                      leading
                      trailing
                    />
                  </p>
                  <p className="font-medium">
                    {employment?.default_monthly_working_days || 26}
                  </p>
                </div>
                {/* Day pricing is shown even when unset, so it is obvious whether
                    payroll is using a configured rate or deriving one. */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Worked-day rate" leading trailing />
                  </p>
                  <p className="font-medium">
                    {employment?.worked_day_rate != null
                      ? employment.worked_day_rate
                      : sourceText("Auto (gross / working days)")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Absence-day rate" leading trailing />
                  </p>
                  <p className="font-medium">
                    {employment?.absence_day_rate != null
                      ? employment.absence_day_rate
                      : sourceText("Same as worked-day rate")}
                  </p>
                </div>
                {employment?.departure_reason && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Departure Reason" leading trailing />
                    </p>
                    <p className="font-medium capitalize">
                      {employment.departure_reason?.replace("_", " ")}
                    </p>
                  </div>
                )}
                {employment?.resignation_date && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Resignation Date" leading trailing />
                    </p>
                    <p className="font-medium">
                      {formatDate(employment.resignation_date)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Payment & Banking */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <SourceText source="Payment & Banking" leading trailing />
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Payment Method" leading trailing />
                  </p>
                  <p className="font-medium">
                    {employmentPayoutLabel(employment?.payout_method, employment?.rib)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="RIB / IBAN" />
                  </p>
                  <p className="font-medium font-mono text-sm">
                    {employment?.rib || "-"}
                  </p>
                </div>
              </div>
            </div>

            {employment?.observations && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Observations" />
                  </p>
                  <p className="whitespace-pre-wrap">
                    {employment.observations}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sidebar - Quick Stats & Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <SourceText source="Quick Actions" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Current Salary" />
              </p>
              {employment?.current_salary ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold tabular-nums">
                    {formatEmploymentNumber(
                      employment.current_salary.fixed_monthly_gross_salary,
                      locale,
                    )}{" "}
                    <SourceText source="MAD" leading trailing />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Effective from" leading />{" "}
                    {employment.current_salary.effective_from
                      ? formatDate(employment.current_salary.effective_from)
                      : "-"}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  <SourceText source="No active salary" />
                </p>
              )}
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="CNSS Status" />
              </p>
              {employment?.cnss_declarations &&
              employment.cnss_declarations.length > 0 ? (
                <StatusBadge
                  status={employment.cnss_declarations[0].situation}
                  variant="cnssSituation"
                  showDot
                />
              ) : (
                <StatusBadge
                  status="NOT_DECLARED"
                  variant="cnssSituation"
                  showDot
                />
              )}
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Active Payrolls" />
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {employment?.payroll_records?.length || 0}
              </p>
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Salaries */}
            <div>
              <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <SourceText source="Salary History" leading trailing />
              </h4>
              {employment?.salaries && employment.salaries.length > 0 ? (
                <div className="space-y-2">
                  {employment.salaries.map((salary: any) => (
                    <div
                      key={salary.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">
                          {formatEmploymentNumber(
                            salary.fixed_monthly_gross_salary,
                            locale,
                          )}{" "}
                          <SourceText source="MAD/month" leading trailing />
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <SourceText source="Effective:" leading />{" "}
                          {salary.effective_from
                            ? formatDate(salary.effective_from)
                            : "-"}
                          {salary.effective_to
                            ? ` to ${formatDate(salary.effective_to)}`
                            : " - Present"}
                        </p>
                      </div>
                      {salary.is_current && (
                        <Badge
                          variant="default"
                          className="bg-green-100 text-green-800"
                        >
                          <SourceText source="Current" leading trailing />
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <SourceText
                    source="No salary records found"
                    leading
                    trailing
                  />
                </p>
              )}
            </div>

            <Separator />

            {/* Payroll Records */}
            <div>
              <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <SourceText source="Payroll Records" leading trailing />
              </h4>
              {employment?.payroll_records &&
              employment.payroll_records.length > 0 ? (
                <div className="space-y-2">
                  {employment.payroll_records.map((payroll: any) => (
                    <div
                      key={payroll.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">
                          {payroll.reference} -{" "}
                          {payroll.payroll_month ||
                            `${payroll.year}-${payroll.month}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <SourceText source="Net:" leading trailing />
                          {formatEmploymentNumber(
                            payroll.calculated_net_salary,
                            locale,
                          )}{" "}
                          <SourceText source="MAD | Paid:" leading trailing />
                          {formatEmploymentNumber(payroll.total_paid, locale)}
                          <SourceText source="MAD | Remaining:" leading />{" "}
                          {formatEmploymentNumber(
                            payroll.remaining_amount,
                            locale,
                          )}
                          <SourceText source="MAD" leading trailing />
                        </p>
                      </div>
                      <StatusBadge status={payroll.status} variant="payroll" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <SourceText
                    source="No payroll records found"
                    leading
                    trailing
                  />
                </p>
              )}
            </div>

            <Separator />

            {/* CNSS Declarations */}
            <div>
              <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                <SourceText source="CNSS Declarations" leading trailing />
              </h4>
              {employment?.cnss_declarations &&
              employment.cnss_declarations.length > 0 ? (
                <div className="space-y-2">
                  {employment.cnss_declarations.map((cnss: any) => (
                    <div
                      key={cnss.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{cnss.reference}</p>
                        <p className="text-sm text-muted-foreground">
                          <SourceText source="CNSS #:" leading trailing />
                          {cnss.cnss_registration_number}
                          <SourceText source="| Situation:" leading />{" "}
                          {cnssSituationLabel(cnss.situation)}
                        </p>
                      </div>
                      <StatusBadge
                        status={cnss.current_declaration_state}
                        variant="cnssMonthlySituation"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <SourceText
                    source="No CNSS declarations found"
                    leading
                    trailing
                  />
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive Employment") :
          actionConfirm.action === 'restore' ? sourceText("Restore Employment") :
          sourceText("Delete Employment")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this employment record? This action can be reversed.") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this archived employment record?") :
          sourceText("Permanently delete this employment? This cannot be undone and is refused if other records reference it.")
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