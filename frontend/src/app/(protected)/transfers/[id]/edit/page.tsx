
"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { ArrowLeftRight } from "lucide-react";
import { TransferForm } from "@/features/transfers/TransferForm";
import { transfersApi } from "@/features/transfers/api";
import { useRole } from "@/hooks/useRole";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";

export default function EditTransferPage() {
  const { id } = useParams<{ id: string }>();
  // Directors can open a transfer but not edit it. Without this check the form
  // rendered for them and every save came back 403 from CanManageTransfers.
  const { canWrite } = useRole();
  const { data: transfer, isLoading, isError } = useQuery({
    queryKey: ["transfers", id],
    queryFn: () => transfersApi.get(id),
  });

  if (isLoading) return <div className="p-6 flex justify-center"><div className="animate-spin h-8 w-8 rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (isError) return <div className="p-6 text-center text-destructive"><SourceText source="Failed to load transfer. Please try again." /></div>;
  if (!canWrite) return <div className="p-6 text-center text-muted-foreground"><SourceText source="You do not have permission to edit transfers." /></div>;
  if (!transfer) return <div className="p-6 text-center text-muted-foreground"><SourceText source="Transfer not found." /></div>;
  if (!transfer.is_editable) return <div className="p-6 text-center text-muted-foreground"><SourceText source="Only draft transfers can be edited." /></div>;

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb items={[{ label: sourceText("Transfers"), href: "/transfers" }, { label: transfer.reference, href: `/transfers/${id}` }, { label: sourceText("Edit") }]} />
      <PageHeader title={sourceText("Edit Transfer")} description={transfer.reference} icon={<ArrowLeftRight className="h-6 w-6" />} />
      <TransferForm mode="edit" initial={transfer} />
    </div>
  );
}
