"use client";

import { SourceText } from "@/components/i18n/SourceText";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sourceText } from "@/lib/i18n/source-catalog";

export function EmploymentPayoutFields({
  payoutMethod,
  rib,
  ribError,
  disabled,
  onPayoutChange,
  onRibChange,
}: {
  payoutMethod: "cash" | "bank" | undefined;
  rib: string;
  ribError?: string;
  disabled?: boolean;
  onPayoutChange: (value: "cash" | "bank") => void;
  onRibChange: (value: string) => void;
}) {
  const method = payoutMethod || "cash";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="payout_method">
          <SourceText source="Payment Method" />
        </Label>
        <Select
          value={method}
          onValueChange={(value) => onPayoutChange(value as "cash" | "bank")}
          disabled={disabled}
        >
          <SelectTrigger id="payout_method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">
              <SourceText source="Espèces" />
            </SelectItem>
            <SelectItem value="bank">
              <SourceText source="Virement bancaire" />
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {method === "bank" ? (
        <div className="space-y-2">
          <Label htmlFor="rib">
            <SourceText source="RIB" />
          </Label>
          <Input
            id="rib"
            value={rib}
            onChange={(event) => onRibChange(event.target.value)}
            placeholder={sourceText("RIB")}
            disabled={disabled}
          />
          {ribError ? <p className="text-sm text-red-600">{sourceText(ribError)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function employmentPayoutLabel(
  payoutMethod: "cash" | "bank" | undefined,
  rib?: string | null,
): string {
  if (payoutMethod === "bank") {
    return `${sourceText("Virement bancaire")} — RIB: ${rib?.trim() || sourceText("—")}`;
  }
  return sourceText("Espèces");
}
