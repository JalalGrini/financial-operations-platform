"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Edit, Archive, Trash2, RotateCcw,
  Image as ImageIcon,
  Loader2,
  Package,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { inventoryApi } from "@/features/inventory/api";
import { useExperience } from "@/lib/experience";
import { operationError } from "@/lib/form-errors";
import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import { ExpandingActions } from "@/components/ui/expanding-actions";
import { TagAction } from "@/components/collaboration/TagAction";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { DefinitionList } from "@/components/ui/definition-list";
import { Breadcrumb } from "@/components/ui/page-components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WriteOnly } from "@/components/auth/WriteOnly";

function formatDate(value: string | null | undefined, locale: "en" | "fr" | "ar") {
  if (!value) return sourceText("Not specified");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
    { day: "2-digit", month: "2-digit", year: "numeric" },
  ).format(date);
}

function formatNumber(value: number, locale: "en" | "fr" | "ar") {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
  ).format(value);
}

function humanizeEnumValue(value: string) {
  return value.replaceAll("_", " ")
    .split(" ")
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(" ");
}

function movementTypeLabel(value: string) {
  switch (value) {
    case "receipt": return sourceText("Receipt");
    case "issue": return sourceText("Issue / consume");
    case "return": return sourceText("Return");
    case "adjustment": return sourceText("Adjustment");
    case "transfer": return sourceText("Location transfer");
    case "disposal": return sourceText("Disposal");
    default: return sourceText(humanizeEnumValue(value));
  }
}

