"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import Link from "next/link";
import { Package } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { SourceText } from "@/components/i18n/SourceText";
import { InventoryItemForm } from "@/features/inventory/InventoryItemForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
export default function InventoryNewPage() {
  return (
    <div className="space-y-6 min-w-0">
      <Breadcrumb
        items={[
          { label: sourceText("Inventory"), href: "/inventory" },
          { label: sourceText("New item"), isCurrent: true },
        ]}
      />
      <PageHero
        icon={Package}
        eyebrow="Asset management"
        title={sourceText("New inventory item")}
        description="Add a fixed asset or consumable supply to the inventory register."
      />
      <InventoryItemForm />
    </div>
  );
}
