"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SourceText } from "@/components/i18n/SourceText";
import React, { useState, useMemo } from "react";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Hash,
  Loader2,
  Mail,
  X,
  AlertCircle,
} from "lucide-react";
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
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import {
  useUpdatePersonnel,
  usePersonnelDetail,
  useCompanies,
} from "@/features/personnel/hooks";
import { PersonnelStatus, type PersonnelPersonDetail } from "@/features/personnel/types";
import { toast } from "@/components/ui/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { WriteOnly } from "@/components/auth/WriteOnly";
import { personnelApi } from "@/features/personnel/api";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { GuidePanel } from "@/components/ui/guide-panel";
import { GROUP_COMPANY_VALUE, companySelectValue, companyFieldToApi } from "@/lib/company-scope";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

const updatePersonnelSchema = z.object({
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
  status: z.nativeEnum(PersonnelStatus),
  notes: z.string().optional(),
  observations: z.string().optional(),
  company: z.string().min(1, "Select a valid company"),
});
type UpdatePersonnelForm = z.infer<typeof updatePersonnelSchema>;
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
function toPersonnelFormValues(personnelData: PersonnelPersonDetail): UpdatePersonnelForm {
  return {
    first_name: personnelData.first_name,
    last_name: personnelData.last_name,
    middle_name: personnelData.middle_name || "",
    cin: personnelData.cin || "",
    phone: personnelData.phone || "",
    email: personnelData.email || "",
    address: personnelData.address || "",
    city: personnelData.city || "",
    province: personnelData.province || "",
    region: personnelData.region || "",
    date_of_birth: personnelData.date_of_birth
      ? personnelData.date_of_birth.split("T")[0]
      : "",
    nationality: personnelData.nationality || "",
    status: statusOptions.some((option) => option.value === personnelData.status)
      ? personnelData.status
      : PersonnelStatus.ACTIVE,
    notes: personnelData.notes || "",
    observations: personnelData.observations || "",
    company: companySelectValue(personnelData.company),
  };
}
function SummaryTile({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/90 shadow-[0_12px_28px_rgba(15,23,42,.05)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
          <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export default function EditPersonnelPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: personnelData, isLoading, error } = usePersonnelDetail(id);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error || !personnelData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <p className="text-red-600">
          <SourceText source="Failed to load personnel data" />
        </p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="me-2 h-4 w-4" />
          <SourceText source="Back to List" leading trailing />
        </Button>
      </div>
    );
  }
  return (
    <PersonnelEditForm key={personnelData.id} personnelData={personnelData} />
  );
}

