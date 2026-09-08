"use client";

import { FileText } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { TemplateCreateForm } from "@/features/financial-records/TemplateBuilderForm";

import { sourceText } from "@/lib/i18n/source-catalog";
export default function NewDocumentTemplatePage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Configuration", href: "/configuration" },
          { label: "Document templates", href: "/configuration/templates" },
          { label: "New template draft", isCurrent: true },
        ]}
      />
      <PageHero
        icon={FileText}
        eyebrow="Document schema builder"
        title={sourceText("New template draft")}
        description={sourceText("Build the field set for a financial document type. Everything saves as a reviewable draft - publishing is a separate, deliberate step.")}
      />
      <TemplateCreateForm />
    </div>
  );
}
