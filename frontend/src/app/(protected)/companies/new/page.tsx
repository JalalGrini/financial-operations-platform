"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Loader2,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  Save,
  ArrowLeft,
} from "lucide-react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useCreateCompany } from "@/features/companies/hooks";
import { CompanyCreate } from "@/features/companies/types";
import { toast } from "@/components/ui/toast";
import { Separator } from "@/components/ui/separator";
import { CompanyComplementaryFields } from "@/features/companies/components/CompanyComplementaryFields";
const currencies = ["MAD", "USD", "EUR", "GBP"];
const languages = ["fr", "en", "ar"];
const timezones = [
  "Africa/Casablanca",
  "Europe/Paris",
  "UTC",
  "America/New_York",
];
export default function NewCompanyPage() {
  const router = useRouter();
  const createCompany = useCreateCompany();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CompanyCreate>({
    name: "",
    trade_name: "",
    registration_number: "",
    tax_id: "",
    vat_number: "",
    cnss_number: "",
    patent_number: "",
    rib: "",
    activities: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    default_currency: "MAD",
    timezone: "Africa/Casablanca",
    default_language: "fr",
  });
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name?.trim())
      newErrors.name = sourceText("Company name is required");
    if (!formData.registration_number?.trim())
      newErrors.registration_number = sourceText(
        "Registration number is required",
      );
    if (!formData.tax_id?.trim())
      newErrors.tax_id = sourceText("Tax ID is required");
    if (!formData.address?.trim())
      newErrors.address = sourceText("Address is required");
    if (!formData.phone?.trim())
      newErrors.phone = sourceText("Phone is required");
    if (!formData.email?.trim())
      newErrors.email = sourceText("Email is required");
    else if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    )
      newErrors.email = sourceText("Invalid email format");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await createCompany.mutateAsync(formData);
      toast.success(sourceText("Company created successfully"));
      router.replace("/companies");
    } catch (error: any) {
      console.error("Create company error:", error);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);
      toast.error(
        error.response?.data?.detail || error.response?.data?.errors
          ? JSON.stringify(error.response.data.errors)
          : sourceText("Failed to create company"),
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
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/companies"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              <SourceText source="New Company" />
            </h1>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
              <SourceText source="Create a new company profile" />
            </p>
          </div>
        </div>
      </div>

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
                  <SourceText source="Identifiant Commun de l'Entreprise" />
                </Label>
                <Input className="w-full"
                  id="vat_number"
                  name="vat_number"
                  value={formData.vat_number}
                  onChange={handleChange}
                  placeholder={sourceText("Identifiant Commun de l'Entreprise")}
                />
              </div>

              <CompanyComplementaryFields values={formData} onChange={handleChange} />

              <Separator className="my-4" />

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
          <Link href="/companies">
            <Button type="button" variant="outline">
              <ArrowLeft className="me-2 h-4 w-4" />
              <SourceText source="Cancel" leading trailing />
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting || createCompany.isPending}
          >
            <Save className="me-2 h-4 w-4" />
            {isSubmitting || createCompany.isPending ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Creating..." leading trailing />
              </>
            ) : (
              <SourceText source="Create Company" leading trailing />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
