import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { CONTAINER } from "./design-system";

const FOOTER_LINKS = [
  { href: "/#hero", label: "Home" },
  { href: "/#services", label: "Services" },
  { href: "/#contact", label: "Contact" },
  { href: "/#tickets", label: "Tickets" },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-[hsl(var(--primary)/0.10)] bg-[hsl(var(--landing-ink))] py-16 text-white">
      <div className={CONTAINER}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/brand/3rb-logo-icon.png"
                alt="Groupe 3.R.B"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
              <span className="text-[0.9375rem] font-black">
                {String("Groupe 3.R.B")}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-[0.875rem] leading-relaxed text-white/60">
              <SourceText source="Satisfying our clients through the quality of our services, and assuring them through devotion to our craft." />
            </p>
            <p className="mt-4 text-[0.8125rem] text-white/45">
              {String("N\u00b0 155, Quartier Koumtrafa, 12000 T\u00e9mara, Maroc")}
            </p>
          </div>

          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/40">
              <SourceText source="Navigate" />
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[0.875rem] text-white/70 transition-colors duration-150 hover:text-white"
                  >
                    <SourceText source={link.label} />
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-[0.875rem] text-white/70 transition-colors duration-150 hover:text-white"
                >
                  <SourceText source="Client portal" />
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/40">
              <SourceText source="Trust" />
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              <li>
                <Link
                  href="/security"
                  className="text-[0.875rem] text-white/70 transition-colors duration-150 hover:text-white"
                >
                  <SourceText source="Security" />
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-[0.875rem] text-white/70 transition-colors duration-150 hover:text-white"
                >
                  <SourceText source="Privacy" />
                </Link>
              </li>
              <li>
                <Link
                  href="/status"
                  className="text-[0.875rem] text-white/70 transition-colors duration-150 hover:text-white"
                >
                  <SourceText source="Status" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-[0.8125rem] text-white/45">
            {String("\u00a9 2026 Groupe 3.R.B")}
          </p>
          <p className="text-[0.8125rem] text-white/45">
            <SourceText source="Operating across Morocco since 2014" />
          </p>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
