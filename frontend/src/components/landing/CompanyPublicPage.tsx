"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyTicketForm } from "@/components/landing/CompanyTicketForm";
import { CONTAINER, HEADER_BLOCK, SECTION, TYPE } from "@/components/landing/design-system";
import type { PublicCompany } from "@/components/landing/public-companies";

export function CompanyPublicPage({ company }: { company: PublicCompany }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const active = useMemo(
    () => company.gallery.find((item) => item.src === lightbox) ?? null,
    [company.gallery, lightbox],
  );

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
        <div className={`relative ${CONTAINER} flex min-h-[28rem] flex-col justify-end pb-16 pt-24 sm:min-h-[32rem]`}>
          <Link
            href="/#nos-entreprises"
            className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-white/80 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour
          </Link>
          <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,4rem)] font-black tracking-tight text-white">
            {company.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/85">
            {company.tagline}
          </p>
          <a
            href="#contact"
            className="mt-8 inline-flex h-12 w-fit items-center rounded-full bg-[hsl(var(--brand-orange-500))] px-6 text-sm font-bold text-[hsl(var(--landing-ink))] transition hover:brightness-110"
          >
            Nous contacter
          </a>
        </div>
      </section>

      <section className={`${SECTION.base} bg-background`}>
        <div className={CONTAINER}>
          <span className={HEADER_BLOCK.kicker}>À propos</span>
          <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
            {company.name}
          </h2>
          <p className={`${HEADER_BLOCK.titleGap} max-w-3xl text-[1.0625rem] leading-relaxed text-muted-foreground`}>
            {company.description}
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

      <section className={`${SECTION.base} bg-[hsl(var(--brand-surface))]`}>
        <div className={CONTAINER}>
          <span className={HEADER_BLOCK.kicker}>Galerie</span>
          <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
            Nos interventions
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

      <section id="contact" className={`${SECTION.base} scroll-mt-16 bg-background`}>
        <div className={`${CONTAINER} max-w-3xl`}>
          <h2 className={`${TYPE.h2} text-foreground`}>
            Contacter {company.name}
          </h2>
          <div className="mt-8">
            <CompanyTicketForm
              company={company.apiKey}
              companyLabel={company.name}
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
          <DialogTitle className="sr-only">{active?.alt ?? company.name}</DialogTitle>
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

export default CompanyPublicPage;
