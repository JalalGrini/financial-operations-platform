"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  Settings,
  Archive,
  RotateCcw,
  Edit,
  Trash2,
  Loader2,
  ChevronRight,
  Building,
  Users,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  PauseCircle,
  Archive as ArchiveIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyTreasuryPanel } from "@/features/treasury/components/CompanyTreasuryPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  useCompany,
  useArchiveCompany,
  useRestoreCompany,
  useDeleteCompany,
  useCompanySettings,
  useCompanyPreferences,
  useCompanyStatistics,
} from "@/features/companies/hooks";
import { CompanyStatus } from "@/features/companies/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { ConfirmDialog } from "@/features/personnel/components/common";
const statusConfig: Record<
  CompanyStatus,
  {
    icon: any;
    label: string;
    className: string;
  }
> = {
  active: {
    icon: CheckCircle,
    get label() {
      return sourceText("Active");
    },
    className: "bg-green-100 text-green-800",
  },
  inactive: {
    icon: XCircle,
    get label() {
      return sourceText("Inactive");
    },
    className: "bg-gray-100 text-gray-800",
  },
  suspended: {
    icon: PauseCircle,
    get label() {
      return sourceText("Suspended");
    },
    className: "bg-yellow-100 text-yellow-800",
  },
  archived: {
    icon: ArchiveIcon,
    get label() {
      return sourceText("Archived");
    },
    className: "bg-red-100 text-red-800",
  },
};
export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const { data: company, isLoading, error, refetch } = useCompany(companyId);
  const { data: settings } = useCompanySettings(companyId);
  const { data: preferences } = useCompanyPreferences(companyId);
  const { data: stats } = useCompanyStatistics();
  const archiveMutation = useArchiveCompany();
  const restoreMutation = useRestoreCompany();
  const deleteMutation = useDeleteCompany();
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; action: 'archive' | 'restore' | 'delete' | null }>({ open: false, action: null });
  const handleArchive = () => setActionConfirm({ open: true, action: 'archive' });
  const handleRestore = () => setActionConfirm({ open: true, action: 'restore' });
  const handleDelete = () => setActionConfirm({ open: true, action: 'delete' });
  const executeConfirmedAction = async () => {
    const { action } = actionConfirm;
    setActionConfirm({ open: false, action: null });
    if (action === 'archive') {
      try {
        await archiveMutation.mutateAsync({ id: companyId, reason: "Archived by user" });
        toast.success(sourceText("Company archived"));
        refetch();
      } catch (err) {
        toast.error(sourceText("Failed to archive company"));
      }
    } else if (action === 'restore') {
      try {
        await restoreMutation.mutateAsync(companyId);
        toast.success(sourceText("Company restored"));
        refetch();
      } catch (err) {
        toast.error(sourceText("Failed to restore company"));
      }
    } else if (action === 'delete') {
      try {
        await deleteMutation.mutateAsync(companyId);
        toast.success(sourceText("Company deleted"));
        router.push("/companies");
      } catch (err) {
        toast.error(sourceText("Failed to delete company"));
      }
    }
  };
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !company) {
    return (
      <div className="container mx-auto py-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">
          <SourceText source="Company Not Found" />
        </h2>
        <Link href="/companies" className="text-blue-600 hover:underline">
          <SourceText source="Back to Companies" leading trailing />
        </Link>
      </div>
    );
  }
  const statusInfo =
    statusConfig[company.status as CompanyStatus] || statusConfig.active;
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/companies"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            <SourceText source="Back to Companies" leading trailing />
          </Link>
          <div className="flex items-center gap-3">
            <Building2 className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{company.name}</h1>
              <p className="text-muted-foreground">{company.reference}</p>
            </div>
            <Badge
              className={cn("ms-2", statusInfo.className)}
              variant="default"
            >
              <statusInfo.icon className="h-3 w-3 me-1" />
              {statusInfo.label}
            </Badge>
          </div>
          {company.trade_name && (
            <p className="mt-1 text-sm text-muted-foreground">
              <SourceText source="Trade name:" leading trailing />
              {company.trade_name}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TagAction resourceType="companies.company" targetId={companyId} compact />
          <ExpandingActions
            actions={[
              ...(!company.is_archived ? [{
                label: sourceText("Edit"),
                icon: <Edit size={14} />,
                onClick: () => router.push(`/companies/${companyId}/edit`),
                permission: "write" as const,
              }] : []),
              ...(!company.is_archived ? [{
                label: sourceText("Archive"),
                icon: <Archive size={14} />,
                onClick: handleArchive,
                variant: "warning" as const,
                permission: "write" as const,
              }] : [{
                label: sourceText("Restore"),
                icon: <RotateCcw size={14} />,
                onClick: handleRestore,
                variant: "success" as const,
                permission: "write" as const,
              }]),
              ...(isAdministrator && company.is_archived ? [{
                label: sourceText("Delete Permanently"),
                icon: <Trash2 size={14} />,
                onClick: handleDelete,
                variant: "danger" as const,
                permission: "delete" as const,
              }] : []),
            ]}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building className="h-5 w-5" />
              <SourceText source="Legal Information" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Registration Number" />
              </span>
              <span className="font-medium">{company.registration_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Tax ID (IF)" />
              </span>
              <span className="font-medium">{company.tax_id}</span>
            </div>
            {company.vat_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  <SourceText source="VAT Number (ICE)" />
                </span>
                <span className="font-medium">{company.vat_number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Default Currency" />
              </span>
              <span className="font-medium">{company.default_currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Timezone" />
              </span>
              <span className="font-medium">{company.timezone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Created" />
              </span>
              <span className="font-medium">
                {new Date(company.created_at).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
            </div>
            {company.is_archived && company.archived_at && (
              <div className="flex justify-between text-red-600">
                <span>
                  <SourceText source="Archived" />
                </span>
                <span className="font-medium">
                  {new Date(company.archived_at).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <SourceText source="Contact" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-muted-foreground text-sm">
                  <SourceText source="Address" />
                </p>
                <p className="font-medium">{company.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-muted-foreground text-sm">
                  <SourceText source="Phone" />
                </p>
                <p className="font-medium">{company.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-muted-foreground text-sm">
                  <SourceText source="Email" />
                </p>
                <p className="font-medium">{company.email}</p>
              </div>
            </div>
            {company.website && (
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-muted-foreground text-sm">
                    <SourceText source="Website" />
                  </p>
                  <a
                    href={
                      company.website.startsWith("http")
                        ? company.website
                        : `https://${company.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {company.website}
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              <SourceText source="Statistics" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Total Companies" />
              </span>
              <span className="font-bold">{stats?.total_companies || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Active Companies" />
              </span>
              <span className="font-bold text-green-600">
                {stats?.active_companies || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Archived Companies" />
              </span>
              <span className="font-bold text-red-600">
                {stats?.archived_companies || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Total Personnel" />
              </span>
              <span className="font-bold">{stats?.total_personnel || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <SourceText source="Total Balance" />
              </span>
              <span className="font-bold">
                {stats?.total_balance
                  ? `${(stats.total_balance / 1000).toFixed(1)}K MAD`
                  : "0 MAD"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">
            <SourceText source="Settings" />
          </TabsTrigger>
          {isAdministrator && (
          <TabsTrigger value="treasury">
            <SourceText source="Treasury" />
          </TabsTrigger>
          )}
          <TabsTrigger value="preferences">
            <SourceText source="Preferences" />
          </TabsTrigger>
        </TabsList>

        {isAdministrator && (
        <TabsContent value="treasury">
          <CompanyTreasuryPanel companyId={companyId} />
        </TabsContent>
        )}

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <SourceText source="Company Settings" leading trailing />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {settings ? (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">
                        <SourceText source="Setting" />
                      </TableHead>
                      <TableHead>
                        <SourceText source="Value" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Invoice Prefix" />
                      </TableCell>
                      <TableCell>{settings.invoice_prefix || "INV"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Invoice Number Format" />
                      </TableCell>
                      <TableCell>
                        {settings.invoice_number_format || "YYYY-NNNN"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Default Payment Terms" />
                      </TableCell>
                      <TableCell>
                        {settings.default_payment_terms}
                        <SourceText source="days" leading trailing />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Default Currency" />
                      </TableCell>
                      <TableCell>{settings.default_currency}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Require Approval" />
                      </TableCell>
                      <TableCell>
                        {settings.require_approval ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Approval Threshold" />
                      </TableCell>
                      <TableCell>
                        {settings.approval_threshold
                          ? `${settings.approval_threshold} MAD`
                          : "Not set"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Default Tax Rate" />
                      </TableCell>
                      <TableCell>{settings.default_tax_rate}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <SourceText source="Auto Send Invoices" />
                      </TableCell>
                      <TableCell>
                        {settings.auto_send_invoices ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                    {settings.invoice_footer_text && (
                      <TableRow>
                        <TableCell>
                          <SourceText source="Invoice Footer Text" />
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {settings.invoice_footer_text}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  <SourceText
                    source="No settings configured yet."
                    leading
                    trailing
                  />
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <SourceText source="Company Preferences" leading trailing />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {preferences && preferences.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/4">
                        <SourceText source="Key" />
                      </TableHead>
                      <TableHead className="w-1/4">
                        <SourceText source="Type" />
                      </TableHead>
                      <TableHead>
                        <SourceText source="Value" />
                      </TableHead>
                      <TableHead>
                        <SourceText source="Description" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preferences.map((pref) => (
                      <TableRow className="row-hover" key={pref.key}>
                        <TableCell className="font-mono">{pref.key}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{pref.value_type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {pref.typed_value !== undefined
                            ? String(pref.typed_value)
                            : pref.value}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {pref.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">
                  <SourceText
                    source="No custom preferences configured."
                    leading
                    trailing
                  />
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        isOpen={actionConfirm.open}
        onClose={() => setActionConfirm({ open: false, action: null })}
        onConfirm={executeConfirmedAction}
        title={
          actionConfirm.action === 'archive' ? sourceText("Archive Company") :
          actionConfirm.action === 'restore' ? sourceText("Restore Company") :
          sourceText("Delete Company")
        }
        description={
          actionConfirm.action === 'archive' ? sourceText("Are you sure you want to archive this company?") :
          actionConfirm.action === 'restore' ? sourceText("Are you sure you want to restore this company?") :
          sourceText("This action cannot be undone. Are you sure you want to permanently delete this company?")
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
import { SourceText } from "@/components/i18n/SourceText";