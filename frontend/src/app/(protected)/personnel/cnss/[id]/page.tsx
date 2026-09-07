"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useState, useEffect } from "react";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
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
  AlertTriangle,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  StatusBadge,
  PersonnelAvatar,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import {
  CNSSSituation,
  CNSSStopReason,
  CNSSMonthlySituation,
} from "@/features/personnel/types";
import { formatDate } from "@/features/personnel/utils/formatters";
import {
  useCNSSDeclarationDetail,
  useArchiveCNSSDeclaration,
  useRestoreCNSSDeclaration,
  useStopCNSSDeclaration,
  useRestartCNSSDeclaration,
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
import { ScheduleDate } from "@/components/ui/schedule-date";

function formatCnssNumber(
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

function cnssStopReasonLabel(reason: CNSSStopReason) {
  switch (reason) {
    case CNSSStopReason.RESIGNATION:
      return sourceText("Resignation");
    case CNSSStopReason.TERMINATION:
      return sourceText("Termination");
    case CNSSStopReason.RETIREMENT:
      return sourceText("Retirement");
    case CNSSStopReason.DEATH:
      return sourceText("Death");
    case CNSSStopReason.COMPANY_CLOSURE:
      return sourceText("Company Closure");
    case CNSSStopReason.CONTRACT_END:
      return sourceText("Contract End");
    case CNSSStopReason.MUTUAL_AGREEMENT:
      return sourceText("Mutual Agreement");
    case CNSSStopReason.SUSPENSION:
      return sourceText("Suspension");
    case CNSSStopReason.OTHER:
      return sourceText("Other");
    default:
      return sourceText(humanizeEnumValue(reason));
  }
}

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CNSSDeclarationProfilePage() {
  const { locale } = useExperience();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const archiveMutation = useArchiveCNSSDeclaration();
  const restoreMutation = useRestoreCNSSDeclaration();
  const stopMutation = useStopCNSSDeclaration();
  const restartMutation = useRestartCNSSDeclaration();
  const today = todayInputValue();
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, action: null });
  const [stopOpen, setStopOpen] = useState(false);
  const [stopDate, setStopDate] = useState(today);
  const [stopReason, setStopReason] = useState<CNSSStopReason>(
    CNSSStopReason.RESIGNATION,
  );
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartDate, setRestartDate] = useState(today);
  const [actionError, setActionError] = useState<string | null>(null);

  // Both panels render below the declaration detail, so the buttons that open
  // them are off-screen by the time the panel appears.
  const stopPanelRef = useRevealOnOpen<HTMLDivElement>(stopOpen);
  const restartPanelRef = useRevealOnOpen<HTMLDivElement>(restartOpen);
  const {
    data: cnssData,
    isLoading,
    error,
    refetch,
  } = useCNSSDeclarationDetail(id);
  const handleArchive = () => setActionConfirm({ open: true, action: 'archive' });
  const handleRestore = () => setActionConfirm({ open: true, action: 'restore' });
  const executeConfirmedAction = async () => {
    const { action } = actionConfirm;
    setActionConfirm({ open: false, action: null });
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id, reason: sourceText("Archived from profile") });
        toast.success(sourceText("CNSS declaration archived successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || sourceText("Failed to archive CNSS declaration"));
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(id);
        toast.success(sourceText("CNSS declaration restored successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || sourceText("Failed to restore CNSS declaration"));
      }
    } else if (action === 'delete') {
      try {
        await apiClient.delete(`/personnel/cnss/${id}/permanent/`, { data: { confirm: true } });
        toast.success(sourceText("CNSS declaration permanently deleted."));
        router.push("/personnel/cnss");
      } catch (error: any) {
        toast.error(
          error?.response?.data?.detail || error?.message || sourceText("Failed to delete CNSS declaration"),
        );
      }
    }
  };
  const handleStop = async () => {
    setActionError(null);
    if (!stopDate) return setActionError(sourceText("Stop date is required."));
    if (!Object.values(CNSSStopReason).includes(stopReason))
      return setActionError(sourceText("Select a valid stop reason."));
    try {
      await stopMutation.mutateAsync({
        id,
        data: { stop_reason: stopReason, stop_date: stopDate },
      });
      toast.success(sourceText("CNSS declaration stopped successfully"));
      setStopOpen(false);
      await refetch();
    } catch (error: any) {
      const message =
        error?.message || sourceText("Failed to stop CNSS declaration");
      setActionError(message);
      toast.error(message);
    }
  };
  const handleRestart = async () => {
    setActionError(null);
    if (!restartDate)
      return setActionError(sourceText("Restart date is required."));
    try {
      await restartMutation.mutateAsync({
        id,
        data: { restart_date: restartDate },
      });
      toast.success(sourceText("CNSS declaration restarted successfully"));
      setRestartOpen(false);
      await refetch();
    } catch (error: any) {
      const message =
        error?.message || sourceText("Failed to restart CNSS declaration");
      setActionError(message);
      toast.error(message);
    }
  };
  const handleDelete = () => setActionConfirm({ open: true, action: 'delete' });
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={sourceText("CNSS Declaration Profile")}
          description={sourceText("Loading…")}
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
          title={sourceText("CNSS Declaration Profile")}
          description={sourceText("Error loading data")}
        />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
          <p className="text-red-600">
            <SourceText source="Failed to load CNSS declaration" />
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
  const cnss = cnssData;
  const isArchived = cnss?.situation === CNSSSituation.STOPPED || false;
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
              return sourceText("CNSS Declarations");
            },
            href: "/personnel/cnss",
          },
          {
            label: cnss?.person_name || sourceText("Loading…"),
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={cnss?.person_name || sourceText("CNSS Declaration Profile")}
        description={`${sourceText("Reference")}: ${cnss?.reference} • ${cnss?.cnss_registration_number || sourceText("No CNSS #")}`}
        action={
          <ExpandingActions actions={[{ permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/cnss/${id}/edit`) }, ...(cnss?.situation !== CNSSSituation.STOPPED ? [{ permission: "write" as const, label: "Stop", icon: <AlertTriangle size={14} />, onClick: () => { setActionError(null); setStopDate(today); setStopReason(CNSSStopReason.RESIGNATION); setStopOpen(true); }, variant: "warning" as const }] : [{ permission: "write" as const, label: "Restart", icon: <RotateCcw size={14} />, onClick: () => { setActionError(null); setRestartDate(today); setRestartOpen(true); }, variant: "success" as const }])]} />
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
              <PersonnelAvatar
                name={cnss?.person_name || ""}
                email={cnss?.person_email}
                size="xl"
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-4">
                  <StatusBadge
                    status={cnss?.situation || "not_declared"}
                    variant="cnssSituation"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Reference" />
                    </p>
                    <p className="font-mono text-sm font-medium">
                      {cnss?.reference}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="CNSS Registration #"
                        leading
                        trailing
                      />
                    </p>
                    <p className="font-mono text-sm font-medium">
                      {cnss?.cnss_registration_number || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Person" />
                    </p>
                    <p className="font-medium">{cnss?.person_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Company" />
                    </p>
                    <p className="font-medium">{cnss?.company_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Situation" />
                    </p>
                    <StatusBadge
                      status={cnss?.situation || "not_declared"}
                      variant="cnssSituation"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Current State" leading trailing />
                    </p>
                    <StatusBadge
                      status={cnss?.current_declaration_state || "draft"}
                      variant="cnssMonthlySituation"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="First Declaration" leading trailing />
                    </p>
                    <p className="font-medium">
                      {cnss?.first_declaration_date
                        ? formatDate(cnss.first_declaration_date)
                        : "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Declaration Start" leading trailing />
                    </p>
                    <p className="font-medium">
                      {cnss?.declaration_start_date
                        ? formatDate(cnss.declaration_start_date)
                        : "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Created" />
                    </p>
                    <p className="font-medium">
                      {cnss?.created_at ? formatDate(cnss.created_at) : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Person" />
                  </p>
                  <p>
                    {cnss?.person_name || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Company" />
                  </p>
                  <p>{cnss?.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="First Declaration" leading trailing />
                  </p>
                  <p>
                    {cnss?.first_declaration_date ? (
                      formatDate(cnss.first_declaration_date)
                    ) : (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Declaration Start" leading trailing />
                  </p>
                  <p>
                    {cnss?.declaration_start_date ? (
                      formatDate(cnss.declaration_start_date)
                    ) : (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Declaration Stop" leading trailing />
                  </p>
                  <p>
                    {cnss?.declaration_stop_date ? (
                      formatDate(cnss.declaration_stop_date)
                    ) : (
                      <span className="text-muted-foreground">
                        <SourceText source="Not stopped" />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Resignation Date" leading trailing />
                  </p>
                  <p>
                    {cnss?.resignation_date ? (
                      formatDate(cnss.resignation_date)
                    ) : (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Stop Reason" />
                  </p>
                  <p className="capitalize">
                    {cnss?.stop_reason || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Employment" />
                  </p>
                  <p>
                    {cnss?.employment_reference ? (
                      <Link
                        href={`/personnel/employments/${cnss.employment}`}
                        className="text-primary hover:underline"
                      >
                        {cnss.employment_reference}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        <SourceText source="Not linked" />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <FileCheck className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="CNSS Registration" leading trailing />
                  </p>
                  <p className="font-mono">
                    {cnss?.cnss_registration_number || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar - Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <SourceText source="Quick Stats" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText
                  source="CNSS Monthly Declarations"
                  leading
                  trailing
                />
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {cnss?.monthly_declarations?.length || 0}
              </p>
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Current State" />
              </p>
              <StatusBadge
                status={cnss?.current_declaration_state || "draft"}
                variant="cnssMonthlySituation"
              />
            </div>
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Active Declarations" leading trailing />
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {cnss?.monthly_declarations?.filter(
                  (m: any) => m.status !== "cancelled",
                ).length || 0}
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
          {/* Monthly CNSS Declarations */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              <SourceText source="Monthly CNSS Declarations" leading trailing />
            </h3>
            {cnss?.monthly_declarations &&
            cnss.monthly_declarations.length > 0 ? (
              <div className="space-y-2">
                {cnss.monthly_declarations.map((monthly: any) => (
                  <div
                    key={monthly.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {monthly.year}-
                        {monthly.month.toString().padStart(2, "0")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <SourceText source="Days:" leading trailing />
                        {monthly.declared_days}
                        <SourceText source="| Salary:" leading />{" "}
                        {formatCnssNumber(monthly.declared_salary, locale)}
                        <SourceText source="MAD" leading trailing />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={monthly.situation}
                        variant="cnssMonthlySituation"
                        showDot
                      />
                      <StatusBadge
                        status={monthly.status}
                        variant="cnssMonthly"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                <SourceText
                  source="No monthly CNSS declarations found"
                  leading
                  trailing
                />
              </p>
            )}
          </div>

          <Separator />

          {/* Documents */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <SourceText source="Documents" leading trailing />
            </h3>
            {cnss?.documents && cnss.documents.length > 0 ? (
              <div className="space-y-2">
                {cnss.documents.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.document_type} •{" "}
                        {doc.document_date
                          ? formatDate(doc.document_date)
                          : sourceText("No date")}
                      </p>
                    </div>
                    <Badge variant="outline">{doc.document_type}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                <SourceText source="No documents found" leading trailing />
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {stopOpen && (
        <Card
          ref={stopPanelRef}
          className="scroll-mt-24 border-amber-200 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Stop CNSS declaration" />
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setStopOpen(false)}
              disabled={stopMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <p className="text-sm text-muted-foreground">
              <SourceText
                source="Record the effective date and regulated stop reason. Both are kept in the declaration history."
                leading
                trailing
              />
            </p>
            {actionError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {actionError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Stop date *" />
              </Label>
              <ScheduleDate
                value={stopDate || ""}
                onChange={(val: string) => setStopDate(val)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Stop reason *" />
              </Label>
              <Select
                value={stopReason}
                onValueChange={(value) =>
                  setStopReason(value as CNSSStopReason)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CNSSStopReason).map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {cnssStopReasonLabel(reason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setStopOpen(false)}
                disabled={stopMutation.isPending}
              >
                <SourceText source="Keep active" leading trailing />
              </Button>
              <Button
                variant="destructive"
                onClick={handleStop}
                disabled={stopMutation.isPending}
              >
                {stopMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Stop declaration" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive CNSS Declaration") :
          actionConfirm.action === 'restore' ? sourceText("Restore CNSS Declaration") :
          sourceText("Delete CNSS Declaration")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this CNSS declaration? This action can be reversed.") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this archived CNSS declaration?") :
          sourceText("Permanently delete this CNSS declaration? This cannot be undone and is refused if other records reference it.")
        }
        confirmLabel={
          actionConfirm.action === 'archive' ? sourceText("Archive") :
          actionConfirm.action === 'restore' ? sourceText("Restore") :
          sourceText("Delete")
        }
        variant={actionConfirm.action === 'delete' ? "destructive" : "default"}
        isLoading={archiveMutation.isPending || restoreMutation.isPending}
      />

      {restartOpen && (
        <Card
          ref={restartPanelRef}
          className="scroll-mt-24 border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]"
        >
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Restart CNSS declaration" leading trailing />
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setRestartOpen(false)}
              disabled={restartMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <p className="text-sm text-muted-foreground">
              <SourceText
                source="Choose the date from which declaration activity resumes."
                leading
                trailing
              />
            </p>
            {actionError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {actionError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Restart date *" />
              </Label>
              <ScheduleDate
                value={restartDate || ""}
                onChange={(val: string) => setRestartDate(val)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRestartOpen(false)}
                disabled={restartMutation.isPending}
              >
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button
                onClick={handleRestart}
                disabled={restartMutation.isPending}
              >
                {restartMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Restart declaration" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
