"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { ReceiptText } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { RecordCreateForm } from "@/features/financial-records/RecordCreateForm";

export default function NewFinancialRecordPage() {
  return (
    <div className="space-y-6 min-w-0">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Financial Records");
            },
            href: "/financial-records",
          },
          {
            get label() {
              return sourceText("New record");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={ReceiptText}
        eyebrow="Accounting ledger"
        title={sourceText("New financial record")}
        description={sourceText("Create a typed draft, then add balanced debit and credit lines in its workspace.")}
      />
      <RecordCreateForm />
    </div>
  );
}
