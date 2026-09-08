
"use client";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { ArrowLeftRight } from "lucide-react";
import { TransferForm } from "@/features/transfers/TransferForm";

import { sourceText } from "@/lib/i18n/source-catalog";
export default function NewTransferPage() {
  return (
    <div className="space-y-6 p-6 min-w-0">
      <Breadcrumb items={[{ label: "Transfers", href: "/transfers" }, { label: "New Transfer" }]} />
      <PageHeader title={sourceText("New Transfer")} description={sourceText("Record a new money flow between entities.")} icon={<ArrowLeftRight className="h-6 w-6" />} />
      <TransferForm mode="create" />
    </div>
  );
}
