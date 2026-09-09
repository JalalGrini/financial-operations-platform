
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Save, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { transfersApi } from "./api";
import { partiesApi } from "@/features/parties/api";
import { companyApi } from "@/features/companies/api";
import type { CashTransfer, CashTransferWriteInput } from "./types";
import { sourceText } from "@/lib/i18n/source-catalog";

interface TransferFormProps {
  initial?: CashTransfer;
  mode: "create" | "edit";
}

type EntityType = "company" | "associated_person";

/**
 * Declared at module scope on purpose. This used to be a nested function inside
 * `TransferForm`, which made it a brand-new component type on every render, so
 * React unmounted and remounted both selectors each time any field changed -
 * closing an open dropdown and dropping focus mid-interaction. The two lists it
 * used to close over are now explicit props.
 */
function EntitySelector({
  type,
  id,
  onTypeChange,
  onIdChange,
  label,
  locked,
  companies,
  persons,
}: {
  type: EntityType;
  id: string;
  onTypeChange: (t: EntityType) => void;
  onIdChange: (id: string) => void;
  label: string;
  locked?: boolean;
  companies: { id: string; name: string }[];
  persons: { id: string; first_name: string; last_name: string }[];
}) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <Select
        value={type}
        onValueChange={(v) => { if (!locked) { onTypeChange(v as EntityType); onIdChange(""); } }}
        disabled={locked}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="company">{sourceText("Company")}</SelectItem>
          <SelectItem value="associated_person">{sourceText("Associated Person")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={id} onValueChange={onIdChange} disabled={locked}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${type === "company" ? "company" : "person"}...`} />
        </SelectTrigger>
        <SelectContent>
          {type === "company" && companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
          {type === "associated_person" && persons.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {locked && (
        <p className="text-xs text-muted-foreground">{"· "}{sourceText("Entity cannot be changed when editing a transfer.")}</p>
      )}
    </div>
  );
}

export function TransferForm({ initial, mode }: TransferFormProps) {
  const router = useRouter();
  const qc = useQueryClient();

  // Pre-populate all fields from initial when editing
  const [fromType, setFromType] = useState<EntityType>(initial?.from_entity_type ?? "company");
  const [fromId, setFromId] = useState<string>(initial?.from_company ?? initial?.from_associated_person ?? "");
  const [toType, setToType] = useState<EntityType>(initial?.to_entity_type ?? "company");
  const [toId, setToId] = useState<string>(initial?.to_company ?? initial?.to_associated_person ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "MAD");
  const [date, setDate] = useState(initial?.transfer_date ?? new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState(initial?.note ?? "");

  const { data: companies } = useQuery({
    queryKey: ["companies", "all-select"],
    queryFn: () => companyApi.list({ page_size: 200 }),
  });

  const { data: persons } = useQuery({
    queryKey: ["parties", "associated-persons", "all-select"],
    queryFn: () => partiesApi.associatedPersons.list({ page_size: 200 }),
  });

  const mutation = useMutation({
    mutationFn: (data: CashTransferWriteInput) =>
      mode === "create" ? transfersApi.create(data) : transfersApi.update(initial!.id, data),
    onSuccess: (result) => {
      toast.success(mode === "create" ? "Transfer created" : "Transfer updated");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      // `result.id` used to be read through an `as any` cast, which hid the
      // fact that the backend echoed back the WRITE serializer - a body with no
      // id. The redirect therefore went to /transfers/undefined and a saved
      // transfer looked like a failed one. The cast is gone so TypeScript now
      // checks this against the real response type.
      router.push(`/transfers/${result.id}`);
    },
    onError: () => toast.error(sourceText("Failed to save transfer")),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CashTransferWriteInput = {
      from_entity_type: fromType,
      from_company: fromType === "company" ? fromId : null,
      from_associated_person: fromType === "associated_person" ? fromId : null,
      to_entity_type: toType,
      to_company: toType === "company" ? toId : null,
      to_associated_person: toType === "associated_person" ? toId : null,
      amount,
      currency,
      transfer_date: date,
      note,
    };
    mutation.mutate(payload);
  }

  const companiesList = companies?.results ?? [];
  const personsList = persons?.results ?? [];

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="space-y-6"
    >
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">{sourceText("From")}</CardTitle></CardHeader>
          <CardContent>
            <EntitySelector
              label={sourceText("Source entity")} type={fromType} id={fromId}
              onTypeChange={setFromType} onIdChange={setFromId}
              locked={mode === "edit" && !!initial}
              companies={companiesList} persons={personsList}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{sourceText("To")}</CardTitle></CardHeader>
          <CardContent>
            <EntitySelector
              label={sourceText("Destination entity")} type={toType} id={toId}
              onTypeChange={setToType} onIdChange={setToId}
              locked={mode === "edit" && !!initial}
              companies={companiesList} persons={personsList}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{sourceText("Details")}</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>{sourceText("Amount")}</Label>
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>{sourceText("Currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MAD">MAD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{sourceText("Transfer Date")}</Label>
            <ScheduleDate value={date} onChange={setDate} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>{sourceText("Note")} <span className="text-muted-foreground text-xs">{sourceText("(optional)")}</span></Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={sourceText("Any relevant details about this transfer...")} rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>{sourceText("Cancel")}</Button>
        <Button type="submit" className="gap-2" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create Transfer" : "Save Changes"}
        </Button>
      </div>
    </motion.form>
  );
}
