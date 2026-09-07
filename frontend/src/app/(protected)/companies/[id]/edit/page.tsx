"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Save,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useCompany, useUpdateCompany } from "@/features/companies/hooks";
import {
  Company,
  CompanyUpdate,
  CompanyStatus,
} from "@/features/companies/types";
import { toast } from "@/components/ui/toast";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/ui/stat-card";
import { Breadcrumb, PageHeader } from "@/components/ui/page-components";
import { GuidePanel } from "@/components/ui/guide-panel";
const currencies = ["MAD", "USD", "EUR", "GBP"];
const languages = ["fr", "en", "ar"];
const timezones = [
  "Africa/Casablanca",
  "Europe/Paris",
  "UTC",
  "America/New_York",
];
// A local `SummaryTile` used to sit here, unreferenced: the header tiles on this
// page are the shared <StatCard>. Removed so nobody maintains two competing
// tile designs, or reintroduces the inconsistent one by reaching for the
// nearest-looking helper.

function companyToFormData(company: Company): CompanyUpdate {
  return {
    name: company.name,
    trade_name: company.trade_name || "",
    registration_number: company.registration_number,
    tax_id: company.tax_id,
    vat_number: company.vat_number || "",
    address: company.address,
    phone: company.phone,
    email: company.email,
    website: company.website || "",
    default_currency: company.default_currency,
    timezone: company.timezone,
    default_language: company.default_language || "fr",
    status: company.status,
  };
}
export default function EditCompanyPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { data: company, isLoading, error } = useCompany(companyId);
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !company) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-red-600">
          <SourceText source="Failed to load company." leading />{" "}
          <Link href="/companies" className="underline">
            <SourceText source="Go back" leading trailing />
          </Link>
        </p>
      </div>
    );
  }
  if (company.is_archived) {
    return (
      <div className="container mx-auto max-w-xl py-8 text-center space-y-4">
        <p className="text-amber-700">
          <SourceText
            source="Archived companies cannot be edited. Restore this company first."
            leading
            trailing
          />
        </p>
        <Button asChild variant="outline">
          <Link href="/companies?archive_state=archived">
            <SourceText source="Back to archived companies" leading trailing />
          </Link>
        </Button>
      </div>
    );
  }
  return <CompanyEditForm key={company.id} company={company} />;
}
function CompanyEditForm({ company }: { company: Company }) {
  const router = useRouter();
  const companyId = company.id;
  const updateCompany = useUpdateCompany();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CompanyUpdate>(() =>
    companyToFormData(company),
  );
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name?.trim())
      newErrors.name = sourceText("Company name is required.");
    if (!formData.registration_number?.trim())
      newErrors.registration_number = sourceText(
        "Registration number is required.",
      );
    if (!formData.tax_id?.trim())
      newErrors.tax_id = sourceText("Tax ID is required.");
    if (!formData.address?.trim())
      newErrors.address = sourceText("Address is required.");
    if (!formData.phone?.trim())
      newErrors.phone = sourceText("Phone is required.");
    if (!formData.email?.trim())
      newErrors.email = sourceText("Email is required.");
    else if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    )
      newErrors.email = sourceText("Invalid email format.");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await updateCompany.mutateAsync({ id: companyId, data: formData });
      toast.success(sourceText("Company updated successfully"));
      router.push(`/companies/${companyId}`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.detail || sourceText("Failed to update company"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };
  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-8">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Companies");
            },
            href: "/companies",
          },
          {
            label: company.name,
            href: `/companies/${companyId}`,
          },
          {
            get label() {
              return sourceText("Edit Company");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHeader
        title={sourceText("Edit Company")}
        description={sourceText(
          "Update company information, defaults and operational contact details.",
        )}
        action={
          <Button variant="outline" asChild>
            <Link href={`/companies/${companyId}`}>
              <ArrowLeft className="me-2 h-4 w-4" />
              <SourceText source="Back to Company" leading trailing />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Building2} label={sourceText("Reference")} value={company.reference || sourceText("Unavailable")} tone="primary" />
          <StatCard icon={Save} label={sourceText("Status")} value={sourceText(formData.status || "active")} tone="indigo" />
          <StatCard icon={Globe} label={sourceText("Currency")} value={formData.default_currency || sourceText("Unavailable")} tone="emerald" />
          <StatCard icon={Mail} label={sourceText("Language")} value={sourceText(formData.default_language === "fr" ? "French" : formData.default_language === "ar" ? "Arabic" : "English")} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Company profile guide"}
          title={"Keep legal identity, defaults and contact channels aligned"}
          body={"Use this page to keep company metadata reliable so financial records, payroll outputs and notifications inherit the right defaults."}
          items={[
            "Validate legal identifiers carefully because they appear in generated documents and exports.",
            "Keep default language, currency and timezone consistent with operational reality.",
            "Update contact details here so teams can reuse accurate company information everywhere.",
          ]}
        />
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Company Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <SourceText source="Company Information" leading trailing />
            </CardTitle>
            <CardDescription>
              <SourceText
                source="Basic company identification and legal information"
                leading
                trailing
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2 min-w-0">
                <Label htmlFor="name">
                  <SourceText source="Company Name *" />
                </Label>
                <Input className="w-full"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder={sourceText("Enter company name")}
                  error={errors.name}
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="trade_name">
                  <SourceText source="Trade Name" />
                </Label>
                <Input className="w-full"
                  id="trade_name"
                  name="trade_name"
                  value={formData.trade_name}
                  onChange={handleChange}
                  placeholder={sourceText("Commercial/trade name (optional)")}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="registration_number">
                  <SourceText source="Registration Number *" leading trailing />
                </Label>
                <Input className="w-full"
                  id="registration_number"
                  name="registration_number"
                  value={formData.registration_number}
                  onChange={handleChange}
                  placeholder={sourceText("RC number")}
                  error={errors.registration_number}
                />
                {errors.registration_number && (
                  <p className="text-sm text-red-600">
                    {errors.registration_number}
                  </p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="tax_id">
                  <SourceText source="Tax ID (IF) *" />
                </Label>
                <Input className="w-full"
                  id="tax_id"
                  name="tax_id"
                  value={formData.tax_id}
                  onChange={handleChange}
                  placeholder={sourceText("Identifiant Fiscal")}
                  error={errors.tax_id}
                />
                {errors.tax_id && (
                  <p className="text-sm text-red-600">{errors.tax_id}</p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="vat_number">
                  <SourceText source="VAT Number (ICE)" />
                </Label>
                <Input className="w-full"
                  id="vat_number"
                  name="vat_number"
                  value={formData.vat_number}
                  onChange={handleChange}
                  placeholder={sourceText("Identifiant Commun de l'Entreprise")}
                />
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 min-w-0">
                <Label htmlFor="status">
                  <SourceText source="Status" />
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      status: v as CompanyStatus,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <SourceText source="Active" />
                    </SelectItem>
                    <SelectItem value="inactive">
                      <SourceText source="Inactive" />
                    </SelectItem>
                    <SelectItem value="suspended">
                      <SourceText source="Suspended" />
                    </SelectItem>
                    <SelectItem value="archived">
                      <SourceText source="Archived" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="default_currency">
                  <SourceText source="Default Currency" />
                </Label>
                <Select
                  value={formData.default_currency}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, default_currency: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="timezone">
                  <SourceText source="Timezone" />
                </Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, timezone: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="default_language">
                  <SourceText source="Default Language" />
                </Label>
                <Select
                  value={formData.default_language}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, default_language: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">
                      <SourceText source="French" />
                    </SelectItem>
                    <SelectItem value="en">
                      <SourceText source="English" />
                    </SelectItem>
                    <SelectItem value="ar">
                      <SourceText source="Arabic" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <SourceText source="Contact Information" leading trailing />
            </CardTitle>
            <CardDescription>
              <SourceText
                source="Company contact details and location"
                leading
                trailing
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="address">
                <SourceText source="Address *" />
              </Label>
              <Input className="w-full"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder={sourceText("Full address")}
                error={errors.address}
              />
              {errors.address && (
                <p className="text-sm text-red-600">{errors.address}</p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="phone">
                  <SourceText source="Phone *" />
                </Label>
                <Input className="w-full"
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder={sourceText("+212 5 XX XX XX XX")}
                  error={errors.phone}
                />
                {errors.phone && (
                  <p className="text-sm text-red-600">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="email">
                  <SourceText source="Email *" />
                </Label>
                <Input className="w-full"
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder={sourceText("company@example.com")}
                  error={errors.email}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label htmlFor="website">
                  <SourceText source="Website" />
                </Label>
                <Input className="w-full"
                  id="website"
                  name="website"
                  type="url"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder={sourceText("https://example.com")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex justify-end gap-4 pt-4 border-t">
          <Link href={`/companies/${companyId}`}>
            <Button type="button" variant="outline">
              <ArrowLeft className="me-2 h-4 w-4" />
              <SourceText source="Cancel" leading trailing />
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting || updateCompany.isPending}
          >
            <Save className="me-2 h-4 w-4" />
            {isSubmitting || updateCompany.isPending ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Saving..." leading trailing />
              </>
            ) : (
              <SourceText source="Save Changes" leading trailing />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
