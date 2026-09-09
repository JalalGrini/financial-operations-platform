"use client";

import { FileText } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <SourceText source="Informations complémentaires" leading trailing />
        </CardTitle>
        <CardDescription>
          <SourceText source="CNSS, patente, RIB and activities for this company." />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
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
      </CardContent>
    </Card>
  );
}
