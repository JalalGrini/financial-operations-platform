"use client";

/**
 * PillarScrollSync - the seven service pillars as a pinned, scroll-synced
 * narrative: the pillar list scrolls on one side while a single photo stage
 * cross-fades on the other.
 *
 * WHY THE CROSSFADE IS STATE-DRIVEN, NOT SCROLL-DRIVEN
 * ----------------------------------------------------
 * Most implementations of this pattern map scrollY to an image index, which
 * breaks in three ways: it stutters on fast scrolls, it needs explicit
 * scroll-direction detection, and it fights momentum scrolling on trackpads.
 *
 * Instead, one IntersectionObserver per row fires when that row crosses the
 * middle band of the viewport (rootMargin -45%/-45%). Activation is therefore
 * symmetric: scrolling down activates the next row, scrolling up re-activates
 * the previous one, and the crossfade is identical in both directions with no
 * index arithmetic at all.
 *
 * WHY THERE IS NO SCROLL HIJACKING
 * The stage is plain `position: sticky`. No preventDefault, no scroll
 * library, no snapping. The wheel always does exactly what the user expects -
 * the reference site's biggest flaw is that it does not.
 *
 * VISIBILITY
 * Server-side and without JS, this renders as a plain stacked list with every
 * photo and every word visible. The pinned layout is an upgrade applied only
 * after mount on large viewports, so nothing can ever be stranded hidden.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import {
  CONTAINER,
  HEADER_BLOCK,
  RADIUS,
  SECTION,
  TYPE,
  FOCUS_RING,
} from "./design-system";
import { ScrollReveal } from "./motion-primitives";

/**
 * The seven pillars, taken from the group's own service taxonomy.
 * Every description is a faithful translation of the company's own wording -
 * nothing here is invented marketing copy.
 */
type Pillar = {
  index: string;
  title: string;
  summary: string;
  detail: string;
  image: string;
  alt: string;
};

const PILLARS: Pillar[] = [
  {
    index: "01",
    title: "Security and guarding",
    summary: "A security plan covering every sensitive angle.",
    detail:
      "Trained agents for enterprises, residences and events, deployed against a written plan that accounts for every vulnerable point of the site.",
    image: "/brand/services/protection-entreprises.jpg",
    alt: "Security agent on duty at an enterprise site",
  },
  {
    index: "02",
    title: "Cleaning",
    summary: "Flawless cleaning using certified products.",
    detail:
      "Offices, retail premises, apartment buildings, construction sites and open spaces, on schedules built around your operating hours rather than ours.",
    image: "/brand/services/nettoyage-bureaux.jpg",
    alt: "Cleaning team maintaining an office floor",
  },
  {
    index: "03",
    title: "Disinfection",
    summary: "Perfected treatment of premises using certified products.",
    detail:
      "Full-premises disinfection with certified products and documented procedures, so the result is verifiable and not merely claimed.",
    image: "/brand/services/nettoyage-immeubles.jpg",
    alt: "Disinfection of a building interior",
  },
  {
    index: "04",
    title: "Gardening and landscaping",
    summary: "Garden maintenance and landscaping by specialised technicians.",
    detail:
      "Design, planting and continuous upkeep of green spaces, handled by technicians who specialise in it rather than by general labour.",
    image: "/brand/services/nettoyage-espaces.jpg",
    alt: "Maintained green space and grounds",
  },
  {
    index: "05",
    title: "Technical personnel management",
    summary: "Eliminate technical-staffing problems through outsourcing.",
    detail:
      "We carry the recruitment, payroll, CNSS declarations and coverage obligations for your technical staff, so a vacancy is our problem and not yours.",
    image: "/brand/services/nettoyage-chantiers.jpg",
    alt: "Technical personnel working on site",
  },
  {
    index: "06",
    title: "Events",
    summary: "Catering, festivities, coffee breaks and receptions.",
    detail:
      "Full event organisation, from reception logistics and coffee breaks through to catering and festivities, staffed by our own teams.",
    image: "/brand/services/protection-evenements.jpg",
    alt: "Event staffed and secured by the group",
  },
  {
    index: "07",
    title: "Courier and money transfer",
    summary: "Any article type, handled through the TAWSSIL system.",
    detail:
      "Courier handling for any article type, plus money transfer, tracked end to end through the TAWSSIL system.",
    image: "/brand/services/transfert-argent.jpg",
    alt: "Money transfer and courier counter",
  },
];

