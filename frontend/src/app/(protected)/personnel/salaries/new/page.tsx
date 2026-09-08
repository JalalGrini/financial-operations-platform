"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  Briefcase,
  Calendar,
  CreditCard,
  Search,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
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
import { Combobox } from "@/components/ui/searchable-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useCreateSalary,
  usePersonnelSelect,
  useEmploymentsByPerson,
} from "@/features/personnel/hooks";
import { toast } from "@/components/ui/toast";
import { ScheduleDate } from "@/components/ui/schedule-date";
const createSalarySchema = z.object({
  person: z.string().min(1, "Le salarié est obligatoire"),
  employment: z.string().min(1, "L'emploi est obligatoire"),
  fixed_monthly_gross_salary: z.coerce
    .number()
    .min(0, "Le salaire doit être supérieur ou égal à 0"),
  effective_from: z.string().min(1, "La date d'effet est obligatoire"),
  effective_to: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});
type CreateSalaryForm = z.infer<typeof createSalarySchema>;

const sanitizeSalaryPayload = (data: CreateSalaryForm): CreateSalaryForm => ({
  ...data,
  effective_from: data.effective_from.trim(),
  effective_to: data.effective_to?.trim() || undefined,
  reason: data.reason?.trim() || undefined,
  notes: data.notes?.trim() || undefined,
});
export default function CreateSalaryPage() {
  const router = useRouter();
  const createMutation = useCreateSalary();
  const { data: personnelOptions } = usePersonnelSelect();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateSalaryForm>({
    resolver: zodResolver(createSalarySchema),
    defaultValues: {},
  });
  const personId = useWatch({ control, name: "person" });
  const employmentId = useWatch({ control, name: "employment" });
  // Fetch employments for selected person
  const { data: employments, isLoading: employmentsLoading } =
    useEmploymentsByPerson(personId);
  const onSubmit = async (data: CreateSalaryForm) => {
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync(sanitizeSalaryPayload(data));
      toast.success(sourceText("Salary created successfully"));
      router.push("/personnel/salaries");
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || sourceText("Failed to create salary"));
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancel = () => {
    router.back();
  };
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("Salaries");
            },
            href: "/personnel/salaries",
          },
          {
            get label() {
              return sourceText("Create Salary");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Create Salary")}
        description={sourceText("Add a new salary record for an employee")}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to List" leading trailing />
          </Button>
        }
      />

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <SourceText source="Salary Details" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Person Selection */}
            <div className="space-y-2">
              <Label htmlFor="person">
                <SourceText source="Employee *" />
              </Label>
              <Combobox
                value={personId ?? ""}
                onChange={(value) => {
                  setValue("person", value, { shouldValidate: true });
                }}
                disabled={isSubmitting}
                placeholder={sourceText("Select employee")}
                searchPlaceholder={sourceText("Search by name, reference or CIN")}
                options={(personnelOptions ?? []).map((p: any) => ({
                  value: p.id,
                  label: p.name,
                  hint: [p.reference, p.cin ? `CIN: ${p.cin}` : null].filter(Boolean).join(" · "),
                }))}
              />
              {errors.person && (
                <p className="text-sm text-red-600">{errors.person.message}</p>
              )}
            </div>

            {/* Employment Selection */}
            {personId && (
              <div className="space-y-2">
                <Label htmlFor="employment">
                  <SourceText source="Employment *" />
                </Label>
                {employmentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    <SourceText
                      source="Loading employments…"
                      leading
                      trailing
                    />
                  </div>
                ) : (
                  <Select
                    value={employmentId ?? ""}
                    onValueChange={(value) => {
                      setValue("employment", value, { shouldValidate: true });
                    }}
                    disabled={
                      isSubmitting || !employments || employments.length === 0
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={sourceText("Select employment")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {employments?.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.person_name} - {e.employee_reference} (
                          {e.company_name}) -{" "}
                          {e.job_title || sourceText("No title")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.employment && (
                  <p className="text-sm text-red-600">
                    {errors.employment.message}
                  </p>
                )}
                {!employmentsLoading &&
                  employments &&
                  employments.length === 0 &&
                  personId && (
                    <p className="text-sm text-amber-600">
                      <SourceText
                        source="No active employments found for this employee"
                        leading
                        trailing
                      />
                    </p>
                  )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fixed_monthly_gross_salary">
                  <SourceText source="Gross Monthly Salary" leading trailing />*
                </Label>
                <Input
                  id="fixed_monthly_gross_salary"
                  type="number"
                  step="any"
                  min="0"
                  {...register("fixed_monthly_gross_salary", {
                    valueAsNumber: true,
                  })}
                  disabled={isSubmitting}
                />
                {errors.fixed_monthly_gross_salary && (
                  <p className="text-sm text-red-600">
                    {errors.fixed_monthly_gross_salary.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective_from">
                  <SourceText source="Effective From *" />
                </Label>
                <ScheduleDate
                  id="effective_from"
                  value={watch("effective_from") ?? ""}
                  onChange={(val) => setValue("effective_from", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting)}
                />
                {errors.effective_from && (
                  <p className="text-sm text-red-600">
                    {errors.effective_from.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective_to">
                  <SourceText source="Effective To (Optional)" />
                </Label>
                <ScheduleDate
                  id="effective_to"
                  value={watch("effective_to") ?? ""}
                  onChange={(val) => setValue("effective_to", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting)}
                />
              </div>
            </div>

            <Separator />

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">
                <SourceText source="Reason" />
              </Label>
              <Input
                id="reason"
                placeholder={sourceText(
                  "e.g., Annual increase, Promotion, Market adjustment",
                )}
                {...register("reason")}
                disabled={isSubmitting}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                <SourceText source="Notes" />
              </Label>
              <textarea
                id="notes"
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder={sourceText("Additional notes (optional)")}
                {...register("notes")}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            <X className="me-2 h-4 w-4" />
            <SourceText source="Cancel" leading trailing />
          </Button>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Creating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Create Salary" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
