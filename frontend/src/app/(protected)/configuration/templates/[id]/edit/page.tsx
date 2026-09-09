"use client";

import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { TemplateEditLoader } from "@/features/financial-records/TemplateBuilderForm";

import { sourceText } from "@/lib/i18n/source-catalog";
export default function EditDocumentTemplatePage() {
  const params = useParams();
  const templateId = params.id as string;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Configuration"), href: "/configuration" },
          { label: sourceText("Document templates"), href: "/configuration/templates" },
          { label: sourceText("Edit template draft"), isCurrent: true },
        ]}
      />
      <PageHero
        icon={FileText}
        eyebrow="Document schema builder"
        title={sourceText("Edit template draft")}
        description={sourceText("Adjust fields on an unpublished draft. Field keys are part of the document contract, so keep them stable once records exist.")}
      />
      <TemplateEditLoader templateId={templateId} />
    </div>
  );
}
