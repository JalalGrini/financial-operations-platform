"use client";

import { useState } from "react";
import { Palette, Languages, Save, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { PageHero } from "@/components/ui/page-hero";
import { PageHeader } from "@/components/ui/page-components";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useExperience } from "@/lib/experience";
import { WriteOnly } from "@/components/auth/WriteOnly";

export default function SettingsPage() {
  const { locale, theme, setLocale, setTheme, save, t } = useExperience();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await save();
      toast.success(sourceText("Preferences saved"));
    } catch (error) {
      toast.error(sourceText("Save preferences failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        icon={Palette}
        eyebrow="Account preferences"
        title={sourceText("Settings")}
        description={sourceText("Preferences are saved to your account and restored on other devices.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            onClick={submit}
            disabled={busy}
          >
            <Save className="me-2 h-4 w-4" />
            {t("save")}
          </Button>
        </WriteOnly>}
      />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Languages className="h-5 w-5 text-primary" />
              <SourceText source="Display and language" />
            </CardTitle>
            <CardDescription>
              <SourceText source="Choose how EFOP appears everywhere: navigation, forms, notifications and dashboards." />
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">{t("language")}</span>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as any)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="fr">
                  <SourceText source="Français" />
                </option>
                <option value="en">
                  <SourceText source="English" />
                </option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">{t("theme")}</span>
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as any)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="light">{t("light")}</option>
                <option value="dark">{t("dark")}</option>
                <option value="system">{t("system")}</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-primary" />
              <SourceText source="Preference summary" />
            </CardTitle>
            <CardDescription>
              <SourceText source="These choices persist with your account and are restored on your next session." />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <SourceText source="Current language" />
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {locale === "fr"
                  ? sourceText("Français")
                  : locale === "ar"
                    ? "العربية"
                    : sourceText("English")}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <SourceText source="Current theme" />
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {theme === "light"
                  ? t("light")
                  : theme === "dark"
                    ? t("dark")
                    : t("system")}
              </div>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <SourceText source="French-first with full RTL support" />
              </div>
              <SourceText source="Language changes immediately update navigation, buttons, dashboards and workflow text across the application shell." />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
