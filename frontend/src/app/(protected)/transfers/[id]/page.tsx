"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, CheckCircle2, Clock, Pencil, Archive, RotateCcw, Eye } from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { transfersApi } from "@/features/transfers/api";
import type { CashTransfer } from "@/features/transfers/types";
import { useRole } from "@/hooks/useRole";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Transfers are readable by every role; only Administrator and Assistant
  // may change them. The server enforces the same split in CanManageTransfers,
  // so a Director who reaches a write endpoint directly still gets a 403 -
  // this only stops us from showing buttons that were always going to fail.
  const { canWrite } = useRole();

  const { data: transfer, isLoading, isError } = useQuery({
    queryKey: ["transfers", id],
    queryFn: () => transfersApi.get(id),
  });

  const confirmMutation = useMutation({
    mutationFn: () => transfersApi.confirm(id),
    onSuccess: () => { toast.success(sourceText("Transfer confirmed \u2014 amount deducted from budget")); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: (e: Error) => toast.error(e.message || sourceText("Failed to confirm transfer")),
  });

  const revertMutation = useMutation({
    mutationFn: () => transfersApi.revertToDraft(id),
    onSuccess: () => { toast.success(sourceText("Transfer reverted to draft")); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: (e: Error) => toast.error(e.message || sourceText("Failed to revert transfer")),
  });

  const archiveMutation = useMutation({
    mutationFn: () => transfersApi.archive(id),
    onSuccess: () => { toast.success(sourceText("Transfer archived")); router.push("/transfers"); },
  });

  if (isLoading) return <div className="p-6 flex justify-center"><div className="animate-spin h-8 w-8 rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (isError) return <div className="p-6 text-center text-destructive"><SourceText source="Failed to load transfer. Please try again." /></div>;
  if (!transfer) return <div className="p-6 text-center text-muted-foreground"><SourceText source="Transfer not found." /></div>;

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb items={[{ label: sourceText("Transfers"), href: "/transfers" }, { label: transfer.reference }]} />
      <PageHeader
        title={transfer.reference}
        description={`${transfer.from_label} \u2192 ${transfer.to_label}`}
        icon={<ArrowLeftRight className="h-6 w-6" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TagAction resourceType="transfers.transfer" targetId={id} compact />
            {transfer.status === "draft" ? (
              <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" /> <SourceText source="Confirm" />
              </Button>
            ) : (
              <Button variant="outline" className="gap-2"
                onClick={() => revertMutation.mutate()} disabled={revertMutation.isPending}>
                <RotateCcw className="h-4 w-4" /> <SourceText source="Revert to Draft" />
              </Button>
            )}
            <ExpandingActions
              actions={[
                { label: sourceText("Edit"), icon: <Pencil size={14} />, onClick: () => router.push(`/transfers/${id}/edit`), permission: "write" as const },
                { label: sourceText("Archive"), icon: <Archive size={14} />, onClick: () => setArchiveOpen(true), variant: "warning" as const, permission: "write" as const },
              ]}
            />
          </div>
        }
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300 }} className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide"><SourceText source="Transfer Details" /></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground"><SourceText source="Status" /></p>
              {transfer.status === "confirmed" ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 mt-1">
                  <CheckCircle2 className="h-3 w-3" /> <SourceText source="Confirmed" />
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mt-1">
                  <Clock className="h-3 w-3" /> <SourceText source="Draft" />
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground"><SourceText source="Amount" /></p>
              <p className="text-3xl font-bold tabular-nums mt-1">{Number(transfer.amount).toLocaleString("fr-MA")} <span className="text-base font-normal text-muted-foreground">{transfer.currency}</span></p>
              {transfer.status === "confirmed" && (
                <p className="text-xs text-emerald-600 mt-1">✓ <SourceText source="Deducted from budget" /></p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground"><SourceText source="Date" /></p>
              <p className="font-medium mt-1">{transfer.transfer_date}</p>
            </div>
            {transfer.note && (
              <div>
                <p className="text-xs text-muted-foreground"><SourceText source="Note" /></p>
                <p className="text-sm mt-1 text-foreground/80">{transfer.note}</p>
              </div>
            )}
            {transfer.confirmed_at && (
              <div>
                <p className="text-xs text-muted-foreground"><SourceText source="Confirmed at" /></p>
                <p className="text-sm mt-1">{new Date(transfer.confirmed_at!).toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide"><SourceText source="Flow" /></CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 py-4">
              <div className="flex-1 rounded-xl bg-muted/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{transfer.from_entity_type === "company" ? sourceText("Company") : sourceText("Person")}</p>
                <p className="font-semibold">{transfer.from_label}</p>
              </div>
              <ArrowRight className="h-6 w-6 text-primary shrink-0 rtl:rotate-180" />
              <div className="flex-1 rounded-xl bg-muted/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{transfer.to_entity_type === "company" ? sourceText("Company") : sourceText("Person")}</p>
                <p className="font-semibold">{transfer.to_label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <ConfirmDialog
        isOpen={archiveOpen}
        title={sourceText("Archive this transfer?")}
        description={sourceText("The transfer will be hidden from the main list. You can restore it later from the archived view.")}
        onConfirm={() => archiveMutation.mutate()}
        onClose={() => setArchiveOpen(false)}
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
}
