import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { LandingExperienceControls } from "@/components/product/LandingExperienceControls";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { TopBar } from "@/components/landing/TopBar";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PUBLIC_COMPANIES } from "@/components/landing/public-companies";
import { publicCompanyHref } from "@/components/landing/public-company-cards";

const navLinkClass =
  "rounded-full px-3.5 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--primary)/0.07)] hover:text-foreground";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-shell relative min-h-screen [overflow-x:clip] bg-background text-foreground">
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
            <SourceText source="Home" />
          </a>
          <a href="/#services" className={navLinkClass}>
            <SourceText source="Services" />
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
          <a href="/#contact" className={navLinkClass}>
            <SourceText source="Contact" />
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
            <SourceText source="Espace client" />
          </Link>
        </div>
      </TopBar>
      {children}
      <PublicFooter />
    </div>
  );
}
