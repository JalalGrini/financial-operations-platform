import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCompanyView } from "@/components/landing/PublicCompanyView";
import { getPublicCompanyCard } from "@/components/landing/public-company-cards";
import { getPublicCompany } from "@/components/landing/public-companies";

export function companyPageMetadata(slug: string): Metadata {
  const company = getPublicCompany(slug);
  const card = getPublicCompanyCard(slug);
  if (!company) return { title: "Groupe 3.R.B" };
  return {
    title: `${company.name} · Groupe 3.R.B`,
    description: card?.body ?? company.tagline,
  };
}

export function MarketingCompanyPage({ slug }: { slug: string }) {
  if (!getPublicCompany(slug) || !getPublicCompanyCard(slug)) notFound();
  return <PublicCompanyView slug={slug} />;
}