export default function InventoryDetailPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const qc = useQueryClient();
  const { locale } = useExperience();
  const [movement, setMovement] = useState({
    movement_type: "receipt",
    quantity: "1",
    reason: "",
    to_location: "",
    notes: "",
  });

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["inventory-item", id],
    queryFn: () => inventoryApi.getItem(id),
  });

  const { data: movements } = useQuery({
    queryKey: ["inventory-movements", id],
    queryFn: () => inventoryApi.listMovements({ item: id, page_size: 100 }),
    enabled: !!item,
  });

  const archiveMutation = useMutation({
    mutationFn: (payload: { id: string; reason: string }) =>
      (inventoryApi as any).archiveItem?.(payload.id, payload.reason) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-item", id] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success(sourceText("Item archived"));
    },
    onError: (e: unknown) => toast.error(operationError(sourceText("Archive item"), e)),
  });

  const restoreMutation = useMutation({
    mutationFn: (itemId: string) =>
      (inventoryApi as any).restoreItem?.(itemId) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-item", id] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast.success(sourceText("Item restored"));
    },
    onError: (e: unknown) => toast.error(operationError(sourceText("Restore item"), e)),
  });

  const create = useMutation({
    mutationFn: () => inventoryApi.createMovement(id, movement),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-item", id] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", id] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      setMovement({ ...movement, quantity: "1", reason: "", notes: "" });
      toast.success(sourceText("Inventory movement recorded"));
    },
    onError: (e) => toast.error(operationError(sourceText("Record inventory movement"), e)),
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
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href="/inventory">
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back" leading trailing />
          </Link>
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          {operationError(sourceText("Load inventory item"), error)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Inventory"), href: "/inventory" },
          { label: item.name, isCurrent: true },
        ]}
      />

      <PageHero
        icon={Package}
        eyebrow={item.item_type === "fixed_asset" ? sourceText("Fixed asset") : sourceText("Consumable")}
        title={item.name}
        description={`${item.reference} · ${item.company_name}`}
        action={
          <div className="flex items-center gap-2">
            <TagAction resourceType="inventory.inventoryitem" targetId={id} compact />
            <ExpandingActions
              actions={[
                ...(!item.is_archived ? [{
                  label: sourceText("Edit"),
                  icon: <Edit size={14} />,
                  onClick: () => router.push(`/inventory/${id}/edit`),
                  permission: "write" as const,
                }] : []),
                ...(!item.is_archived ? [{
                  label: sourceText("Archive"),
                  icon: <Archive size={14} />,
                  onClick: () => archiveMutation.mutate({ id, reason: "Archived by user" }),
                  variant: "warning" as const,
                  permission: "write" as const,
                }] : [{
                  label: sourceText("Restore"),
                  icon: <RotateCcw size={14} />,
                  onClick: () => restoreMutation.mutate(id),
                  variant: "success" as const,
                  permission: "write" as const,
                }]),
              ]}
            />
          </div>
        }
      />

      <section className={STAT_CARDS_GRID}>
        <StatCard
          icon={Package}
          label={sourceText("Available quantity")}
          value={`${formatNumber(Number(item.quantity), locale)} ${item.unit}`}
          tone={item.needs_reorder ? "rose" : "emerald"}
        />
        <StatCard
          icon={TrendingUp}
          label={sourceText("Status")}
          value={sourceText(humanizeEnumValue(item.status))}
          tone="primary"
        />
        <StatCard
          icon={TrendingDown}
          label={sourceText("Location")}
          value={item.location || sourceText("—")}
          tone="amber"
        />
        <StatCard
          icon={Package}
          label={sourceText("Movements")}
          value={movements?.results.length ?? 0}
          tone="indigo"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle><SourceText source="Item details" /></CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline">
                  {item.item_type === "fixed_asset" ? sourceText("Fixed asset") : sourceText("Consumable")}
                </Badge>
                <Badge variant="secondary">{sourceText(humanizeEnumValue(item.status))}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DefinitionList
              cols={2}
              items={[
                { label: sourceText("Reference"), value: item.reference },
                { label: sourceText("Company"), value: item.company_name || sourceText("—") },
                { label: sourceText("Category"), value: item.category_name || sourceText("No category") },
                { label: sourceText("Location"), value: item.location || sourceText("Not specified") },
                { label: sourceText("Unit"), value: item.unit || sourceText("—") },
                { label: sourceText("Purchase date"), value: formatDate(item.purchase_date, locale) },
                { label: sourceText("Asset tag"), value: item.asset_tag || sourceText("—") },
                { label: sourceText("Serial number"), value: item.serial_number || sourceText("—") },
                {
                  label: sourceText("Unit cost"),
                  value: item.unit_cost
                    ? `${formatNumber(Number(item.unit_cost), locale)} ${item.currency}`
                    : sourceText("Not specified"),
                },
                {
                  label: sourceText("Low-stock threshold"),
                  // The API field is `minimum_stock` (the model's own name, and
                  // what `needs_reorder` compares against); `reorder_point` was
                  // never part of the InventoryItem payload.
                  value: item.minimum_stock
                    ? formatNumber(Number(item.minimum_stock), locale)
                    : sourceText("Not set"),
                },
                ...(item.notes || item.description
                  ? [{ label: sourceText("Notes"), value: item.notes || item.description, wide: true as const }]
                  : []),
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              <SourceText source="Photo" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt={sourceText("Inventory image")}
                width={640}
                height={256}
                unoptimized
                className="max-h-64 w-full rounded-2xl object-contain border border-border"
              />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20">
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm"><SourceText source="No image attached." /></p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!item.is_archived && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              <SourceText source="Record movement" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div>
              <Label><SourceText source="Type" /></Label>
              <Select
                value={movement.movement_type}
                onValueChange={(v) => setMovement((m) => ({ ...m, movement_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    ["receipt", "Receipt"],
                    ["issue", "Issue / consume"],
                    ["return", "Return"],
                    ["adjustment", "Adjustment"],
                    ["transfer", "Location transfer"],
                    ["disposal", "Disposal"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{sourceText(l)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label><SourceText source="Quantity" /></Label>
              <Input
                type="number" step="0.001" value={movement.quantity}
                onChange={(e) => setMovement((m) => ({ ...m, quantity: e.target.value }))}
              />
            </div>
            {movement.movement_type === "transfer" && (
              <div>
                <Label><SourceText source="Destination" /></Label>
                <Input
                  value={movement.to_location}
                  onChange={(e) => setMovement((m) => ({ ...m, to_location: e.target.value }))}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <Label><SourceText source="Reason *" /></Label>
              <Input
                value={movement.reason}
                onChange={(e) => setMovement((m) => ({ ...m, reason: e.target.value }))}
                placeholder={sourceText("Why is this stock changing?")}
              />
            </div>
            <div className="flex items-end">
              <Button
                disabled={!movement.reason.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                <SourceText source="Record" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle><SourceText source="Movement history" /></CardTitle>
        </CardHeader>
        <div className="overflow-hidden">
          {!movements?.results.length ? (
            <div className="p-10 text-center text-muted-foreground">
              <SourceText source="No movements recorded yet." leading trailing />
            </div>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sourceText("Type")}</TableHead>
                  <TableHead>{sourceText("Reference")}</TableHead>
                  <TableHead className="text-end">{sourceText("Qty")}</TableHead>
                  <TableHead className="hidden md:table-cell">{sourceText("Before → After")}</TableHead>
                  <TableHead>{sourceText("Reason")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{sourceText("Date")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{sourceText("By")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.results.map((m) => (
                  <TableRow className="row-hover" key={m.id}>
                    <TableCell>
                      <Badge variant="outline">{movementTypeLabel(m.movement_type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.reference}</TableCell>
                    <TableCell className="text-end font-semibold">
                      {formatNumber(Number(m.quantity), locale)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatNumber(Number(m.quantity_before), locale)}
                      {" → "}
                      {formatNumber(Number(m.quantity_after), locale)}
                    </TableCell>
                    <TableCell className="text-sm">{m.reason}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(m.occurred_on, locale)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {m.created_by_name || sourceText("System")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
        </div>
      </Card>

      <Button variant="outline" asChild>
        <Link href="/inventory">
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back to inventory" leading trailing />
        </Link>
      </Button>
    </div>
  );
}
