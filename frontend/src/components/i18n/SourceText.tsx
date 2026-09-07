"use client";

import { useExperience } from "@/lib/experience";
import { translateSource } from "@/lib/i18n/source-catalog";

export function SourceText({
  source,
  leading = false,
  trailing = false,
}: {
  source: string;
  leading?: boolean;
  trailing?: boolean;
}) {
  const { locale } = useExperience();
  const translated = translateSource(source, locale);
  return <>{`${leading ? " " : ""}${translated}${trailing ? " " : ""}`}</>;
}
