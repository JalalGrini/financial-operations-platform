"use client";

/**
 * Public navbar shared by the landing page and company pages.
 *
 * Hash links always go through `/#section` so they work from nested routes
 * such as `/companies/[slug]`.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock, Menu, X } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { PUBLIC_COMPANIES } from "./public-companies";

const NAV_LINKS = [
  { href: "/#hero", label: "Home" },
  { href: "/#conception", label: "Conception" },
  { href: "/#services", label: "Solution&Services" },
  { href: "/#galery", label: "Gallery" },
  { href: "/#equipe", label: "Partenaire & Client" },
  { href: "/#contact", label: "Contact" },
] as const;

type LandingNavProps = {
  /** Optional slot so the landing page can keep LandingExperienceControls. */
  languageSwitcher?: ReactNode;
  themeSwitch?: ReactNode;
};

export function LandingNav({
  languageSwitcher,
  themeSwitch,
}: LandingNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    setMobileOpen(false);
    setGroupOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!groupOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) {
        setGroupOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGroupOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [groupOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const language = languageSwitcher ?? <LanguageSwitcher />;
  const theme = themeSwitch ?? <ThemeSwitch />;

  return (
    <>
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
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-[0.9375rem] font-black tracking-[-0.02em]">
            Groupe 3RB
          </span>
        </span>
      </Link>

      <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
        <a
          href="/#hero"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Home
        </a>
        <a
          href="/#conception"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Conception
        </a>
        <div
          ref={groupRef}
          className="relative"
          onMouseEnter={() => setGroupOpen(true)}
          onMouseLeave={() => setGroupOpen(false)}
        >
          <a
            href="/#apropos"
            className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
            aria-expanded={groupOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() => setGroupOpen((open) => !open)}
          >
            Groupe 3RB
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                groupOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </a>
          <AnimatePresence>
            {groupOpen ? (
              <motion.div
                id={menuId}
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-white shadow-lg dark:bg-card"
              >
                {PUBLIC_COMPANIES.map((company) => (
                  <Link
                    key={company.slug}
                    href={`/companies/${company.slug}`}
                    role="menuitem"
                    className="block px-4 py-3 transition-colors duration-150 hover:bg-primary/5"
                    style={{ padding: "12px 16px" }}
                  >
                    <span className="block text-sm font-bold text-foreground">
                      {company.name}
                    </span>
                  </Link>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <a
          href="/#services"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Solution&Services
        </a>
        <a
          href="/#galery"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Gallery
        </a>
        <a
          href="/#equipe"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Partenaire & Client
        </a>
        <a
          href="/#contact"
          className="rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground"
        >
          Contact
        </a>
      </nav>

      <div className="flex items-center gap-2">
        {language}
        {theme}
        <Link
          href="/login"
          className="landing-cta-button inline-flex h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-[0.875rem] font-bold text-primary-foreground transition-transform duration-150 hover:scale-[1.02]"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">
            <SourceText source="Espace client" />
          </span>
          <span className="sm:hidden">
            <SourceText source="Espace client" />
          </span>
        </Link>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls="landing-mobile-nav"
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            id="landing-mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-border bg-background/95 shadow-lg backdrop-blur-xl lg:hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile">
              {NAV_LINKS.slice(0, 2).map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-primary/5"
                >
                  {link.label}
                </a>
              ))}
              <p className="px-3 pt-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Groupe 3RB
              </p>
              {PUBLIC_COMPANIES.map((company) => (
                <Link
                  key={company.slug}
                  href={`/companies/${company.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-3 hover:bg-primary/5"
                >
                  <span className="block text-sm font-bold text-foreground">
                    {company.name}
                  </span>
                </Link>
              ))}
              {NAV_LINKS.slice(2).map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-primary/5"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default LandingNav;
