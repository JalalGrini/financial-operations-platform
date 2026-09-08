"use client";

/**
 * Per-entity position inside the transfers budget.
 *
 * WHAT THE NUMBERS MEAN (and what does NOT sum to zero)
 * -----------------------------------------------------
 * Transfers only ever move money between entities inside the group, so
 * `Net transfers` totals EXACTLY zero. That is the ledger's integrity check
 * and it is shown as its own total with a pass/fail badge.
 *
 * Once entities are given starting positions, `Current` totals to the sum of
 * the opening balances, NOT to zero. Labelling the current column as the
 * "must be zero" one would be arithmetically wrong the moment a single
 * starting balance is set, so the three columns are presented separately with
 * the relationship spelled out: Opening + Net transfers = Current.
 */

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Scale,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/features/personnel/components/common";
import { companyApi } from "@/features/companies/api";
import { partiesApi } from "@/features/parties/api";
import { useRevealOnOpen } from "@/hooks/useRevealOnOpen";
import { formatMoney, useExperience } from "@/lib/experience";
import { cn } from "@/lib/utils";
import { sourceText } from "@/lib/i18n/source-catalog";
import { transfersApi } from "./api";
import type {
  EntityBalanceRow,
  EntityOpeningBalance,
  EntityOpeningBalanceWriteInput,
  TransferEntityType,
} from "./types";

/** Money is carried as a string end-to-end; only widen to Number for display. */
function isNegative(value: string) {
  return Number(value) < 0;
}

function SignedMoney({
  value,
  currency,
  className,
  emphasise = false,
}: {
  value: string;
  currency: string;
  className?: string;
  emphasise?: boolean;
}) {
  const { locale } = useExperience();
  const negative = isNegative(value);
  const zero = Number(value) === 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        emphasise && "font-semibold",
        zero
          ? "text-muted-foreground"
          : negative
            ? "text-danger"
            : "text-success",
        className,
      )}
    >
      {formatMoney(value, currency, locale)}
    </span>
  );
}

function EntityIcon({ type }: { type: TransferEntityType }) {
  return type === "company" ? (
    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
  ) : (
    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
  );
}

interface OpeningFormState {
  entity_type: TransferEntityType;
  entityId: string;
  amount: string;
  as_of_date: string;
  note: string;
}

const EMPTY_FORM: OpeningFormState = {
  entity_type: "company",
  entityId: "",
  amount: "",
  as_of_date: new Date().toISOString().split("T")[0],
  note: "",
};

