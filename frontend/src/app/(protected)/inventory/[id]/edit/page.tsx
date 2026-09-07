"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import { inventoryApi } from "@/features/inventory/api";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { SourceText } from "@/components/i18n/SourceText";
import { InventoryItemForm } from "@/features/inventory/InventoryItemForm";
export default function InventoryEditPage() {
  const id = useParams().id as string;
  const { data: item, isLoading, error } = useQuery({
    queryKey: ["inventory-item", id],
    queryFn: () => inventoryApi.getItem(id),
  });
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !item) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        <SourceText source="Failed to load inventory item." />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Inventory"), href: "/inventory" },
          { label: item.name, href: `/inventory/${id}` },
          { label: sourceText("Edit"), isCurrent: true },
        ]}
      />
      <PageHero
        icon={Package}
        eyebrow="Asset management"
        title={`Edit — ${item.name}`}
        description={`${item.reference} · ${item.company_name}`}
      />
      <InventoryItemForm item={item} />
    </div>
  );
}
