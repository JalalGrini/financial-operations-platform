"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Facebook,
  FileText,
  Flower2,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Ticket,
  Truck,
  Users,
  PartyPopper,
} from "lucide-react";
import { LandingExperienceControls } from "@/components/product/LandingExperienceControls";
import { ClientTicketForm } from "@/components/landing/ClientTicketForm";
import { sourceText } from "@/lib/i18n/source-catalog";
import { GROUP_INTRO_SOURCE } from "@/components/landing/public-company-cards";

const NAV = [
  { href: "#accueil", label: "Home" },
  { href: "#services", label: "Services" },
  { href: "#apropos", label: "About" },
  { href: "#contact", label: "Contact" },
  { href: "#tickets", label: "Tickets" },
];

const SERVICES = [
  {
    icon: ShieldCheck,
    name: "Security and guarding",
    description:
      "A security plan covering every sensitive angle, for companies, residences and events.",
  },
  {
    icon: SprayCan,
    name: "Cleaning",
    description:
      "Flawless cleaning with certified products: offices, retail, buildings and construction sites.",
  },
  {
    icon: Sparkles,
    name: "Disinfection",
    description:
      "Advanced premises treatment with certified products, adapted to each site.",
  },
  {
    icon: Flower2,
    name: "Gardening",
    description: "Garden maintenance and landscaping by specialised technicians.",
  },
  {
    icon: Users,
    name: "Technical personnel management",
    description:
      "Professional subcontracting to reduce technical staffing problems.",
  },
  {
    icon: PartyPopper,
    name: "Events",
    description:
      "Event organisation: catering, festivities, coffee breaks and receptions.",
  },
  {
    icon: Truck,
    name: "Courier and money transfer",
    description:
      "Courier for any article type via TAWSSIL, money transfer and billing facilitation.",
  },
];

