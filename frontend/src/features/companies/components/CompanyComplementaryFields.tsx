"use client";

import { SourceText } from "@/components/i18n/SourceText";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sourceText } from "@/lib/i18n/source-catalog";

export type CompanyComplementaryValues = {
  cnss_number?: string;
  patent_number?: string;
  rib?: string;
  activities?: string;
};

export function CompanyComplementaryFields({
  values,
  onChange,
}: {
  values: CompanyComplementaryValues;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <details className="rounded-lg border bg-card md:col-span-2">
      <summary className="cursor-pointer p-5 font-semibold">
        <SourceText source="Informations complémentaires" leading trailing />
      </summary>
      <div className="grid gap-4 border-t p-5 md:grid-cols-2">
        <div className="space-y-2 min-w-0">
          <Label htmlFor="cnss_number">
            <SourceText source="Numéro CNSS" />
          </Label>
          <Input
            className="w-full"
            id="cnss_number"
            name="cnss_number"
            value={values.cnss_number || ""}
            onChange={onChange}
            placeholder={sourceText("Numéro CNSS")}
          />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="patent_number">
            <SourceText source="Patente" />
          </Label>
          <Input
            className="w-full"
            id="patent_number"
            name="patent_number"
            value={values.patent_number || ""}
            onChange={onChange}
            placeholder={sourceText("Patente")}
          />
        </div>
        <div className="space-y-2 min-w-0">
          <Label htmlFor="rib">
            <SourceText source="RIB" />
          </Label>
          <Input
            className="w-full"
            id="rib"
            name="rib"
            value={values.rib || ""}
            onChange={onChange}
            placeholder={sourceText("RIB")}
          />
        </div>
        <div className="space-y-2 min-w-0 md:col-span-2">
          <Label htmlFor="activities">
            <SourceText source="Activités" />
          </Label>
          <Textarea
            id="activities"
            name="activities"
            value={values.activities || ""}
            onChange={onChange}
            placeholder={sourceText("Activités")}
          />
        </div>
      </div>
    </details>
  );
}