export function PillarScrollSync() {
  const [active, setActive] = useState(0);
  /**
   * Null until measured. The stacked layout is the server-rendered default,
   * so first paint is always the fully visible one.
   */
  const [pinned, setPinned] = useState(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Only pin on large viewports. A 700vh pinned section on a phone is hostile.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setPinned(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!pinned) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.pillarIndex);
          if (Number.isFinite(index)) setActive(index);
        }
      },
      {
        // Activate only while crossing the middle 10% band of the viewport.
        // This is what makes up-scroll and down-scroll behave symmetrically.
        rootMargin: "-45% 0px -45% 0px",
        threshold: 0,
      },
    );

    for (const row of rowRefs.current) {
      if (row) observer.observe(row);
    }
    return () => observer.disconnect();
  }, [pinned]);

  const progress = ((active + 1) / PILLARS.length) * 100;

  /* ------------------------------------------------------------- header */

  const header = (
    <ScrollReveal className={`${HEADER_BLOCK.wrap} max-w-3xl`} y={20}>
      <span className={`${HEADER_BLOCK.kicker}`}>
        <SourceText source="What we operate" />
      </span>
      <h2 className={`${HEADER_BLOCK.kickerGap} ${TYPE.h2} text-foreground`}>
        <SourceText source="Seven services, one accountable group." />
      </h2>
      <p className={`${HEADER_BLOCK.titleGap} ${HEADER_BLOCK.lead}`}>
        <SourceText source="Three companies operating under one standard of commitment, in place since 2014. Every service below is delivered by our own trained teams." />
      </p>
    </ScrollReveal>
  );

  /* ------------------------------------------------- stacked (default) */

  if (!pinned) {
    return (
      <section className={`${SECTION.base} relative`}>
        <div className={CONTAINER}>
          {header}
          <div className={`${HEADER_BLOCK.contentGap} flex flex-col gap-8`}>
            {PILLARS.map((pillar, index) => (
              <ScrollReveal
                key={pillar.index}
                delay={index === 0 ? 0 : 40}
                className={`overflow-hidden border border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--glass))] dark:bg-[hsl(var(--brand-surface))] ${RADIUS.panel}`}
              >
                <div className="relative aspect-[16/10] w-full">
                  <Image
                    src={pillar.image}
                    alt={pillar.alt}
                    fill
                    sizes="(max-width: 1023px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-col gap-2 p-6">
                  <span className="font-mono text-[0.8125rem] font-bold tabular-nums text-[hsl(var(--brand-orange-500))]">
                    {pillar.index}
                  </span>
                  <h3 className={`${TYPE.h3} text-foreground`}>
                    <SourceText source={pillar.title} />
                  </h3>
                  <p className={`${TYPE.body} text-muted-foreground`}>
                    <SourceText source={pillar.summary} />
                  </p>
                  <p className={`${TYPE.body} text-muted-foreground/90`}>
                    <SourceText source={pillar.detail} />
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* --------------------------------------------------- pinned (>=1024px) */

  return (
    <section className="relative">
      <div className={`${CONTAINER} pt-24`}>{header}</div>

      <div className={`${CONTAINER} relative`}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-16">
          {/* ---------------------------------------------- pillar list */}
          <div className="relative">
            {/* Progress rail. The visitor always knows how far through the
                section they are, so a tall pinned block never feels endless. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 start-0 w-px bg-[hsl(var(--primary)/0.12)]"
            >
              <div
                className="w-px bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--brand-blue-500))] transition-[height] duration-[520ms]"
                style={{
                  height: `${progress}%`,
                  transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>

            {PILLARS.map((pillar, index) => {
              const isActive = index === active;
              return (
                <div
                  key={pillar.index}
                  ref={(node) => {
                    rowRefs.current[index] = node;
                  }}
                  data-pillar-index={index}
                  data-active={isActive}
                  className="flex min-h-screen flex-col justify-center ps-10"
                >
                  <div
                    className="transition-opacity duration-500"
                    style={{ opacity: isActive ? 1 : 0.38 }}
                  >
                    <div className="flex items-baseline gap-4">
                      <span
                        className="font-mono font-bold tabular-nums transition-all duration-500"
                        style={{
                          fontSize: isActive ? "1.5rem" : "0.875rem",
                          color: isActive
                            ? "hsl(var(--brand-orange-500))"
                            : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {pillar.index}
                      </span>
                      <h3
                        className={`${TYPE.h2} text-foreground`}
                        style={{ fontSize: "clamp(1.75rem,2.6vw,2.5rem)" }}
                      >
                        <SourceText source={pillar.title} />
                      </h3>
                    </div>

                    <p
                      className={`mt-4 max-w-[46ch] ${TYPE.lead} text-foreground/85`}
                    >
                      <SourceText source={pillar.summary} />
                    </p>

                    {/*
                      The detail paragraph is always in the DOM and always
                      readable - it is never collapsed to zero height, because
                      hiding real content behind an active state is exactly the
                      failure mode we are avoiding.
                    */}
                    <p
                      className={`mt-4 max-w-[52ch] ${TYPE.body} text-muted-foreground transition-all duration-500`}
                      style={{
                        maxWidth: isActive ? "52ch" : "46ch",
                      }}
                    >
                      <SourceText source={pillar.detail} />
                    </p>

                    <div
                      aria-hidden="true"
                      className="mt-6 h-px origin-left bg-gradient-to-r from-[hsl(var(--brand-blue-500))] to-transparent transition-transform duration-[620ms]"
                      style={{
                        transform: `scaleX(${isActive ? 1 : 0})`,
                        transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                        width: "12rem",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* --------------------------------------------- sticky stage */}
          {/* h-full + self-stretch are load-bearing: a sticky child can only
              stick inside its own scroll range. Without them this column's
              height collapses to the stage height (76vh) and the photo stage
              scrolls out of view partway down the section, leaving the right
              half of the viewport blank. */}
          <div className="relative h-full self-stretch">
            <div className="sticky top-[12vh] flex h-[76vh] items-center">
              <div
                className={`relative aspect-[4/5] max-h-full w-full overflow-hidden ${RADIUS.panel} shadow-[0_32px_80px_-24px_hsl(var(--primary)/0.28)] dark:shadow-[0_32px_80px_-24px_hsl(0_0%_0%/0.6)]`}
              >
                {PILLARS.map((pillar, index) => {
                  const isActive = index === active;
                  return (
                    <div
                      key={pillar.index}
                      aria-hidden={!isActive}
                      className="absolute inset-0 transition-[opacity,transform] duration-[520ms] motion-reduce:transition-none"
                      style={{
                        opacity: isActive ? 1 : 0,
                        transform: isActive ? "scale(1)" : "scale(1.04)",
                        transitionTimingFunction: isActive
                          ? "cubic-bezier(0.22,1,0.36,1)"
                          : "cubic-bezier(0.4,0,1,1)",
                        willChange: "opacity, transform",
                      }}
                    >
                      <Image
                        src={pillar.image}
                        alt={isActive ? pillar.alt : ""}
                        fill
                        sizes="(min-width: 1024px) 50vw, 100vw"
                        className="object-cover"
                        priority={index === 0}
                      />
                    </div>
                  );
                })}

                {/* Treat the stage as a physical print: an indigo-tinted inner
                    shadow plus a 1px top highlight, so it never reads as a
                    flat CSS rectangle. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    boxShadow:
                      "inset 0 0 120px hsl(var(--primary) / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.10)",
                  }}
                />

                {/* Caption plate: the active pillar, legible over any photo. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6">
                  <div
                    className={`inline-flex items-center gap-3 ${RADIUS.pill} border border-white/15 bg-[hsl(var(--landing-ink)/0.72)] px-4 py-2 backdrop-blur-xl`}
                  >
                    <span className="font-mono text-[0.75rem] font-bold tabular-nums text-[hsl(var(--brand-orange-500))]">
                      {PILLARS[active].index}
                      <span className="text-white/50">
                        {" / "}
                        {String(PILLARS.length).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="text-[0.8125rem] font-semibold text-white">
                      <SourceText source={PILLARS[active].title} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        Keyboard and assistive-technology parity: the pinned layout is driven
        by scroll position, which a keyboard user cannot address directly.
        These controls jump straight to a pillar.
      */}
      <div className={`${CONTAINER} pb-24`}>
        <nav aria-label={sourceText("Jump to a service")} className="flex flex-wrap gap-2">
          {PILLARS.map((pillar, index) => (
            <button
              key={pillar.index}
              type="button"
              onClick={() => {
                setActive(index);
                rowRefs.current[index]?.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "auto"
                    : "smooth",
                  block: "center",
                });
              }}
              aria-current={index === active}
              className={`${RADIUS.pill} ${FOCUS_RING} border px-4 py-2 text-[0.8125rem] font-semibold transition-colors duration-150 ${
                index === active
                  ? "border-transparent bg-[hsl(var(--primary))] text-primary-foreground"
                  : "border-[hsl(var(--primary)/0.16)] text-muted-foreground hover:border-[hsl(var(--brand-blue-500)/0.5)] hover:text-foreground"
              }`}
            >
              <span className="font-mono tabular-nums opacity-60">{pillar.index}</span>
              <span className="ms-2">
                <SourceText source={pillar.title} />
              </span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

export default PillarScrollSync;
export { PILLARS };
