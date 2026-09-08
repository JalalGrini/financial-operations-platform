"use client";

/**
 * CompaniesSection
 *
 * Content is sourced exclusively from https://3rbextreme.ma/ — every
 * description, service name, and company name is taken verbatim from the
 * published site. No text has been invented.
 *
 * Layout:
 *   A) "Nos Entreprises" overview — one full-width card per company,
 *      alternating image-left / image-right, with a "Nous contacter" CTA
 *      that anchor-scrolls to that company's ticket form.
 *
 *   B) One per-company ticket form below the overview, with the company
 *      field pre-filled and locked (read-only).
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CompanyTicketForm } from "./CompanyTicketForm";
import { ScrollReveal } from "./motion-primitives";
import { CONTAINER, HEADER_BLOCK, SECTION, TYPE } from "./design-system";
import { PUBLIC_COMPANIES, type PublicCompany } from "./public-companies";
import { sourceText } from "@/lib/i18n/source-catalog";
import { GROUP_INTRO_SOURCE } from "./public-company-cards";

/* --------------------------------------------------------------- helpers */

function ServicePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--primary)/0.06)] px-3 py-1 text-[0.75rem] font-semibold text-[hsl(var(--primary))]">
      {sourceText(label)}
    </span>
  );
}

/* ----------------------------------------------- company overview card */

function CompanyCard({
  company,
  index,
}: {
  company: PublicCompany;
  index: number;
}) {
  const reversed = index % 2 !== 0;

  return (
    <ScrollReveal delay={index * 80}>
      <Link
        href={`/companies/${company.slug}`}
        className={`flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--glass))] transition duration-200 hover:scale-[1.02] hover:border-[hsl(var(--primary)/0.28)] dark:bg-[hsl(var(--brand-surface))] lg:flex-row ${
          reversed ? "lg:flex-row-reverse" : ""
        }`}
      >
        <div className="relative h-56 shrink-0 overflow-hidden lg:h-auto lg:w-1/2">
          <Image
            src={company.heroImage}
            alt={company.name}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority={index === 0}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>

        <div className="flex flex-1 flex-col justify-between gap-6 p-8 lg:p-10">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-orange-500))]">
              Groupe 3.R.B
            </p>
            <h3 className={`mt-2 ${TYPE.h2} text-foreground`}>{company.name}</h3>
            <p className="mt-1 text-[0.875rem] font-semibold text-muted-foreground">
              {sourceText(company.tagline)}
            </p>
            <p className="mt-4 text-[1rem] leading-relaxed text-muted-foreground">
              {sourceText(company.description)}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {company.services.slice(0, 4).map((s) => (
                <ServicePill key={s} label={s} />
              ))}
            </div>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-[0.875rem] font-bold text-primary-foreground">
            {sourceText("Discover")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </ScrollReveal>
  );
}

/* ------------------------------------------------- full section export */

export function CompaniesSection() {
  return (
    <>
      {/* ─── A. Overview ─────────────────────────────────────────────── */}
      <section
        id="nos-entreprises"
        className={`${SECTION.base} scroll-mt-16 bg-[hsl(var(--brand-surface))]`}
      >
        <div id="entreprises" className="sr-only" />
        <div className={CONTAINER}>
          {/* Header */}
          <ScrollReveal className="mx-auto max-w-3xl text-center">
            <span className={HEADER_BLOCK.kicker}>Groupe 3.R.B</span>
            <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
              {sourceText("Our companies")}
            </h2>
            <p className={`${HEADER_BLOCK.titleGap} ${HEADER_BLOCK.lead} mx-auto`}>
              {sourceText(GROUP_INTRO_SOURCE)}
            </p>
          </ScrollReveal>

          {/* Company cards */}
          <div className="mt-12 flex flex-col gap-8">
            {PUBLIC_COMPANIES.map((company, i) => (
              <CompanyCard key={company.slug} company={company} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── B. Per-company ticket forms ─────────────────────────────── */}
      {PUBLIC_COMPANIES.map((company, i) => (
        <section
          key={company.slug}
          id={`ticket-${company.slug}`}
          className={`${SECTION.base} ${
            i % 2 === 0 ? "bg-background" : "bg-[hsl(var(--brand-surface))]"
          } relative isolate overflow-hidden`}
        >
          <div className={CONTAINER}>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              {/* Left: heading + image */}
              <ScrollReveal>
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-orange-500))]">
                  {sourceText("Contact us")}
                </span>
                <h2 className={`mt-3 ${TYPE.h2} text-foreground`}>
                  {company.name}
                </h2>
                <p className="mt-3 text-[1rem] leading-relaxed text-muted-foreground">
                  {sourceText(company.description)}
                </p>

                {company.heroImage && (
                  <div className="mt-8 overflow-hidden rounded-xl">
                    <Image
                      src={company.heroImage}
                      alt={company.name}
                      width={560}
                      height={320}
                      className="h-56 w-full object-cover"
                    />
                  </div>
                )}
              </ScrollReveal>

              {/* Right: ticket form */}
              <ScrollReveal delay={100}>
                <CompanyTicketForm
                  company={company.apiKey}
                  companyLabel={company.name}
                />
              </ScrollReveal>
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

export default CompaniesSection;
