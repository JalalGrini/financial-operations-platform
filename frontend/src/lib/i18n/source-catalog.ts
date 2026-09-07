import type { Locale } from "@/lib/experience";
import en from "./source.en.json";
import fr from "./source.fr.json";
import ar from "./source.ar.json";

export const sourceCatalogs: Record<Locale, Record<string, string>> = {
  en,
  fr,
  ar,
};

export function translateSource(source: string, locale: Locale): string {
  return sourceCatalogs[locale][source] ?? sourceCatalogs.en[source] ?? source;
}

/** Translate a legacy string during render without requiring a hook at every
 * call site. ExperienceProvider remounts its child tree on locale changes so
 * these values are recalculated immediately without a document navigation. */
export function sourceText(source: string): string {
  if (typeof document === "undefined") return source;
  const locale = document.documentElement.lang as Locale;
  return translateSource(
    source,
    locale === "fr" || locale === "ar" ? locale : "en",
  );
}
