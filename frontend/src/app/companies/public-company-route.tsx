import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyPublicPage } from "@/components/landing/CompanyPublicPage";
import { getPublicCompany } from "@/components/landing/public-companies";

export function companyMetadata(slug: string): Metadata {
  const company = getPublicCompany(slug);
  if (!company) return { title: "Entreprise" };
  return {
    title: `${company.name} · Groupe 3.R.B`,
    description: company.tagline,
  };
}

export function PublicCompanyRoute({ slug }: { slug: string }) {
  const company = getPublicCompany(slug);
  if (!company) notFound();
  return <CompanyPublicPage company={company} />;
}
