"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
/**
 * Dedicated Clients section (navbar entry) — companies register persons or
 * other companies as clients here, then reuse them when creating financial
 * records (Cycle 31, blueprint Section 11).
 */
import React from "react";
import { Users } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { ClientsSection } from "@/features/parties/components/ClientsSection";
export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Clients");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={Users}
        eyebrow="Counterparty registry"
        title={sourceText("Clients")}
        description="Register persons or companies as clients with their contact and billing details — then link them to financial records."
      />
      <ClientsSection />
    </div>
  );
}
