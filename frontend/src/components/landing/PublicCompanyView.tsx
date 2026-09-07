"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyTicketForm } from "@/components/landing/CompanyTicketForm";
import { CONTAINER, HEADER_BLOCK, SECTION, TYPE } from "@/components/landing/design-system";
import {
  GROUP_INTRO_SOURCE,
  getPublicCompanyCard,
} from "@/components/landing/public-company-cards";
import { getPublicCompany } from "@/components/landing/public-companies";

export function PublicCompanyView({ slug }: { slug: string }) {
  const company = getPublicCompany(slug);
  const card = getPublicCompanyCard(slug);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const active = useMemo(
    () => company?.gallery.find((item) => item.src === lightbox) ?? null,
    [company, lightbox],
  );

  if (!company || !card) return null;

  return (
    <div className="bg-background text-foreground">
      <section className="relative isolate min-h-[28rem] overflow-hidden pt-16 text-white sm:min-h-[32rem]">
        <Image
          src={company.heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/25" />
        <div
          className={`relative ${CONTAINER} flex min-h-[28rem] flex-col justify-end pb-16 pt-24 sm:min-h-[32rem]`}
        >
          <Link
            href="/#apropos"
            className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/80 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <SourceText source="Back" />
          </Link>
          <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,4rem)] font-black tracking-tight text-white">
            {card.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg font-semibold uppercase tracking-[0.08em] text-white/85">
            <SourceText source={card.role} />
          </p>
          <a
            href="#tickets"
            className="mt-8 inline-flex h-12 w-fit items-center rounded-full bg-[hsl(var(--brand-orange-500))] px-6 text-sm font-bold text-[hsl(var(--landing-ink))] transition hover:brightness-110"
          >
            <SourceText source="Contact" />
          </a>
        </div>
      </section>

      <section className={`${SECTION.base} bg-background`}>
        <div className={CONTAINER}>
          <p className={`max-w-3xl ${TYPE.lead} text-muted-foreground`}>
            <SourceText source={GROUP_INTRO_SOURCE} />
          </p>
          <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
            {card.name}
          </h2>
          <p className="mt-2 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--brand-blue-700))] dark:text-[hsl(var(--brand-blue-500))]">
            <SourceText source={card.role} />
          </p>
          <p className={`${HEADER_BLOCK.titleGap} max-w-3xl text-[1.0625rem] leading-relaxed text-muted-foreground`}>
            <SourceText source={card.body} />
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {company.services.map((service) => (
              <span
                key={service}
                className="inline-flex items-center rounded-full border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--primary)/0.06)] px-3 py-1 text-[0.75rem] font-semibold text-[hsl(var(--primary))]"
              >
                {service}
              </span>
            ))}
          </div>
        </div>
      </section>

      {company.gallery.length > 0 ? (
        <section className={`${SECTION.base} bg-[hsl(var(--brand-surface))]`}>
          <div className={CONTAINER}>
            <span className={HEADER_BLOCK.kicker}>
              <SourceText source="On site" />
            </span>
            <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
              <SourceText source="Our teams, at work." />
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {company.gallery.map((image) => (
                <button
                  key={image.src}
                  type="button"
                  onClick={() => setLightbox(image.src)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="tickets" className={`${SECTION.base} scroll-mt-16 bg-background`}>
        <div className={`${CONTAINER} max-w-3xl`}>
          <h2 className={`${TYPE.h2} text-foreground`}>
            <SourceText source="Open a client ticket" />
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-muted-foreground">
            <SourceText source={card.body} />
          </p>
          <div className="mt-8">
            <CompanyTicketForm
              company={card.apiKey}
              companyLabel={card.name}
              combinedContact
              submitLabel="Envoyer"
            />
          </div>
        </div>
      </section>

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent
          size="full"
          className="max-w-5xl border-none bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">{active?.alt ?? card.name}</DialogTitle>
          {active ? (
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-black">
              <Image
                src={active.src}
                alt={active.alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PublicCompanyView;