function PersonnelEditForm({
  personnelData,
}: {
  personnelData: PersonnelPersonDetail;
}) {
  const router = useRouter();
  /**
   * Profile photo: add, change, remove.
   *
   * All of this existed as dead code. `photoFile`, `photoPreview`,
   * `handlePhotoChange` and `handlePhotoDelete` were declared here and
   * referenced by nothing, `EmployeeAvatar` was imported and never rendered, and
   * `personnelApi.updateWithPhoto` was never called - so `onSubmit` sent plain
   * JSON and a photo could not be saved from this screen at all. The model field
   * and the serializer have supported it the whole time.
   *
   * `photoRemoved` is the piece that was actually missing. The old
   * `handlePhotoDelete` only cleared local state, so on a person who already had
   * a stored photo it discarded nothing and the photo survived the save. Removal
   * has to be an intent that reaches the server.
   */
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = React.useState(false);

  const handlePhotoChange = (file: File) => {
    setPhotoFile(file);
    setPhotoRemoved(false);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePhotoDelete = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(true);
  };

  const id = personnelData.id;
  const updateMutation = useUpdatePersonnel();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: companies } = useCompanies();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdatePersonnelForm>({
    resolver: zodResolver(updatePersonnelSchema),
    defaultValues: toPersonnelFormValues(personnelData),
  });
  const statusValue = useWatch({ control, name: "status" });
  const companyId = useWatch({ control, name: "company" });
  const statusLabelMap: Record<PersonnelStatus, string> = Object.fromEntries(
    statusOptions.map((option) => [option.value, option.label]),
  ) as Record<PersonnelStatus, string>;

  const formatDateValue = (value?: string | null) => {
    if (!value) return sourceText("Not provided");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(localeTag(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parsed);
  };

  const originalValues = useMemo(
    () => toPersonnelFormValues(personnelData),
    [personnelData],
  );
  const formDirty = useFormDirty(originalValues, watch());
  const onSubmit = async (data: UpdatePersonnelForm) => {
    setIsSubmitting(true);
    const payload = {
      ...data,
      company: companyFieldToApi(data.company),
    };
    try {
      if (photoFile) {
        // A new image needs multipart. Every scalar field is appended too, so
        // this is one request rather than a JSON save followed by an upload -
        // two requests could leave the row updated and the photo missing.
        const form = new FormData();
        const allowed = [
          "first_name",
          "last_name",
          "middle_name",
          "cin",
          "phone",
          "email",
          "address",
          "city",
          "province",
          "region",
          "date_of_birth",
          "nationality",
          "notes",
          "observations",
          "status",
        ] as const;
        for (const key of allowed) {
          const value = data[key];
          if (value === undefined || value === null || value === "") continue;
          form.append(key, String(value));
        }
        form.append("company", data.company || GROUP_COMPANY_VALUE);
        form.append("photo", photoFile, photoFile.name);
        await personnelApi.updateWithPhoto(id, form);
      } else if (photoRemoved) {
        // `photo` is a nullable ImageField, so DRF's generated field is
        // allow_null=True and an explicit null clears it. Sent as JSON: an
        // empty multipart value is not reliably interpreted as "clear this
        // file", whereas null is unambiguous. With no photo stored,
        // EmployeeAvatar falls back to the initials tile.
        await updateMutation.mutateAsync({
          id,
          data: { ...payload, photo: null } as typeof payload,
        });
      } else {
        await updateMutation.mutateAsync({ id, data: payload });
      }
      toast.success(sourceText("Personnel updated successfully"));
      router.push(`/personnel/personnel/${id}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || sourceText("Failed to update personnel"));
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
            label: personnelData?.full_name || sourceText("Loading..."),
            href: `/personnel/personnel/${id}`,
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
        title={sourceText("Edit Personnel")}
        description={`${sourceText("Update details for")} ${personnelData?.full_name || sourceText("personnel")}`}
        action={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to Profile" leading trailing />
          </Button>
        }
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={Hash} label={sourceText("Reference")} value={personnelData?.reference || sourceText("Unavailable")} tone="primary" />
          <StatCard icon={Check} label={sourceText("Status")} value={statusValue ? statusLabelMap[statusValue] || sourceText("Unknown") : sourceText("Unknown")} tone="indigo" />
          <StatCard icon={Mail} label={sourceText("Email")} value={personnelData?.email || sourceText("No email")} tone="emerald" />
          <StatCard icon={CalendarDays} label={sourceText("Birth date")} value={formatDateValue(personnelData?.date_of_birth)} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Personnel profile guide"}
          title={"Keep identity, status and contact data consistent"}
          body={"Use this form to improve profile quality without breaking downstream employment, payroll and CNSS workflows."}
          items={[
            "Keep names and contact details complete so payroll and HR teams can identify the right person quickly.",
            "Update status carefully because it affects how the person appears across personnel operations.",
            "Use notes and observations for internal context that should stay with the record.",
          ]}
        />
      </section>

      {/* Form */}
      <form key={personnelData?.id} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Personal Information" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Profile photo. Optional by design: with none stored,
              * EmployeeAvatar renders a deterministic initials tile, so a person
              * never shows a broken image. Hover the avatar to replace, use the
              * badge to remove. Wrapped in WriteOnly because uploading is a
              * write - a Director may read this screen but not change the photo. */}
            <WriteOnly>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <EmployeeAvatar
                  size="xl"
                  editable
                  photo={
                    photoRemoved ? null : (photoPreview ?? personnelData?.photo)
                  }
                  firstName={personnelData?.first_name}
                  lastName={personnelData?.last_name}
                  fullName={personnelData?.full_name}
                  onPhotoChange={handlePhotoChange}
                  onPhotoDelete={handlePhotoDelete}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <SourceText source="Profile photo" />
                  </p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                    <SourceText source="Optional. Click the avatar to upload or replace it, or remove it to fall back to the initials." />
                  </p>
                  {photoFile && (
                    <p className="mt-2 text-xs font-medium text-emerald-600">
                      <SourceText source="New photo will be saved when you submit." />
                    </p>
                  )}
                  {photoRemoved && (
                    <p className="mt-2 text-xs font-medium text-amber-600">
                      <SourceText source="Photo will be removed when you submit." />
                    </p>
                  )}
                </div>
              </div>
            </WriteOnly>
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
                    {sourceText(errors.first_name.message ?? "")}
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
                    {sourceText(errors.last_name.message ?? "")}
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
          <Button type="submit" disabled={isSubmitting || (!formDirty && !photoFile && !photoRemoved)}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Updating..." leading trailing />
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                <SourceText source="Update Personnel" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
