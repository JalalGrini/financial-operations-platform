"use client";

/**
 * The remaining landing sections.
 *
 * Every fact in this file is real, taken from the group's own material:
 * the three company names, the seven services, the named leadership team
 * with their direct lines, the founding year, the published project and
 * satisfaction figures, the fifteen partners, and the real contact details.
 * There is no placeholder copy and no invented statistic anywhere here.
 *
 * Shared rules applied throughout:
 * - Surfaces alternate, so no two adjacent sections share a background.
 * - Every section uses the same header block rhythm from design-system.ts.
 * - Nothing is revealed by hover and nothing depends on JS to be visible.
 */

import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  Facebook,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Plus,
  Truck,
  Wallet,
} from "lucide-react";
import { useId } from "react";
import { SourceText } from "@/components/i18n/SourceText";
import {
  CONTAINER,
  FOCUS_RING,
  HEADER_BLOCK,
  RADIUS,
  SECTION,
  TYPE,
} from "./design-system";
import { ScrollReveal } from "./motion-primitives";
import { SpotlightCard } from "./interactive";
import {
  GROUP_INTRO_SOURCE,
  PUBLIC_COMPANY_CARDS,
  publicCompanyHref,
} from "./public-company-cards";

/* ------------------------------------------------------- section header */

function SectionHeader({
  kicker,
  heading,
  lead,
  align = "start",
}: {
  kicker: string;
  heading: string;
  lead?: string;
  align?: "start" | "center";
}) {
  return (
    <ScrollReveal
      className={[
        HEADER_BLOCK.wrap,
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
      ].join(" ")}
      y={20}
    >
      <span className={HEADER_BLOCK.kicker}>
        <SourceText source={kicker} />
      </span>
      <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
        <SourceText source={heading} />
      </h2>
      {lead ? (
        <p
          className={`${HEADER_BLOCK.titleGap} ${HEADER_BLOCK.lead} ${
            align === "center" ? "mx-auto" : ""
          }`}
        >
          <SourceText source={lead} />
        </p>
      ) : null}
    </ScrollReveal>
  );
}

/* ------------------------------------------------------------ the group */

const COMPANY_ICONS = {
  "3rb-extreme": Building2,
  "3rb-maroc": Truck,
  "el-rhrib-cash": Wallet,
} as const;

/**
 * The three companies, joined by one continuous hairline that draws itself
 * across all three cards on reveal - the section literally renders the idea
 * that they are three parts of one commitment.
 */
