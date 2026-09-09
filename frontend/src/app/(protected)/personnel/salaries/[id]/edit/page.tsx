"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useUpdateSalary,
  useSalaryDetail,
} from "@/features/personnel/hooks";
import { toast } from "@/components/ui/toast";
import { ScheduleDate } from "@/components/ui/schedule-date";
import type { EmploymentSalary } from "@/features/personnel/types";
const updateSalarySchema = z.object({
  person: z.string().min(1, "Employee is required"),
  employment: z.string().min(1, "Employment is required"),
  fixed_monthly_gross_salary: z.coerce
    .number()
    .min(0, "The salary must be greater than or equal to 0"),
  effective_from: z.string().min(1, "Effective date is required"),
  effective_to: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});
type UpdateSalaryForm = z.infer<typeof updateSalarySchema>;

const sanitizeSalaryPayload = (data: UpdateSalaryForm): UpdateSalaryForm => ({
  ...data,
  effective_from: data.effective_from.trim(),
  effective_to: data.effective_to?.trim() || undefined,
  reason: data.reason?.trim() || undefined,
  notes: data.notes?.trim() || undefined,
});

function toSalaryFormValues(salaryData: EmploymentSalary): UpdateSalaryForm {
  return {
    person: String(salaryData.person ?? ""),
    employment: String(salaryData.employment ?? ""),
    fixed_monthly_gross_salary: Number(salaryData.fixed_monthly_gross_salary),
    effective_from: salaryData.effective_from
      ? salaryData.effective_from.split("T")[0]
      : "",
    effective_to: salaryData.effective_to
      ? salaryData.effective_to.split("T")[0]
      : "",
    reason: salaryData.reason || "",
    notes: salaryData.notes || "",
  };
}

export default function EditSalaryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: salaryData, isLoading, error } = useSalaryDetail(id);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error || !salaryData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <p className="text-red-600">
          <SourceText source="Failed to load salary data" />
        </p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back to List" leading trailing />
        </Button>
      </div>
    );
  }
  return <SalaryEditForm key={salaryData.id} salaryData={salaryData} />;
}

function SalaryEditForm({ salaryData }: { salaryData: EmploymentSalary }) {
  const router = useRouter();
  const id = salaryData.id;
  const updateMutation = useUpdateSalary();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateSalaryForm>({
    resolver: zodResolver(updateSalarySchema),
    defaultValues: toSalaryFormValues(salaryData),
  });
  const onSubmit = async (data: UpdateSalaryForm) => {
    setIsSubmitting(true);
    try {
      const payload = sanitizeSalaryPayload(data);
      await updateMutation.mutateAsync({
        id,
        data: {
          employment: payload.employment,
          fixed_monthly_gross_salary: payload.fixed_monthly_gross_salary,
          effective_from: payload.effective_from,
          effective_to: payload.effective_to,
          reason: payload.reason,
          notes: payload.notes,
        },
      });
      toast.success(sourceText("Salary updated successfully"));
      router.push(`/personnel/salaries/${id}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || sourceText("Failed to update salary"));
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
            label: salaryData?.reference || sourceText("Loading…"),
            href: `/personnel/salaries/${id}`,
          },
          {
            get label() {
              return sourceText("Edit");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Edit Salary")}
        description={`${sourceText("Update details for")} ${salaryData?.reference || sourceText("salary")}`}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to Profile" leading trailing />
          </Button>
        }
      />

      {/* Form */}
      <form key={salaryData?.id} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <SourceText source="Salary Details" leading trailing />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">
                <SourceText source="Employee and employment (cannot be changed)" />
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    <SourceText source="Employee" />
                  </Label>
                  <Input
                    value={salaryData?.person_name || sourceText("—")}
                    disabled
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    <SourceText source="Employment" />
                  </Label>
                  <Input
                    value={
                      [salaryData?.employment_reference, salaryData?.company_name]
                        .filter(Boolean)
                        .join(" · ") || sourceText("—")
                    }
                    disabled
                    readOnly
                  />
                </div>
              </div>
              <input type="hidden" {...register("person")} />
              <input type="hidden" {...register("employment")} />
            </div>

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
                    {sourceText(String(errors.fixed_monthly_gross_salary.message))}
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
                    {sourceText(String(errors.effective_from.message))}
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
                  onChange={(val) => setValue("effective_to", val, { shouldDirty: true })}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Updating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Update Salary" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
