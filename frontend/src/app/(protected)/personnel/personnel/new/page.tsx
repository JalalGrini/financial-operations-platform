"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, X, Check, AlertCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Separator } from "@/components/ui/separator";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { useCreatePersonnel, useCompanies } from "@/features/personnel/hooks";
import { PersonnelStatus } from "@/features/personnel/types";
import { toast } from "@/components/ui/toast";
import { GROUP_COMPANY_VALUE, companyFieldToApi } from "@/lib/company-scope";
import { SourceText } from "@/components/i18n/SourceText";
import { ScheduleDate } from "@/components/ui/schedule-date";
const createPersonnelSchema = z.object({
  first_name: z.string().min(1, "First name is required."),
  last_name: z.string().min(1, "Last name is required."),
  middle_name: z.string().optional(),
  cin: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .email("Invalid email address.")
    .optional()
    .or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  region: z.string().optional(),
  date_of_birth: z.string().optional(),
  nationality: z.string().optional(),
  status: z.nativeEnum(PersonnelStatus).default(PersonnelStatus.ACTIVE),
  notes: z.string().optional(),
  observations: z.string().optional(),
  company: z.string().min(1, "Select a valid company"),
});
type CreatePersonnelForm = z.infer<typeof createPersonnelSchema>;
const statusOptions = [
  {
    value: PersonnelStatus.ACTIVE,
    get label() {
      return sourceText("Active");
    },
  },
  {
    value: PersonnelStatus.INACTIVE,
    get label() {
      return sourceText("Inactive");
    },
  },
  {
    value: PersonnelStatus.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: PersonnelStatus.TERMINATED,
    get label() {
      return sourceText("Terminated");
    },
  },
  {
    value: PersonnelStatus.ARCHIVED,
    get label() {
      return sourceText("Archived");
    },
  },
];
export default function CreatePersonnelPage() {
  const router = useRouter();
  const createMutation = useCreatePersonnel();
  const { data: companies } = useCompanies();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreatePersonnelForm>({
    resolver: zodResolver(createPersonnelSchema),
    defaultValues: {
      status: PersonnelStatus.ACTIVE,
      company: GROUP_COMPANY_VALUE,
    },
  });
  const statusValue = useWatch({ control, name: "status" });
  const companyId = useWatch({ control, name: "company" });
  const onSubmit = async (data: CreatePersonnelForm) => {
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync({
        ...data,
        company: companyFieldToApi(data.company),
      });
      toast.success(sourceText("Personnel created successfully"));
      router.push("/personnel/personnel");
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create personnel");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancel = () => {
    router.back();
  };
  return (
    <div className="space-y-6 min-w-0">
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
              return sourceText("Personnel List");
            },
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("Create Personnel");
            },
            isCurrent: true,
          },
        ]}
      />

      {/* Page Header */}
      <PageHeader
        title={sourceText("Create Personnel")}
        description={sourceText("Add a new personnel record to the system")}
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
            <CardTitle>
              <SourceText source="Personal Information" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="first_name">
                  <SourceText source="First Name *" />
                </Label>
                <Input className="w-full"
                  id="first_name"
                  placeholder={sourceText("Enter first name")}
                  {...register("first_name")}
                  disabled={isSubmitting}
                />
                {errors.first_name && (
                  <p className="text-sm text-red-600">
                    {sourceText(String(errors.first_name.message))}
                  </p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="last_name">
                  <SourceText source="Last Name *" />
                </Label>
                <Input className="w-full"
                  id="last_name"
                  placeholder={sourceText("Enter last name")}
                  {...register("last_name")}
                  disabled={isSubmitting}
                />
                {errors.last_name && (
                  <p className="text-sm text-red-600">
                    {sourceText(String(errors.last_name.message))}
                  </p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="middle_name">
                  <SourceText source="Middle Name" />
                </Label>
                <Input className="w-full"
                  id="middle_name"
                  placeholder={sourceText("Enter middle name (optional)")}
                  {...register("middle_name")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="cin">
                  <SourceText source="CIN" />
                </Label>
                <Input className="w-full"
                  id="cin"
                  placeholder={sourceText("National ID (optional)")}
                  {...register("cin")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="phone">
                  <SourceText source="Phone" />
                </Label>
                <Input className="w-full"
                  id="phone"
                  type="tel"
                  placeholder={sourceText("Enter phone number (optional)")}
                  {...register("phone")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="email">
                  <SourceText source="Email" />
                </Label>
                <Input className="w-full"
                  id="email"
                  type="email"
                  placeholder={sourceText("Enter email (optional)")}
                  {...register("email")}
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{sourceText(String(errors.email.message))}</p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="date_of_birth">
                  <SourceText source="Date of Birth" />
                </Label>
                <ScheduleDate
                  id="date_of_birth"
                  value={watch("date_of_birth") ?? ""}
                  onChange={(val) => setValue("date_of_birth", val, { shouldDirty: true, shouldValidate: true })}
                  disabled={(isSubmitting)}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="nationality">
                  <SourceText source="Nationality" />
                </Label>
                <Input className="w-full"
                  id="nationality"
                  placeholder={sourceText("Enter nationality (optional)")}
                  {...register("nationality")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="company">
                  <SourceText source="Company affiliation" />
                </Label>
                <Select
                  value={companyId ?? ""}
                  onValueChange={(value) => {
                    setValue("company", value, { shouldDirty: true, shouldValidate: true });
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={sourceText("Select company")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GROUP_COMPANY_VALUE}>
                      {sourceText("Tout le groupe")}
                    </SelectItem>
                    {companies?.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name} ({company.reference})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  <SourceText source="Connect this person to a company, or to the whole group." />
                </p>
                {errors.company && (
                  <p className="text-sm text-red-600">
                    {sourceText(errors.company.message || "Select a valid company")}
                  </p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="status">
                  <SourceText source="Status *" />
                </Label>
                <Select
                  value={statusValue ?? ""}
                  onValueChange={(value) =>
                    setValue("status", value as PersonnelStatus, { shouldDirty: true })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={sourceText("Select status")} />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="address">
                  <SourceText source="Address" />
                </Label>
                <Input className="w-full"
                  id="address"
                  placeholder={sourceText("Enter address (optional)")}
                  {...register("address")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="city">
                  <SourceText source="City" />
                </Label>
                <Input className="w-full"
                  id="city"
                  placeholder={sourceText("Enter city (optional)")}
                  {...register("city")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="province">
                  <SourceText source="Province" />
                </Label>
                <Input className="w-full"
                  id="province"
                  placeholder={sourceText("Enter province (optional)")}
                  {...register("province")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="region">
                  <SourceText source="Region" />
                </Label>
                <Input className="w-full"
                  id="region"
                  placeholder={sourceText("Enter region (optional)")}
                  {...register("region")}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2 min-w-0">
              <Label htmlFor="notes">
                <SourceText source="Notes" />
              </Label>
              <textarea
                id="notes"
                rows={3}
                className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200"
                placeholder={sourceText("Additional notes (optional)")}
                {...register("notes")}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="observations">
                <SourceText source="Observations" />
              </Label>
              <textarea
                id="observations"
                rows={3}
                className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200"
                placeholder={sourceText("Internal observations (optional)")}
                {...register("observations")}
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
                <SourceText source="Create Personnel" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
