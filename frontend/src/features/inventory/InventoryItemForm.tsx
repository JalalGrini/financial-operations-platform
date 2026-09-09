"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Loader2, Save } from "lucide-react";
import { inventoryApi } from "./api";
import type { InventoryItem, ItemType } from "./types";
import { useCompanies } from "@/features/companies/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractFieldErrors, operationError } from "@/lib/form-errors";
import { toast } from "@/components/ui/toast";
import { SourceText } from "@/components/i18n/SourceText";
const blank = {
  company: "",
  category: "",
  item_type: "fixed_asset" as ItemType,
  name: "",
  sku: "",
  asset_tag: "",
  description: "",
  quantity: "1",
  unit: "unit",
  purchase_date: "",
  unit_cost: "",
  currency: "MAD",
  serial_number: "",
  condition: "good",
  status: "available",
  location: "",
  minimum_stock: "",
  warranty_expiration: "",
  useful_life_years: "",
  notes: "",
};

type InventoryFormState = typeof blank;

function buildInitialForm(item?: InventoryItem): InventoryFormState {
  if (!item) return { ...blank };
  return {
    company: item.company ?? "",
    category: item.category ?? "",
    item_type: item.item_type ?? "fixed_asset",
    name: item.name ?? "",
    sku: item.sku ?? "",
    asset_tag: item.asset_tag ?? "",
    description: item.description ?? "",
    quantity: item.quantity ? String(item.quantity) : "1",
    unit: item.unit ?? "unit",
    purchase_date: item.purchase_date ?? "",
    unit_cost: item.unit_cost ? String(item.unit_cost) : "",
    currency: item.currency ?? "MAD",
    serial_number: item.serial_number ?? "",
    condition: item.condition ?? "good",
    status: item.status ?? "available",
    location: item.location ?? "",
    minimum_stock: item.minimum_stock ? String(item.minimum_stock) : "",
    warranty_expiration: item.warranty_expiration ?? "",
    useful_life_years:
      item.useful_life_years !== null && item.useful_life_years !== undefined
        ? String(item.useful_life_years)
        : "",
    notes: item.notes ?? "",
  };
}

export function InventoryItemForm({ item }: { item?: InventoryItem }) {
  const router = useRouter(),
    qc = useQueryClient();
  const [form, setForm] = useState<InventoryFormState>(() =>
    buildInitialForm(item),
  );
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the draft when a different item arrives, using React's "adjusting
  // state when a prop changes" pattern instead of a post-paint effect. The
  // identity comparison is exactly the one the previous
  // `useEffect(..., [item])` relied on, so when the form resets is unchanged -
  // it just no longer costs a second render pass.
  const [syncedItem, setSyncedItem] = useState(item);
  if (item !== syncedItem) {
    setSyncedItem(item);
    setForm(buildInitialForm(item));
  }
  const { data: companies } = useCompanies({
    page_size: 500,
    archive_state: "active",
  });
  const { data: categories } = useQuery({
    queryKey: ["inventory-categories", form.company, form.item_type],
    queryFn: () =>
      inventoryApi.listCategories({
        page_size: 500,
        company: form.company,
        item_type: form.item_type,
        archive_state: "active",
      }),
    enabled: !!form.company,
  });
  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      item
        ? inventoryApi.updateItem(item.id, data)
        : inventoryApi.createItem(data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success(
        sourceText(item ? "Inventory item updated" : "Inventory item created"),
      );
      router.push(`/inventory/${saved.id}`);
    },
    onError: (e) => {
      setErrors(extractFieldErrors(e));
      toast.error(
        operationError(
          sourceText(item ? "Update inventory item" : "Create inventory item"),
          e,
        ),
      );
    },
  });
  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.company) local.company = sourceText("Company is required.");
    if (!form.name.trim()) local.name = sourceText("Item name is required.");
    if (!form.item_type) local.item_type = sourceText("Item type is required.");
    if (local.company || local.name || local.item_type) {
      setErrors(local);
      return;
    }
    if (image && image.size > 5 * 1024 * 1024) {
      setErrors((e) => ({
        ...e,
        image: sourceText("Each file must be 10 MB or smaller."),
      }));
      return;
    }
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (item && k === "quantity") return;
      if (v !== "" && v !== null && v !== undefined) data.append(k, String(v));
    });
    if (image) data.append("image", image, image.name);
    mutation.mutate(data);
  };
  const field = (
    name: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={name}
        type={type}
        value={(form as any)[name]}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!errors[name]}
      />
      {errors[name] && <p className="text-sm text-red-600">{errors[name]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText source="Required information" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              <SourceText source="Company *" />
            </Label>
            <Select
              value={form.company}
              onValueChange={(v) => set("company", v)}
              disabled={!!item}
            >
              <SelectTrigger>
                <SelectValue placeholder={sourceText("Select company")} />
              </SelectTrigger>
              <SelectContent>
                {companies?.results.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.company && (
              <p className="text-sm text-red-600">{errors.company}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>
              <SourceText source="Item type *" />
            </Label>
            <Select
              value={form.item_type}
              onValueChange={(v) => set("item_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_asset">
                  <SourceText
                    source="Fixed asset / essential equipment"
                    leading
                    trailing
                  />
                </SelectItem>
                <SelectItem value="consumable">
                  <SourceText
                    source="Consumable / stock supply"
                    leading
                    trailing
                  />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("name", sourceText("Item name"), "text", true)}
          {!item &&
            field("quantity", sourceText("Opening quantity"), "number", true)}
          {field("unit", sourceText("Unit"), "text", true)}
          {field("purchase_date", sourceText("Purchase date"), "date")}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText source="Classification and location" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              <SourceText source="Category" />
            </Label>
            <Select
              value={form.category || "none"}
              onValueChange={(v) => set("category", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={sourceText("Optional category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <SourceText source="No category" />
                </SelectItem>
                {categories?.results.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {field("location", sourceText("Location"))}
          {field("asset_tag", sourceText("Asset tag"))}
          {field("sku", sourceText("SKU / stock code"))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText
              source="Optional purchasing, condition, and notes"
              leading
              trailing
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field("unit_cost", sourceText("Unit cost"), "number")}
          {field("currency", sourceText("Currency"))}
          {field("serial_number", sourceText("Serial number"))}
          {field(
            "warranty_expiration",
            sourceText("Warranty expiration"),
            "date",
          )}
          {form.item_type === "consumable" &&
            field("minimum_stock", sourceText("Low-stock threshold"), "number")}
          {form.item_type === "fixed_asset" &&
            field(
              "useful_life_years",
              sourceText("Useful life (years)"),
              "number",
            )}
          <div className="space-y-1.5 md:col-span-2">
            <Label>
              <SourceText source="Description" />
            </Label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-3"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>
              <SourceText source="Notes" />
            </Label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-3"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>
              <SourceText source="Item photo" />
            </Label>
            {item?.image_url ? (
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                <div className="border-b px-3 py-2 text-sm font-medium text-foreground">
                  <SourceText source="Current photo" />
                </div>
                <Image
                  src={item.image_url}
                  alt={sourceText("Inventory image")}
                  width={960}
                  height={320}
                  unoptimized
                  className="max-h-56 w-full object-contain"
                />
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  <SourceText
                    source="Upload a new file to replace the current photo."
                    leading
                    trailing
                  />
                </p>
              </div>
            ) : null}
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground">
              <SourceText
                source="Optional. Use a clear asset or product photo."
                leading
                trailing
              />
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          <SourceText source="Cancel" leading trailing />
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {item ? sourceText("Save changes") : sourceText("Create item")}
        </Button>
      </div>
    </form>
  );
}
