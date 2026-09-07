import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Flower2,
  Lock,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Truck,
  Users,
} from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { LandingExperienceControls } from "@/components/product/LandingExperienceControls";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { BlurFade } from "@/components/ui/blur-fade";
import { Marquee } from "@/components/ui/marquee";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ClientTicketForm } from "@/components/landing/ClientTicketForm";
import { LiveBackground } from "@/components/landing/LiveBackground";
import { PillarScrollSync } from "@/components/landing/PillarScrollSync";
import { TopBar } from "@/components/landing/TopBar";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PUBLIC_COMPANIES } from "@/components/landing/public-companies";
import {
  GROUP_INTRO_SOURCE,
  publicCompanyHref,
} from "@/components/landing/public-company-cards";
import {
  ContactDetails,
  GallerySection,
  GroupSection,
  LeadershipSection,
} from "@/components/landing/sections";
import { MagneticLink } from "@/components/landing/interactive";
import {
  ScrollReveal,
  WordMaskReveal,
} from "@/components/landing/motion-primitives";
import {
  CONTAINER,
  HEADER_BLOCK,
  RADIUS,
  SECTION,
  TYPE,
} from "@/components/landing/design-system";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ data */

/**
 * The service rail under the hero. Six of the group's seven service lines,
 * each with a real photograph from our own assignments.
 */
const serviceRail = [
  {
    icon: ShieldCheck,
    tone: "landing-tone-indigo",
    label: "Security and guarding",
    image: "/brand/services/protection-entreprises.jpg",
  },
  {
    icon: SprayCan,
    tone: "landing-tone-orange",
    label: "Cleaning and disinfection",
    image: "/brand/services/nettoyage-bureaux.jpg",
  },
  {
    icon: Users,
    tone: "landing-tone-blue",
    label: "Technical staffing",
    image: "/brand/services/nettoyage-chantiers.jpg",
  },
  {
    icon: Flower2,
    tone: "landing-tone-green",
    label: "Gardening and landscaping",
    image: "/brand/services/nettoyage-espaces.jpg",
  },
  {
    icon: PartyPopper,
    tone: "landing-tone-violet",
    label: "Events",
    image: "/brand/services/protection-evenements.jpg",
  },
  {
    icon: Truck,
    tone: "landing-tone-amber",
    label: "Courier and money transfer",
    image: "/brand/services/transfert-argent.jpg",
  },
];

/** Fifteen partner organisations. Every logo is a real file in public/brand. */
const partners = [
  { file: "supratours.jpg", name: "Supratours" },
  { file: "xaluca.jpg", name: "Xaluca" },
  { file: "delight.png", name: "Delight Event Management" },
  { file: "skoda-titan.jpg", name: "Titan Desert Morocco" },
  { file: "centre-investissement.jpg", name: "CRI Draa-Tafilalet" },
  { file: "kasbah-film.jpg", name: "Kasbah Film" },
  { file: "le-zat-hotel.png", name: "Le Zat Hotel" },
  { file: "dune.png", name: "Dune" },
  { file: "ideal-tours.jpg", name: "Ideal Tours" },
  { file: "tombouctou.jpg", name: "Tombouctou" },
  { file: "rush-event.jpg", name: "Rush Event & Communication" },
  { file: "auberge-belle-etoile.png", name: "Auberge La Belle Etoile" },
  { file: "ispit.jpg", name: "ISPIT" },
  { file: "rs.jpg", name: "RS" },
  { file: "salon-dattes.jpg", name: "Salon International des Dattes du Maroc" },
];

const navLinkClass =
  "rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground";

/* ------------------------------------------------------------------ page */

