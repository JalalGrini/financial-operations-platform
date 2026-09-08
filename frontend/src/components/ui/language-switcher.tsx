"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useExperience, type Locale } from "@/lib/experience";

const languages = [
  { code: "fr" as const, label: "Français", short: "FR" },
  { code: "en" as const, label: "English", short: "EN" },
  { code: "ar" as const, label: "العربية", short: "AR" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useExperience();
  const current = languages.find((l) => l.code === locale) || languages[0];

  return (
    <Select
      value={locale}
      onValueChange={(lang) => setLocale(lang as Locale)}
    >
      <SelectTrigger
        aria-label={current.label}
        className="relative z-20 h-8 w-10 shrink-0 justify-center rounded-md border border-border bg-background px-0 text-xs font-semibold [&>svg]:hidden"
      >
        {current.short}
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={4}
        className="min-w-[120px] rounded-xl border-border bg-background p-1 shadow-lg"
      >
        {languages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code} className="rounded-lg text-sm">
            <span className="me-2 font-mono text-xs font-bold">{lang.short}</span>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