export function GroupSection() {
  return (
    <section className={`${SECTION.base} bg-[hsl(var(--brand-surface))]`}>
      <div className={CONTAINER}>
        <ScrollReveal className="max-w-4xl" y={20}>
          <p className={`${TYPE.lead} text-muted-foreground`}>
            <SourceText source={GROUP_INTRO_SOURCE} />
          </p>
        </ScrollReveal>

        <div className={`${HEADER_BLOCK.contentGap} relative`}>
          {/* The connecting line. Decorative, hidden from assistive tech,
              and only drawn where the three cards sit side by side. */}
          <ScrollReveal
            className="pointer-events-none absolute inset-x-0 top-[3.25rem] hidden lg:block"
            aria-hidden="true"
            duration={900}
            y={0}
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(var(--brand-blue-500)/0.6)] to-transparent" />
          </ScrollReveal>

          <div className="grid gap-6 lg:grid-cols-3">
            {PUBLIC_COMPANY_CARDS.map((company, index) => {
              const Icon = COMPANY_ICONS[company.slug];
              return (
                <ScrollReveal key={company.slug} delay={50 + index * 70}>
                  <Link
                    href={publicCompanyHref(company.slug)}
                    className="block h-full"
                  >
                    <SpotlightCard className="h-full p-6">
                      <span
                        className={`inline-flex h-11 w-11 items-center justify-center ${RADIUS.control} bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] dark:text-[hsl(var(--brand-blue-500))]`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
                      </span>
                      {/* Company names are proper nouns: rendered raw, never
                          passed through translation. */}
                      <h3 className={`mt-5 ${TYPE.h3} text-foreground`}>
                        {String(company.name)}
                      </h3>
                      <p className="mt-1 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--brand-blue-700))] dark:text-[hsl(var(--brand-blue-500))]">
                        <SourceText source={company.role} />
                      </p>
                      <p className={`mt-4 ${TYPE.body} text-muted-foreground`}>
                        <SourceText source={company.body} />
                      </p>
                    </SpotlightCard>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- leadership */

const LEADERSHIP = [
  {
    name: "Mohammed El Ghrib",
    role: "Executive Director",
    phones: ["0661 172 799", "0663 894 085"],
  },
  {
    name: "Ibtissam Sadoq",
    role: "Administrative Director",
    phones: ["0660 255 506"],
  },
  {
    name: "Abdedaim Sadoq",
    role: "General Director",
    phones: ["0663 534 400"],
  },
];

/** Initials avoid inventing portrait photography we do not have. */
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

/**
 * A named, reachable leadership team is the strongest trust signal a services
 * group can put on a public page, and it is something competitors rarely do.
 * The phone numbers are real and dial directly.
 */
export function LeadershipSection() {
  return (
    <section className={`${SECTION.base} bg-[hsl(var(--brand-surface))]`}>
      <div className={CONTAINER}>
        <SectionHeader
          kicker="Who you deal with"
          heading="You will know exactly who is accountable."
          lead="Our directors are reachable directly. If something on your site needs a decision, you are not routed through a call centre."
        />

        <div className={`${HEADER_BLOCK.contentGap} grid gap-6 lg:grid-cols-3`}>
          {LEADERSHIP.map((person, index) => (
            <ScrollReveal key={person.name} delay={50 + index * 70}>
              <SpotlightCard tone="azure" className="h-full p-6">
                <div className="flex items-center gap-4">
                  <span
                    className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-lg font-bold text-primary-foreground`}
                    aria-hidden="true"
                  >
                    {initials(person.name)}
                  </span>
                  <div className="min-w-0">
                    {/* Personal names are proper nouns - never translated. */}
                    <h3 className={`${TYPE.h3} text-foreground`}>
                      {String(person.name)}
                    </h3>
                    <p className="text-[0.8125rem] font-semibold text-[hsl(var(--brand-blue-700))] dark:text-[hsl(var(--brand-blue-500))]">
                      <SourceText source={person.role} />
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  {person.phones.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className={`inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-foreground transition-colors duration-150 hover:text-[hsl(var(--brand-blue-700))] dark:hover:text-[hsl(var(--brand-blue-500))] ${FOCUS_RING} ${RADIUS.control}`}
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="tabular-nums">{phone}</span>
                    </a>
                  ))}
                </div>
              </SpotlightCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- partners */

const PARTNERS: Array<{ file: string; name: string; href?: string }> = [
  { file: "supratours.jpg", name: "Supratours", href: "https://supratours.ma" },
  { file: "xaluca.jpg", name: "Xaluca", href: "https://xaluca.com" },
  { file: "delight.png", name: "Delight Event Management", href: "https://delight-event.com" },
  {
    file: "skoda-titan.jpg",
    name: "Titan Desert Morocco",
    href: "https://skodatitandesertmorocco.com",
  },
  {
    file: "centre-investissement.jpg",
    name: "CRI Draa-Tafilalet",
    href: "https://cridraatafilalet.ma",
  },
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

/**
 * Two marquee rows travelling in opposite directions, the back row scaled
 * down and dimmed. The depth comes from the pairing, not from any 3D work,
 * and it suggests a roster larger than the fifteen logos on screen.
 *
 * The row is duplicated once so the translation can loop seamlessly; the
 * duplicate is hidden from assistive technology to avoid reading every
 * partner name twice.
 */
function MarqueeRow({
  items,
  reverse = false,
  dim = false,
}: {
  items: typeof PARTNERS;
  reverse?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className="group flex overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
      }}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          className="landing-marquee-track flex shrink-0 items-center gap-4 pe-4"
          style={{
            animationDirection: reverse ? "reverse" : "normal",
            animationDuration: dim ? "64s" : "48s",
            opacity: dim ? 0.6 : 1,
            transform: dim ? "scale(0.92)" : undefined,
          }}
        >
          {items.map((partner) => (
            <div
              key={`${copy}-${partner.file}`}
              className={`landing-logo-tile flex h-20 w-40 shrink-0 items-center justify-center border border-[hsl(var(--primary)/0.08)] bg-[hsl(var(--glass))] p-4 dark:bg-[hsl(var(--brand-surface))] ${RADIUS.card}`}
            >
              <Image
                src={`/brand/partners/${partner.file}`}
                alt={partner.name}
                width={120}
                height={48}
                className="h-auto max-h-10 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PartnersSection() {
  const front = PARTNERS.slice(0, 8);
  const back = PARTNERS.slice(8);
  return (
    <section className={`${SECTION.band} bg-background`}>
      <div className={CONTAINER}>
        <ScrollReveal className="flex flex-col items-center text-center">
          <span className={HEADER_BLOCK.kicker}>
            <SourceText source="Trusted by" />
          </span>
          <p className="mt-3 max-w-2xl text-[0.9375rem] text-muted-foreground">
            <SourceText source="Organisations that rely on the group for guarding, cleaning, staffing, events and transfers." />
          </p>
        </ScrollReveal>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        <MarqueeRow items={front} />
        <MarqueeRow items={back} reverse dim />
      </div>

      {/* The partner names as real, selectable text. The marquee is imagery;
          this list is the accessible equivalent and is always visible. */}
      <div className={`${CONTAINER} mt-8`}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {PARTNERS.map((partner) => (
            <li key={partner.file} className="text-[0.8125rem] text-muted-foreground">
              {partner.href ? (
                <a
                  href={partner.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`transition-colors duration-150 hover:text-[hsl(var(--brand-blue-700))] dark:hover:text-[hsl(var(--brand-blue-500))] ${FOCUS_RING} ${RADIUS.control}`}
                >
                  {String(partner.name)}
                </a>
              ) : (
                String(partner.name)
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- faq */

const FAQ = [
  {
    q: "Are financial documents ready for predefined templates?",
    a: "Yes. Financial records are captured in a structured form from the outset, so exports and declarations can be generated against predefined templates rather than rebuilt by hand each period.",
  },
  {
    q: "Which cities and regions do you cover?",
    a: "We are based in Temara and operate across Morocco, including long-running assignments with partners in Draa-Tafilalet and the south.",
  },
  {
    q: "Do your agents and technical staff work under your own payroll?",
    a: "Yes. Recruitment, payroll and CNSS declarations are carried by the group, which is precisely what removes the staffing burden from your side.",
  },
  {
    q: "Can you combine several services on one contract?",
    a: "That is the usual arrangement. Guarding, cleaning, disinfection and grounds upkeep are frequently delivered together on a single site under one point of contact.",
  },
  {
    q: "How quickly can you mobilise a team?",
    a: "Timelines depend on headcount and site requirements, so tell us the site, the scope and your deadline through the ticket form below and a director will come back to you directly.",
  },
];

/**
 * Accordion built on native <details>/<summary>.
 *
 * This choice matters for the visibility rules: <details> is expandable
 * without JS, is keyboard-operable for free, and its content is reachable by
 * find-in-page in modern browsers. A div-based accordion gives up all three.
 */
export function FaqSection() {
  return (
    <section className={`${SECTION.base} bg-[hsl(var(--brand-surface))]`}>
      <div className={CONTAINER}>
        <SectionHeader
          kicker="Questions"
          heading="What clients ask before signing."
          align="center"
        />

        <div className={`${HEADER_BLOCK.contentGap} mx-auto flex max-w-3xl flex-col gap-3`}>
          {FAQ.map((item, index) => (
            <ScrollReveal key={item.q} delay={40 + index * 50}>
              <details
                className={`landing-faq group border border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--glass))] px-5 dark:bg-[hsl(var(--brand-surface))] ${RADIUS.card}`}
              >
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-start text-[0.9375rem] font-semibold text-foreground ${FOCUS_RING}`}
                >
                  <span>
                    <SourceText source={item.q} />
                  </span>
                  <Plus
                    className="h-4 w-4 shrink-0 text-[hsl(var(--brand-blue-700))] transition-transform duration-300 group-open:rotate-45 dark:text-[hsl(var(--brand-blue-500))]"
                    aria-hidden="true"
                  />
                </summary>
                <p className={`pb-5 pe-8 ${TYPE.body} text-muted-foreground`}>
                  <SourceText source={item.a} />
                </p>
              </details>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- contact */

/**
 * Real contact details, including the group's landline, its email address,
 * its registered address and both social profiles.
 */
export function ContactDetails() {
  return (
    <div className="flex flex-col gap-5">
      <a
        href="tel:+212538995746"
        className={`group flex items-start gap-4 ${FOCUS_RING} ${RADIUS.card}`}
      >
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${RADIUS.control} bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] dark:text-[hsl(var(--brand-blue-500))]`}
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.75rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <SourceText source="Telephone" />
          </span>
          <span className="block text-[1.0625rem] font-semibold tabular-nums text-foreground transition-colors duration-150 group-hover:text-[hsl(var(--brand-blue-700))] dark:group-hover:text-[hsl(var(--brand-blue-500))]">
            +212 538 995 746
          </span>
        </span>
      </a>

      <a
        href="mailto:contact@groupe3rb.ma"
        className={`group flex items-start gap-4 ${FOCUS_RING} ${RADIUS.card}`}
      >
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${RADIUS.control} bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] dark:text-[hsl(var(--brand-blue-500))]`}
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.75rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <SourceText source="Email" />
          </span>
          <span className="block break-all text-[1.0625rem] font-semibold text-foreground transition-colors duration-150 group-hover:text-[hsl(var(--brand-blue-700))] dark:group-hover:text-[hsl(var(--brand-blue-500))]">
            contact@groupe3rb.ma
          </span>
        </span>
      </a>

      <div className="flex items-start gap-4">
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${RADIUS.control} bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] dark:text-[hsl(var(--brand-blue-500))]`}
        >
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.75rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <SourceText source="Address" />
          </span>
          <span className={`block ${TYPE.body} text-foreground`}>
            {String("N° 155, Quartier Koumtrafa, 12000 Témara, Maroc")}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <a
          href="https://web.facebook.com/3rbextreme"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={String("Facebook")}
          className={`inline-flex h-10 w-10 items-center justify-center ${RADIUS.control} border border-[hsl(var(--primary)/0.14)] text-muted-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.5)] hover:text-foreground ${FOCUS_RING}`}
        >
          <Facebook className="h-4 w-4" aria-hidden="true" />
        </a>
        <a
          href="https://www.linkedin.com/in/groupe-3rb-680169273/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={String("LinkedIn")}
          className={`inline-flex h-10 w-10 items-center justify-center ${RADIUS.control} border border-[hsl(var(--primary)/0.14)] text-muted-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.5)] hover:text-foreground ${FOCUS_RING}`}
        >
          <Linkedin className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- gallery */

const GALLERY = [
  { file: "protection-residences.jpg", label: "Residential protection" },
  { file: "nettoyage-commerces.png", label: "Retail cleaning" },
  { file: "lavage-vehicules.jpg", label: "Vehicle washing" },
  { file: "nettoyage-chantiers.jpg", label: "Construction site cleaning" },
];

/**
 * Real photography from the group's own work. Captions are always visible
 * rather than appearing on hover - a hover-only caption is invisible on
 * every touch device.
 */
export function GallerySection() {
  const headingId = useId();
  return (
    <section className={`${SECTION.base} bg-background`} aria-labelledby={headingId}>
      <div className={CONTAINER}>
        <SectionHeader
          kicker="On site"
          heading="Our teams, at work."
          lead="Photographs from live assignments rather than stock imagery."
        />
        <div className={`${HEADER_BLOCK.contentGap} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
          {GALLERY.map((shot, index) => (
            <ScrollReveal key={shot.file} delay={40 + index * 60}>
              <figure
                className={`overflow-hidden border border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--glass))] dark:bg-[hsl(var(--brand-surface))] ${RADIUS.card}`}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <Image
                    src={`/brand/services/${shot.file}`}
                    alt={shot.label}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 hover:scale-[1.04] motion-reduce:transition-none"
                  />
                </div>
                <figcaption className="px-4 py-3 text-[0.8125rem] font-semibold text-foreground">
                  <SourceText source={shot.label} />
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export { PARTNERS, LEADERSHIP };
