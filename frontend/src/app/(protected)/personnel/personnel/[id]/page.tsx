"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { WriteOnly } from "@/components/auth/WriteOnly";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  User,
  Briefcase,
  CreditCard,
  FileText,
  FileCheck,
  Calendar,
  Building2,
  Mail,
  Phone,
  MapPin,
  MoreHorizontal,
  Archive,
  RotateCcw,
  Plus,
  Edit,
  Eye,
  Upload,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { DefinitionList } from "@/components/ui/definition-list";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import {
  StatusBadge,
  PersonnelAvatar,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import { leavesApi } from "@/features/leaves/api";
import { formatDate } from "@/features/personnel/utils/formatters";
import {
  usePersonnelDetail,
  useArchivePersonnel,
  useRestorePersonnel,
  usePermanentDeletePersonnel,
} from "@/features/personnel/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { documentApi, statusLabels } from "@/features/personnel/api";
import { DocumentType } from "@/features/personnel/types";

function humanizeEnumValue(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(" ");
}

function documentTypeLabel(value: DocumentType) {
  return sourceText(
    statusLabels.documentType[value] || humanizeEnumValue(value),
  );
}

export default function PersonnelProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const archiveMutation = useArchivePersonnel();
  const restoreMutation = useRestorePersonnel();
  const deleteMutation = usePermanentDeletePersonnel();
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, action: null });
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const activeLeaveQuery = { data: null as null };
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(
    DocumentType.OTHER,
  );
  const documentsQuery = useQuery({
    queryKey: ["personnel-documents", id],
    queryFn: () => documentApi.getByPerson(id),
  });
  const uploadDocumentMutation = useMutation({
    mutationFn: () =>
      documentApi.create({
        person: id,
        document_type: documentType,
        file: documentFile || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents", id] });
      setDocumentFile(null);
      toast.success(sourceText("Ready file uploaded"));
    },
    onError: (error: Error) => toast.error(error.message || "Upload failed"),
  });
  const [activeTab, setActiveTab] = useState<
    "overview" | "employments" | "salaries" | "payrolls" | "cnss" | "documents"
  >("overview");
  const {
    data: personnelData,
    isLoading,
    error,
    refetch,
  } = usePersonnelDetail(id);
  const handleArchive = () => setActionConfirm({ open: true, action: 'archive' });
  const handlePermanentDelete = () => setActionConfirm({ open: true, action: 'delete' });
  const handleRestore = () => setActionConfirm({ open: true, action: 'restore' });
  const executeConfirmedAction = async () => {
    const { action } = actionConfirm;
    setActionConfirm({ open: false, action: null });
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id, reason: "Archived from profile" });
        toast.success(sourceText("Personnel archived successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to archive personnel");
      }
    } else if (action === 'delete') {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success(sourceText("Personnel permanently deleted"));
        router.push("/personnel/personnel");
      } catch (error: any) {
        toast.error(error?.message || "Failed to delete personnel");
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(id);
        toast.success(sourceText("Personnel restored successfully"));
        router.refresh();
      } catch (error: any) {
        toast.error(error?.message || "Failed to restore personnel");
      }
    }
  };
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHero
          icon={User}
          eyebrow={sourceText("Personnel record")}
          title={sourceText("Personnel Profile")}
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
        <PageHero
          icon={User}
          eyebrow={sourceText("Personnel record")}
          title={sourceText("Personnel Profile")}
          description={sourceText("Error loading data")}
        />
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
          <p className="text-red-600">
            <SourceText source="Failed to load personnel data" />
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
  const person = personnelData;
  const isArchived = person?.is_archived === true;
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
              return sourceText("Personnel List");
            },
            href: "/personnel/personnel",
          },
          { label: person?.full_name || "Loading...", isCurrent: true },
        ]}
      />

      {/* Page Header */}
      <PageHero
        icon={User}
        eyebrow={sourceText("Personnel record")}
        title={person?.full_name || "Personnel Profile"}
        description={`Reference: ${person?.reference} • ${person?.cin || "No CIN"}`}
        action={
          <ExpandingActions actions={[{ permission: "write" as const, label: "Edit", icon: <Edit size={14} />, onClick: () => router.push(`/personnel/personnel/${id}/edit`) }, ...(!isArchived ? [{ permission: "write" as const, label: "Archive", icon: <Archive size={14} />, onClick: handleArchive, variant: "warning" as const }] : [{ permission: "write" as const, label: "Restore", icon: <RotateCcw size={14} />, onClick: handleRestore, variant: "success" as const }]), { permission: "delete" as const, label: "Delete", icon: <span>🗑</span>, onClick: handlePermanentDelete, variant: "danger" as const }]} />
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
                name={person?.full_name || ""}
                email={person?.email}
                size="xl"
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-4">
                  <StatusBadge
                    status={person?.status || "active"}
                    variant="personnel"
                  />
                  {activeLeaveQuery.data && (
                    <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <Calendar className="h-3 w-3" />
                      <SourceText source="On Leave" leading trailing />
                    </Badge>
                  )}
                  {person?.has_active_cnss && (

                    <Badge variant="secondary" className="gap-1">
                      <FileCheck className="h-3 w-3" />
                      <SourceText source="CNSS Declared" leading trailing />
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Reference" />
                    </p>
                    <p className="font-mono text-sm font-medium">
                      {person?.reference}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Completeness" leading trailing />
                    </p>
                    <p className="font-medium">
                      <span
                        className={
                          person && person.completeness_percentage >= 80
                            ? "text-green-600"
                            : person && person.completeness_percentage >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        }
                      >
                        {person?.completeness_percentage}%
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Active Employments"
                        leading
                        trailing
                      />
                    </p>
                    <p className="font-medium">
                      {person?.active_employments_count || 0}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <SourceText source="Created" />
                    </p>
                    <p className="font-medium">
                      {person?.created_at ? formatDate(person.created_at) : "-"}
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
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Email" />
                  </p>
                  <p>
                    {person?.email || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Phone" />
                  </p>
                  <p>
                    {person?.phone || (
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
                    <SourceText source="Date of Birth" />
                  </p>
                  <p>
                    {person?.date_of_birth ? (
                      formatDate(person.date_of_birth)
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
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Nationality" />
                  </p>
                  <p>
                    {person?.nationality || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="p-2 bg-muted rounded-lg">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Address" />
                  </p>
                  <p>
                    {[
                      person?.address,
                      person?.city,
                      person?.province,
                      person?.region,
                    ]
                      .filter(Boolean)
                      .join(", ") || (
                      <span className="text-muted-foreground">
                        <SourceText source="Not provided" leading trailing />
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="CIN" />
                  </p>
                  <p className="font-mono">
                    {person?.cin || (
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
            <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Total Employments" />
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {person?.active_employments_count || 0}
              </p>
            </div>
            <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="CNSS Status" />
              </p>
              <StatusBadge
                status={
                  person?.has_active_cnss
                    ? "DECLARED_BY_THIS_COMPANY"
                    : "NOT_DECLARED"
                }
                variant="cnssSituation"
                showDot
              />
            </div>
            <div className="space-y-1 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <SourceText source="Profile Completeness" leading trailing />
              </p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    person && person.completeness_percentage >= 80
                      ? "bg-green-500"
                      : person && person.completeness_percentage >= 50
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${person?.completeness_percentage || 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {person?.completeness_percentage}%
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
            <div className="flex gap-1 border-b pb-2" role="tablist">
              {[
                {
                  id: "overview",
                  get label() {
                    return sourceText("Overview");
                  },
                  icon: User,
                },
                {
                  id: "employments",
                  get label() {
                    return sourceText("Employments");
                  },
                  icon: Briefcase,
                  count: person?.active_employments_count,
                },
                {
                  id: "salaries",
                  get label() {
                    return sourceText("Salaries");
                  },
                  icon: CreditCard,
                },
                {
                  id: "payrolls",
                  get label() {
                    return sourceText("Payroll");
                  },
                  icon: FileText,
                },
                {
                  id: "cnss",
                  get label() {
                    return sourceText("CNSS");
                  },
                  icon: FileCheck,
                },
                {
                  id: "documents",
                  get label() {
                    return sourceText("Documents");
                  },
                  icon: FileText,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab.id
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="ms-1 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === "employments" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Employments list will be loaded here"
                  leading
                  trailing
                />
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/personnel/employments?person=${id}`)
                }
              >
                <Plus className="me-2 h-4 w-4" />
                <SourceText source="View All Employments" leading trailing />
              </Button>
            </div>
          )}
          {activeTab === "salaries" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Salary history will be loaded here"
                  leading
                  trailing
                />
              </p>
              <WriteOnly>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(`/personnel/payroll/new?person=${id}`)
                  }
                >
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Add Payroll" leading trailing />
                </Button>
              </WriteOnly>
            </div>
          )}
          {activeTab === "payrolls" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Payroll records will be loaded here"
                  leading
                  trailing
                />
              </p>
              <WriteOnly>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(`/personnel/payroll/new?person=${id}`)
                  }
                >
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Create Payroll" leading trailing />
                </Button>
              </WriteOnly>
            </div>
          )}
          {activeTab === "cnss" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="CNSS declarations will be loaded here"
                  leading
                  trailing
                />
              </p>
              <WriteOnly>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/personnel/cnss/new?person=${id}`)}
                >
                  <Plus className="me-2 h-4 w-4" />
                  <SourceText source="Create CNSS Declaration" leading trailing />
                </Button>
              </WriteOnly>
            </div>
          )}
          {activeTab === "documents" && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-dashed p-4 md:grid-cols-[12rem_1fr_auto] md:items-end">
                <label className="space-y-1 text-sm font-medium">
                  <SourceText source="Document type" />
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3"
                    value={documentType}
                    onChange={(event) =>
                      setDocumentType(event.target.value as DocumentType)
                    }
                  >
                    {Object.values(DocumentType).map((value) => (
                      <option key={value} value={value}>
                        {documentTypeLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <SourceText source="Upload a ready file" />
                  <input
                    className="block h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                    onChange={(event) =>
                      setDocumentFile(event.target.files?.[0] || null)
                    }
                  />
                </label>
                <Button
                  onClick={() => uploadDocumentMutation.mutate()}
                  disabled={!documentFile || uploadDocumentMutation.isPending}
                >
                  {uploadDocumentMutation.isPending ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="me-2 h-4 w-4" />
                  )}
                  <SourceText source="Upload file" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <SourceText source="PDF, Word, Excel, CSV and image files up to 20 MB are stored privately and downloaded through authenticated access." />
              </p>
              <div className="space-y-2">
                {(documentsQuery.data || []).map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {document.file_name || document.reference}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {document.document_type_label || document.document_type}
                      </p>
                    </div>
                    {document.download_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          documentApi
                            .download(document)
                            .catch((error) => toast.error(error.message))
                        }
                      >
                        <Download className="me-2 h-4 w-4" />
                        <SourceText source="Download" />
                      </Button>
                    )}
                  </div>
                ))}
                {!documentsQuery.isLoading &&
                  (documentsQuery.data || []).length === 0 && (
                    <p className="rounded-xl border p-4 text-sm text-muted-foreground">
                      <SourceText source="No documents found" />
                    </p>
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive Personnel") :
          actionConfirm.action === 'restore' ? sourceText("Restore Personnel") :
          sourceText("Delete Personnel")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this personnel record? This action can be reversed.") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this archived personnel record?") :
          sourceText("Permanently delete this record? This CANNOT be undone. Consider archiving instead.")
        }
        confirmLabel={
          actionConfirm.action === 'archive' ? sourceText("Archive") :
          actionConfirm.action === 'restore' ? sourceText("Restore") :
          sourceText("Delete")
        }
        variant={actionConfirm.action === 'delete' ? "destructive" : "default"}
        isLoading={archiveMutation.isPending || restoreMutation.isPending || deleteMutation.isPending}
      />
    </div>
  );
}
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { SourceText } from "@/components/i18n/SourceText";