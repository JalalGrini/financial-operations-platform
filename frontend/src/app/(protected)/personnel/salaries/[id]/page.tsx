"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArrowLeft, Banknote, CalendarDays, Edit, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, PageHeader } from "@/components/ui/page-components";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
import { useSalaryDetail, useArchiveSalary, useRestoreSalary } from "@/features/personnel/hooks";
import { formatCurrency, formatDate, formatDateTime } from "@/features/personnel/utils/formatters";
import { SourceText } from "@/components/i18n/SourceText";

export default function SalaryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { data: salary, isLoading, isError } = useSalaryDetail(id);
  const archiveMutation = useArchiveSalary();
  const restoreMutation = useRestoreSalary();

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (isError || !salary) return (
    <div className="space-y-4">
      <p className="rounded border border-red-200 bg-red-50 p-4 text-red-700"><SourceText source="Salary history entry could not be loaded." leading trailing /></p>
      <Button asChild variant="outline"><Link href="/personnel/salaries"><SourceText source="Back to Salary History" /></Link></Button>
    </div>
  );

  const isArchived = !!salary.is_archived;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ get label() { return sourceText("Personnel"); }, href: "/personnel/personnel" }, { get label() { return sourceText("Salary History"); }, href: "/personnel/salaries" }, { label: salary.reference, isCurrent: true }]} />
      <PageHeader
        title={salary.person_name}
        description={salary.company_name + ' · ' + salary.employment_reference}
        action={
          <div className="flex items-center gap-2">
            <TagAction resourceType="personnel.employmentsalary" targetId={id} compact />
            <ExpandingActions
              actions={[
                ...(!isArchived ? [{ label: sourceText("Edit"), icon: <Edit size={14} />, onClick: () => router.push('/personnel/salaries/' + id + '/edit'), permission: 'write' as const }] : []),
                ...(!isArchived ? [{ label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => archiveMutation.mutate({ id, reason: 'Archived by user' }), variant: 'warning' as const, permission: 'write' as const }] : [{ label: sourceText("Restore"), icon: <RotateCcw size={14} />, onClick: () => restoreMutation.mutate(id), variant: 'success' as const, permission: 'write' as const }]),
              ]}
            />
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /><SourceText source="Salary" leading trailing /></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold">{Number.isFinite(Number(salary.fixed_monthly_gross_salary)) ? formatCurrency(salary.fixed_monthly_gross_salary) : sourceText("Amount unavailable")}</div>
            <div className="flex gap-2">
              <Badge variant={salary.is_current ? 'default' : 'outline'}>{salary.is_current ? sourceText("Current salary") : sourceText("Historical salary")}</Badge>
              {isArchived && <Badge variant="destructive"><SourceText source="Archived" /></Badge>}
            </div>
            <p className="text-sm text-muted-foreground"><SourceText source="Reference:" leading trailing />{salary.reference}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /><SourceText source="Effective period" leading trailing /></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p><span className="text-muted-foreground"><SourceText source="From:" /></span> {formatDate(salary.effective_from)}</p>
            <p><span className="text-muted-foreground"><SourceText source="To:" /></span> {salary.effective_to ? formatDate(salary.effective_to) : sourceText("Ongoing")}</p>
            <p><span className="text-muted-foreground"><SourceText source="Reason:" /></span> {salary.reason || sourceText("Not specified")}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle><SourceText source="Notes and audit" /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{salary.notes || sourceText("No notes.")}</p>
          <p className="text-muted-foreground"><SourceText source="Created" leading /> {salary.created_at ? formatDateTime(salary.created_at) : sourceText("unknown")} <SourceText source="· Updated" leading /> {salary.updated_at ? formatDateTime(salary.updated_at) : sourceText("unknown")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
