"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Trash2, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AdminOnly, WriteOnly } from "@/components/auth/WriteOnly";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { leavesApi, LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS, LEAVE_TYPES } from "@/features/leaves/api";
import { cn } from "@/lib/utils";
import { companyDisplayName } from "@/lib/company-scope";
import { ConfirmDialog } from "@/features/personnel/components/common";

export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: leave, isLoading, error } = useQuery({
    queryKey: ["leave", id],
    queryFn: () => leavesApi.get(parseInt(id)),
  });

  const markOfficialMutation = useMutation({
    mutationFn: () => leavesApi.markOfficial(parseInt(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave", id] });
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => leavesApi.cancel(parseInt(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave", id] });
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => leavesApi.delete(parseInt(id)),
    onSuccess: () => router.push("/leaves"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !leave) {
    return (
      <div className="p-6 text-center text-destructive">
        <SourceText source="Leave record not found." />
      </div>
    );
  }

  const leaveTypeLabel = LEAVE_TYPES.find((t) => t.value === leave.leave_type)?.label ?? leave.leave_type;

  return (
    <div className="space-y-6 p-6 min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leaves"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black tracking-tight">
            <SourceText source="Leave Details" />
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            #{leave.id} — {leave.personnel_name}
          </p>
        </div>
        <Badge className={cn("text-xs", LEAVE_STATUS_COLORS[leave.status])}>
          {LEAVE_STATUS_LABELS[leave.status]}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle><SourceText source="Leave Information" /></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground"><SourceText source="Type" /></p>
                <p className="font-medium">{leaveTypeLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground"><SourceText source="Company" /></p>
                <p className="font-medium">{companyDisplayName(leave.company_name, sourceText("Tout le groupe"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground"><SourceText source="Duration" /></p>
                <p className="font-medium">{leave.duration_days} <SourceText source="days" /></p>
              </div>
              <div>
                <p className="text-muted-foreground"><SourceText source="Start Date" /></p>
                <p className="font-medium">{leave.start_date}</p>
              </div>
              <div>
                <p className="text-muted-foreground"><SourceText source="End Date" /></p>
                <p className="font-medium">{leave.end_date}</p>
              </div>
            </div>
            {leave.reason && (
              <div>
                <p className="text-sm text-muted-foreground"><SourceText source="Reason" /></p>
                <p className="mt-1 text-sm">{leave.reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><SourceText source="Timeline" /></CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground"><SourceText source="Created" /></span>
              <span>{new Date(leave.created_at).toLocaleDateString()}</span>
              {leave.created_by_name && <span className="text-muted-foreground">by {leave.created_by_name}</span>}
            </div>
            {leave.official_at && (
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span><SourceText source="Made official" /></span>
                <span>{new Date(leave.official_at).toLocaleDateString()}</span>
              </div>
            )}
            {leave.cancelled_at && (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span><SourceText source="Cancelled" /></span>
                <span>{new Date(leave.cancelled_at).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {leave.status === "draft" && (
          <WriteOnly>
            <Button
              onClick={() => markOfficialMutation.mutate()}
              disabled={markOfficialMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {markOfficialMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="me-2 h-4 w-4" />
              <SourceText source="Mark Official" />
            </Button>
          </WriteOnly>
        )}
        {leave.status === "official" && (
          <AdminOnly>
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <XCircle className="me-2 h-4 w-4" />
              <SourceText source="Cancel Leave" />
            </Button>
          </AdminOnly>
        )}
        {leave.status === "draft" && (
          <AdminOnly>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="me-2 h-4 w-4" />
              <SourceText source="Delete" />
            </Button>
          </AdminOnly>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { deleteMutation.mutate(); setDeleteConfirmOpen(false); }}
        title={sourceText("Delete Leave Record")}
        description={sourceText("Delete this leave record?")}
        confirmLabel={sourceText("Delete")}
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