const STATS = [
  { value: "2014", label: "Year of creation" },
  { value: "368", label: "Completed projects" },
  { value: "99%", label: "Positive feedback" },
  { value: "24/7", label: "Support" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function PublicLanding() {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const [showTicket, setShowTicket] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[hsl(var(--brand-primary)/0.55)] text-white backdrop-blur-xl transition-transform duration-300 ${
          hidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#accueil" className="flex items-center gap-2.5">
            <Image
              src="/brand/3rb-logo-icon.png"
              alt={sourceText("3RB EXTREME")}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <span className="text-sm font-black tracking-wide">{sourceText("3RB EXTREME")}</span>
          </a>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                {sourceText(item.label)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-bold text-[hsl(var(--brand-primary))]"
            >
              {sourceText("Sign in")}
            </Link>
            <LandingExperienceControls />
          </div>
        </div>
      </header>

      <section
        id="accueil"
        className="relative isolate overflow-hidden pb-24 pt-32 text-white"
      >
        <div className="gradient-mesh absolute inset-0 -z-20" />
        {!reduce && (
          <>
            <motion.span
              className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-[hsl(var(--brand-accent)/0.35)] blur-3xl"
              animate={{ y: [0, 28, 0], x: [0, 16, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-[hsl(var(--brand-gold)/0.22)] blur-3xl"
              animate={{ y: [0, -24, 0], x: [0, -18, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className="pointer-events-none absolute bottom-10 left-1/3 h-48 w-48 rounded-full bg-white/10 blur-3xl"
              animate={{ y: [0, 18, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="text-xs font-bold uppercase tracking-[0.22em] text-white/70"
          >
            {sourceText("Groupe 3.R.B · Morocco · Since 2014")}
          </motion.p>
          <motion.h1
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-5 max-w-4xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            {sourceText("Satisfy our clients through the quality of our services")}
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80"
          >
            {sourceText(GROUP_INTRO_SOURCE)}
          </motion.p>
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <a
              href="#tickets"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[hsl(var(--brand-accent))] px-6 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              {sourceText("Submit a ticket")}
              <Ticket className="h-4 w-4" />
            </a>
            <a
              href="#apropos"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              {sourceText("Learn more")}
              <ArrowRight className="h-4 w-4" />
            </a>
          </motion.div>
        </div>
      </section>

      <section id="services" className="bg-background py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-black tracking-tight">{sourceText("Our services")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {sourceText(
              "Seven service lines operated by 3.R.B Extreme, 3.R.B Maroc and EL RHRIB CASH.",
            )}
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service, index) => (
              <motion.article
                key={service.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="rounded-2xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--brand-primary)/0.1)] text-[hsl(var(--brand-primary))]">
                  <service.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{sourceText(service.name)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {sourceText(service.description)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="tickets" className="bg-[hsl(var(--muted))] py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-black tracking-tight">
            {sourceText("Submit a support ticket")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {sourceText("Report a problem or make a request")}
          </p>
          {!showTicket ? (
            <button
              type="button"
              onClick={() => setShowTicket(true)}
              className="mt-8 inline-flex h-14 items-center gap-2 rounded-xl bg-[hsl(var(--brand-primary))] px-8 text-base font-bold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              {sourceText("Open the form")}
              <FileText className="h-4 w-4" />
            </button>
          ) : (
            <div className="mt-8">
              <ClientTicketForm />
            </div>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            {sourceText("Or go directly to")}{" "}
            <Link href="/tickets/new" className="font-semibold text-primary underline">
              /tickets/new
            </Link>
            {sourceText(". No sign-in is required.")}
          </p>
        </div>
      </section>

      <section id="contact" className="bg-background py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-black tracking-tight">{sourceText("Need help?")}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <a
              href="mailto:contact@groupe3rb.ma"
              className="rounded-2xl border bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <Mail className="h-6 w-6 text-[hsl(var(--brand-accent))]" />
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {sourceText("Email")}
              </p>
              <p className="mt-1 font-bold">contact@groupe3rb.ma</p>
            </a>
            <a
              href="tel:+212538995746"
              className="rounded-2xl border bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <Phone className="h-6 w-6 text-[hsl(var(--brand-accent))]" />
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {sourceText("Phone")}
              </p>
              <p className="mt-1 font-bold">+212 538 995 746</p>
            </a>
            <a
              href="https://maps.google.com/?q=Quartier+Koumtrafa+Temara+Maroc"
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <MapPin className="h-6 w-6 text-[hsl(var(--brand-accent))]" />
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {sourceText("Address")}
              </p>
              <p className="mt-1 font-bold">
                N° 155, rez-de-chaussée (sous-sol) Quartier Koumtrafa, 12000
                Témara, Maroc
              </p>
            </a>
          </div>
        </div>
      </section>

      <section id="apropos" className="bg-[hsl(var(--muted))] py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 className="text-3xl font-black tracking-tight">{sourceText("About")}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {sourceText(
                  "Groupe 3.R.B Extreme is a group of three service companies founded in 2014. 3.R.B Extreme specialises in cleaning, disinfection, technical staffing and events. 3.R.B Maroc specialises in guarding. EL RHRIB CASH handles money transfer, billing facilitation and courier.",
                )}
              </p>
            </div>
            <div className="relative h-64 overflow-hidden rounded-3xl bg-[hsl(var(--brand-primary))]">
              <div className="gradient-mesh absolute inset-0 opacity-80" />
              <div className="relative flex h-full items-center justify-center p-8 text-center text-white">
                <p className="text-xl font-black">
                  {sourceText("Quality of service.")}
                  <br />
                  {sourceText("Devotion to the craft.")}
                </p>
              </div>
            </div>
          </div>
          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="rounded-2xl border bg-card p-5">
                <dd className="text-3xl font-black text-[hsl(var(--brand-primary))]">
                  {stat.value}
                </dd>
                <dt className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {sourceText(stat.label)}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="bg-[hsl(var(--brand-primary))] py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/brand/3rb-logo-icon.png"
                alt={sourceText("3RB EXTREME")}
                width={32}
                height={32}
              />
              <span className="font-black">{sourceText("3RB EXTREME")}</span>
            </div>
            <p className="mt-4 text-sm text-white/70">
              {sourceText(
                "Satisfy our clients through the quality of our services, and assure them through devotion to our craft.",
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              {sourceText("Services")}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {SERVICES.slice(0, 5).map((s) => (
                <li key={s.name}>{sourceText(s.name)}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              {sourceText("Support")}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <a href="#tickets">{sourceText("Tickets")}</a>
              </li>
              <li>
                <a href="mailto:contact@groupe3rb.ma">{sourceText("Email")}</a>
              </li>
              <li>
                <Link href="/login">{sourceText("Client space")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              {sourceText("Legal")}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>
                <Link href="/privacy">{sourceText("Privacy")}</Link>
              </li>
              <li>
                <Link href="/terms">{sourceText("Terms")}</Link>
              </li>
              <li>
                <Link href="/security">{sourceText("Security")}</Link>
              </li>
            </ul>
            <div className="mt-5 flex gap-3">
              <a
                href="https://web.facebook.com/3rbextreme"
                aria-label={sourceText("Facebook")}
                className="rounded-full bg-white/10 p-2"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://www.linkedin.com/in/groupe-3rb-680169273/"
                aria-label={sourceText("LinkedIn")}
                className="rounded-full bg-white/10 p-2"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl px-4 text-sm text-white/60 sm:px-6">
          <p>{sourceText("© 2026 3RB EXTREME. All rights reserved.")}</p>
          <p className="mt-1 text-xs">{sourceText("Powered by EFOP Platform")}</p>
        </div>
      </footer>
    </div>
  );
}