export function EntityBalances() {
  const qc = useQueryClient();
  const { locale } = useExperience();
  const [currency, setCurrency] = useState("MAD");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EntityOpeningBalance | null>(null);
  const [form, setForm] = useState<OpeningFormState>(EMPTY_FORM);
  const [removeTarget, setRemoveTarget] = useState<EntityOpeningBalance | null>(null);

  // Reuses the reveal hook built for the financial-records panels: an inline
  // panel that opens below the fold reads as a dead button.
  const formRef = useRevealOnOpen<HTMLDivElement>(formOpen);

  const { data: report, isLoading } = useQuery({
    queryKey: ["transfers", "balances", currency],
    queryFn: () => transfersApi.balances(currency),
  });

  const { data: openings } = useQuery({
    queryKey: ["transfers", "opening-balances", currency],
    queryFn: () => transfersApi.openingBalances.list({ currency, page_size: 200 }),
  });

  const { data: companies } = useQuery({
    queryKey: ["companies", "all-select"],
    queryFn: () => companyApi.list({ page_size: 200 }),
  });

  const { data: persons } = useQuery({
    queryKey: ["parties", "associated-persons", "all-select"],
    queryFn: () => partiesApi.associatedPersons.list({ page_size: 200 }),
  });

  /** entity id -> its opening-balance row, so each table row can offer Edit. */
  const openingByEntity = useMemo(() => {
    const map = new Map<string, EntityOpeningBalance>();
    (openings?.results ?? []).forEach((ob) => {
      const key = ob.company ?? ob.associated_person;
      if (key) map.set(key, ob);
    });
    return map;
  }, [openings]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setFormOpen(false);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: EntityOpeningBalanceWriteInput) =>
      editing
        ? transfersApi.openingBalances.update(editing.id, payload)
        : transfersApi.openingBalances.create(payload),
    onSuccess: () => {
      toast.success(editing ? "Starting balance updated" : "Starting balance set");
      resetForm();
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (error: unknown) => {
      // Surface the server's reason (e.g. "this entity already has an opening
      // balance in MAD") instead of a generic failure the user cannot act on.
      const detail = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const first = detail && Object.values(detail)[0];
      const message = Array.isArray(first) ? String(first[0]) : first ? String(first) : null;
      toast.error(message ?? "Failed to save starting balance");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => transfersApi.openingBalances.delete(id),
    onSuccess: () => {
      toast.success(sourceText("Starting balance removed"));
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: () => toast.error(sourceText("Failed to remove starting balance")),
  });

  function openCreate(prefill?: { type: TransferEntityType; id: string }) {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      entity_type: prefill?.type ?? "company",
      entityId: prefill?.id ?? "",
    });
    setFormOpen(true);
  }

  function openEdit(ob: EntityOpeningBalance) {
    setEditing(ob);
    setForm({
      entity_type: ob.entity_type,
      entityId: ob.company ?? ob.associated_person ?? "",
      amount: ob.amount,
      as_of_date: ob.as_of_date,
      note: ob.note ?? "",
    });
    setFormOpen(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.entityId) {
      toast.error(sourceText("Choose the company or person this balance belongs to"));
      return;
    }
    if (form.amount.trim() === "") {
      toast.error(sourceText("Enter a starting amount"));
      return;
    }
    saveMutation.mutate({
      entity_type: form.entity_type,
      company: form.entity_type === "company" ? form.entityId : null,
      associated_person: form.entity_type === "associated_person" ? form.entityId : null,
      // Comma decimal separators are normal on a fr-MA keyboard.
      amount: form.amount.replace(",", "."),
      currency,
      as_of_date: form.as_of_date,
      note: form.note,
    });
  }

  const rows = report?.entities ?? [];
  const totals = report?.totals;
  const hasPending = rows.some((r) => Number(r.pending_net) !== 0);
  const currencyOptions = useMemo(() => {
    const set = new Set<string>([currency, "MAD", ...(report?.other_currencies ?? [])]);
    return Array.from(set);
  }, [currency, report?.other_currencies]);

  const entityOptions =
    form.entity_type === "company"
      ? (companies?.results ?? []).map((c) => ({ id: c.id, label: c.name }))
      : (persons?.results ?? []).map((p) => ({
          id: p.id,
          label: p.full_name ?? `${p.first_name} ${p.last_name}`,
        }));

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              {sourceText("Entity balances")}
            </CardTitle>
            <CardDescription>
              {sourceText("Opening + Net transfers = Current. Only confirmed transfers count toward Current; drafts are shown as pending.")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {currencyOptions.length > 1 && (
              <Select value={currency ?? ""} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue placeholder={sourceText("Currency")} />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /> {sourceText("Starting balance")}
            </Button>
          </div>
        </div>

        {/* The integrity check, stated as a result rather than a claim. */}
        {totals && (
          <div className="flex flex-wrap items-center gap-2">
            {report?.is_balanced ? (
              <Badge className="gap-1 border-success/40 bg-success-surface text-success">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {sourceText("Net transfers balance to zero")}
              </Badge>
            ) : (
              <Badge className="gap-1 border-danger/40 bg-danger-surface text-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Net transfers do not balance ({totals.net_transfers})
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Current totals {formatMoney(totals.current_balance, currency, locale)}, which equals
              the sum of the starting balances — not zero.
            </span>
          </div>
        )}

        {(report?.other_currencies?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            Transfers also exist in {report?.other_currencies.join(", ")}. Currencies are never
            added together; switch currency to see them.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {formOpen && (
          <div ref={formRef} className="scroll-mt-24">
            <Card className="border-primary/40 bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {editing
                    ? `Edit starting balance — ${editing.entity_label}`
                    : "Set a starting balance"}
                </CardTitle>
                <CardDescription>
                  {sourceText("Where this entity stood before any transfer was recorded. A negative amount means it started owing the group.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-entity-type">{sourceText("Entity type")}</Label>
                    <Select
                      value={form.entity_type ?? ""}
                      onValueChange={(value) =>
                        setForm((f) => ({
                          ...f,
                          entity_type: value as TransferEntityType,
                          entityId: "",
                        }))
                      }
                    >
                      <SelectTrigger id="ob-entity-type">
                        <SelectValue placeholder={sourceText("Select type")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">{sourceText("Company")}</SelectItem>
                        <SelectItem value="associated_person">{sourceText("Associated person")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-entity">
                      {form.entity_type === "company" ? "Company" : "Associated person"}
                    </Label>
                    <Select
                      value={form.entityId ?? ""}
                      onValueChange={(value) => setForm((f) => ({ ...f, entityId: value }))}
                    >
                      <SelectTrigger id="ob-entity" data-reveal-focus>
                        <SelectValue placeholder={sourceText("Select one")} />
                      </SelectTrigger>
                      <SelectContent>
                        {entityOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-amount">Starting amount ({currency})</Label>
                    <Input
                      id="ob-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {sourceText("Use a minus sign for a starting deficit, e.g. -2500")}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-date">{sourceText("Effective from")}</Label>
                    <Input
                      id="ob-date"
                      type="date"
                      value={form.as_of_date}
                      onChange={(e) => setForm((f) => ({ ...f, as_of_date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="ob-note">{sourceText("Note")}</Label>
                    <Textarea
                      id="ob-note"
                      rows={2}
                      placeholder={sourceText("e.g. carried over from 2025")}
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-2 md:col-span-2">
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Save"}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      {sourceText("Cancel")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">{sourceText("Loading balances…")}</p>}

        {!isLoading && rows.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            <Scale className="mx-auto mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
            <p className="text-sm">
              {sourceText("No balances yet. Set a starting balance, or record a transfer.")}
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sourceText("Entity")}</TableHead>
                  <TableHead className="text-right">{sourceText("Opening")}</TableHead>
                  <TableHead className="text-right">{sourceText("In")}</TableHead>
                  <TableHead className="text-right">{sourceText("Out")}</TableHead>
                  <TableHead className="text-right">{sourceText("Net transfers")}</TableHead>
                  <TableHead className="text-right">{sourceText("Current")}</TableHead>
                  {hasPending && <TableHead className="text-right">{sourceText("Pending")}</TableHead>}
                  <TableHead className="w-[90px]">{sourceText("Starting")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: EntityBalanceRow) => {
                  const opening = openingByEntity.get(row.entity_id);
                  return (
                    <TableRow className="row-hover" key={`${row.entity_type}-${row.entity_id}`}>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <EntityIcon type={row.entity_type} />
                          <span className="font-medium">{row.entity_label}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <SignedMoney value={row.opening_balance} currency={currency} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.transfers_in, currency, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.transfers_out, currency, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <SignedMoney value={row.net_transfers} currency={currency} />
                      </TableCell>
                      <TableCell className="text-right">
                        <SignedMoney value={row.current_balance} currency={currency} emphasise />
                      </TableCell>
                      {hasPending && (
                        <TableCell className="text-right">
                          {Number(row.pending_net) === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-warning" aria-hidden="true" />
                              <SignedMoney value={row.pending_net} currency={currency} />
                            </span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {opening ? (
                          <span className="flex items-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(opening)}
                              aria-label={`Edit starting balance for ${row.entity_label}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemoveTarget(opening)}
                              aria-label={`Remove starting balance for ${row.entity_label}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() =>
                              openCreate({ type: row.entity_type, id: row.entity_id })
                            }
                            aria-label={`Set starting balance for ${row.entity_label}`}
                          >
                            <Plus className="h-3 w-3" /> {sourceText("Set")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {totals && (
                  <TableRow className="row-hover border-t-2 bg-muted/40 font-semibold">
                    <TableCell>{sourceText("Total")}</TableCell>
                    <TableCell className="text-right">
                      <SignedMoney value={totals.opening_balance} currency={currency} emphasise />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(totals.transfers_in, currency, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(totals.transfers_out, currency, locale)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      title={sourceText("Always zero: every transfer moves money between two entities inside the group.")}
                    >
                      <span
                        className={cn(
                          "tabular-nums font-bold",
                          report?.is_balanced ? "text-success" : "text-danger",
                        )}
                      >
                        {formatMoney(totals.net_transfers, currency, locale)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <SignedMoney value={totals.current_balance} currency={currency} emphasise />
                    </TableCell>
                    {hasPending && (
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(totals.pending_net, currency, locale)}
                      </TableCell>
                    )}
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        isOpen={!!removeTarget}
        title={sourceText("Remove starting balance?")}
        description={
          removeTarget
            ? `${removeTarget.entity_label} will go back to starting at zero. The transfers themselves are not affected.`
            : ""
        }
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
        onClose={() => setRemoveTarget(null)}
        isLoading={removeMutation.isPending}
      />
    </Card>
  );
}