export default function HomePage() {
  // [overflow-x:clip] rather than overflow-x-hidden: `hidden` on one axis
  // forces the other axis to compute as `auto`, which makes this wrapper a
  // scroll container and silently breaks every position:sticky descendant --
  // including the pinned pillar photo stage. `clip` contains the decorative
  // horizontal overflow without creating a scroll container.
  return (
    <div className="landing-shell relative min-h-screen [overflow-x:clip] bg-background text-foreground">
      {/* ------------------------------------------------------ top bar */}
      <TopBar>
        <Link
          href="/#hero"
          className="landing-logo-wrap flex shrink-0 items-center gap-3 rounded-lg"
        >
          <Image
            src="/brand/3rb-header-logo.png"
            alt="Groupe 3RB"
            width={160}
            height={36}
            priority
            className="h-9 w-auto object-contain"
          />
          <span className="hidden text-[0.9375rem] font-black tracking-[-0.02em] sm:inline">
            Groupe 3RB
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          <a href="/#hero" className={navLinkClass}>
            Home
          </a>
          <a href="/#services" className={navLinkClass}>
            Services
          </a>
          <details className="group relative">
            <summary
              className={`${navLinkClass} inline-flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}
            >
              Groupe 3RB
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-white shadow-lg dark:bg-card">
              {PUBLIC_COMPANIES.map((company) => (
                <Link
                  key={company.slug}
                  href={publicCompanyHref(company.slug)}
                  className="block px-4 py-3 text-sm font-bold text-foreground transition-colors duration-150 hover:bg-primary/5"
                >
                  {company.name}
                </Link>
              ))}
            </div>
          </details>
          <a href="/#realisations" className={navLinkClass}>
            Réalisations
          </a>
          <a href="/#contact" className={navLinkClass}>
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <LandingExperienceControls />
          <ThemeSwitch />
          <Link
            href="/login"
            className="landing-cta-button inline-flex h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-[0.875rem] font-bold text-primary-foreground transition-transform duration-150 hover:scale-[1.02]"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Espace client
          </Link>
        </div>
      </TopBar>

      {/* --------------------------------------------------------- hero */}
      <section id="hero" className="relative overflow-hidden pb-32 pt-32 scroll-mt-16">
        <div className="pointer-events-none absolute inset-0 z-0">
          <LiveBackground intensity={1} />
        </div>
        <div className="landing-grid pointer-events-none absolute inset-0 z-[1] opacity-25" />

        <div className={`relative z-10 ${CONTAINER}`}>
          <BlurFade delay={0.1}>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-[hsl(var(--brand-blue-700))] dark:text-[hsl(var(--brand-blue-500))]">
              <SourceText source="Groupe 3.R.B · Morocco · Since 2014" />
            </p>
          </BlurFade>

          <h1 className={`mt-5 max-w-[22ch] ${TYPE.hero} text-foreground`}>
            <WordMaskReveal text="Control every operation." leadingEdge />
            <ScrollReveal
              as="span"
              className="mt-1 block"
              y={20}
              duration={620}
              delay={300}
            >
              <span className="landing-gradient-text block">
                <SourceText source="Move with confidence." />
              </span>
            </ScrollReveal>
          </h1>

          <BlurFade delay={0.3}>
            <p className={`mt-7 max-w-2xl ${TYPE.lead} text-muted-foreground`}>
              <SourceText source={GROUP_INTRO_SOURCE} />
            </p>
          </BlurFade>

          <BlurFade delay={0.38}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <MagneticLink href="#contact" variant="primary" size="lg">
                <SourceText source="Request a service" />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </MagneticLink>
              <MagneticLink href="#services" variant="secondary" size="lg">
                <SourceText source="See what we operate" />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </MagneticLink>
            </div>
          </BlurFade>

          {/* Service rail: six real photographs, captions always visible. */}
          <BlurFade delay={0.54}>
            <ul id="conception" className="mt-12 grid gap-4 scroll-mt-16 sm:grid-cols-2 lg:grid-cols-3">
              {serviceRail.map((service) => (
                <li key={service.label}>
                  <SpotlightCard
                    as="article"
                    radius={380}
                    className={`landing-service-card group flex h-full flex-col overflow-hidden rounded-xl border border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--glass))] dark:bg-[hsl(var(--brand-surface))] ${service.tone}`}
                  >
                    <div className="relative h-36 overflow-hidden">
                      <Image
                        src={service.image}
                        alt={service.label}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
                      />
                      <div className="landing-service-sheen pointer-events-none absolute inset-0" />
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] dark:text-[hsl(var(--brand-blue-500))]">
                        <service.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="text-[0.9375rem] font-bold text-foreground">
                        <SourceText source={service.label} />
                      </span>
                    </div>
                  </SpotlightCard>
                </li>
              ))}
            </ul>
          </BlurFade>
        </div>
      </section>

      {/* ----------------------------------------------------- partners */}
      <section id="equipe" className={`${SECTION.band} border-y border-[hsl(var(--primary)/0.08)] bg-background`}>
        <div className={`${CONTAINER} mb-8 text-center`}>
          <span className={HEADER_BLOCK.kicker}>
            <SourceText source="Trusted by" />
          </span>
        </div>
        <Marquee repeat={2} speed="slow">
          {partners.map((partner) => (
            <span
              key={partner.file}
              className={`landing-logo-tile flex h-16 w-36 shrink-0 items-center justify-center border border-[hsl(var(--primary)/0.08)] bg-white p-3 ${RADIUS.card}`}
              title={partner.name}
            >
              <Image
                src={`/brand/partners/${partner.file}`}
                alt={partner.name}
                width={110}
                height={40}
                className="h-auto max-h-9 w-auto object-contain"
              />
            </span>
          ))}
        </Marquee>
      </section>

      {/* -------------------------------------------------- the group */}
      <div id="apropos">
        <div id="groupe">
          <GroupSection />
        </div>
      </div>

      {/* ---------------------------------- services (pinned scroll sync) */}
      <div id="services" className="scroll-mt-16">
        <PillarScrollSync />
      </div>

      {/* -------------------------------------------------------- gallery */}
      <div id="realisations" className="scroll-mt-16">
        <div id="galery" className="scroll-mt-16">
          <GallerySection />
        </div>
      </div>

      {/* ----------------------------------------------------- leadership */}
      <LeadershipSection />

      {/* ---------------------------------------------- already a client */}
      <section className={`${SECTION.band} bg-background`}>
        <div className={CONTAINER}>
          <ScrollReveal>
            <div className="flex flex-col items-start justify-between gap-6 rounded-[20px] border border-[hsl(var(--primary)/0.12)] bg-[hsl(var(--brand-surface))] p-8 sm:flex-row sm:items-center">
              <div>
                <h2 className={`${TYPE.h3} text-foreground`}>
                  <SourceText source="Already working with us?" />
                </h2>
                <p className="mt-2 text-[0.9375rem] text-muted-foreground">
                  <SourceText source="Connectez-vous à l’espace client pour suivre vos sites et vos demandes." />
                </p>
              </div>
              <MagneticLink href="/login" variant="primary" size="lg">
                <Lock className="h-4 w-4" aria-hidden="true" />
                <SourceText source="Espace client" />
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </MagneticLink>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ------------------------------------------- contact and ticket */}
      <section
        id="contact"
        className={`${SECTION.flagship} relative overflow-hidden scroll-mt-16`}
      >
        <div className="pointer-events-none absolute inset-0 z-0">
          <LiveBackground intensity={0.5} interactive={false} />
        </div>

        <div className={`relative z-10 ${CONTAINER}`}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
            <ScrollReveal>
              <span className={HEADER_BLOCK.kicker}>
                <SourceText source="Contact" />
              </span>
              <h2 className={`mt-3 ${TYPE.h2} text-foreground`}>
                <SourceText source="Tell us what you need. A director will answer." />
              </h2>
              <p className={`mt-4 ${HEADER_BLOCK.lead}`}>
                <SourceText source="Écrivez-nous et un directeur vous répondra. Pour toute urgence, nos lignes restent ouvertes." />
              </p>

              <div className="mt-10">
                <ContactDetails />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div id="tickets" className="mb-5 flex scroll-mt-16 items-center gap-3">
                <Sparkles
                  className="h-5 w-5 text-[hsl(var(--brand-orange-500))]"
                  aria-hidden="true"
                />
                <h3 className={`${TYPE.h3} text-foreground`}>
                  <SourceText source="Open a client ticket" />
                </h3>
              </div>
              <ClientTicketForm />
            </ScrollReveal>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
