"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React from "react";
import { Building2 } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { SuppliersSection } from "@/features/parties/components/SuppliersSection";

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Suppliers");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={Building2}
        eyebrow="Counterparty registry"
        title={sourceText("Suppliers")}
        description={sourceText(
          "Register vendors once, then reuse them on financial records and payments.",
        )}
      />
      <SuppliersSection />
    </div>
  );
}
