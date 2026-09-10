"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export type Locale = "en" | "fr" | "ar";
export type Theme = "light" | "dark" | "system";

/**
 * Best-effort background sync of the user's language/theme choice.
 *
 * These writes are deliberately fire-and-forget: the chosen value is already
 * applied to the DOM and persisted in localStorage before we get here, so the
 * server copy is a convenience for the user's next device, not the source of
 * truth. Previously these were bare `void apiClient.put(...)` calls with no
 * rejection handler, so any non-2xx turned into an unhandled promise rejection
 * that Next's dev overlay reported as a full-screen "Runtime AxiosError".
 *
 * The common trigger is entirely expected: while `must_change_password` is set,
 * CookieJWTAuthentication refuses every path outside the password-change
 * allowlist, so toggling the theme or language on the forced-rotation screen
 * returns 403. That must not look like a crash, and it must not be "fixed" by
 * widening the auth allowlist, which would let a write through before the
 * mandatory password rotation.
 */
function syncPreferences(preferences: Record<string, string>): void {
  void apiClient.put("/accounts/me/preferences/", { preferences }).catch(() => {
    // Intentionally ignored - see the note above.
  });
}

const messages = {
  en: {
    dashboard: "Dashboard",
    notifications: "Notifications",
    tagged: "Tagged for me",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    settings: "Settings",
    save: "Save preferences",
    markAll: "Mark all read",
    emptyNotifications: "No notifications.",
    open: "Open",
    resolve: "Mark handled",
    profile: "Profile",
    logout: "Log out",
    taggedDescription:
      "Active assignments remain here until you mark them handled",
    emptyTagged: "No active tagged items.",
    removeTag: "Remove tag",
  },
  fr: {
    dashboard: "Tableau de bord",
    notifications: "Notifications",
    tagged: "Éléments assignés",
    language: "Langue",
    theme: "Thème",
    light: "Clair",
    dark: "Sombre",
    system: "Système",
    settings: "Paramètres",
    save: "Enregistrer les préférences",
    markAll: "Tout marquer comme lu",
    emptyNotifications: "Aucune notification.",
    open: "Ouvrir",
    resolve: "Marquer comme traité",
    profile: "Profil",
    logout: "Se déconnecter",
    taggedDescription:
      "Les éléments assignés restent ici jusqu’à leur traitement",
    emptyTagged: "Aucun élément assigné actif.",
    removeTag: "Retirer le tag",
  },
  ar: {
    dashboard: "لوحة التحكم",
    notifications: "الإشعارات",
    tagged: "المُسند إليّ",
    language: "اللغة",
    theme: "المظهر",
    light: "فاتح",
    dark: "داكن",
    system: "النظام",
    settings: "الإعدادات",
    save: "حفظ التفضيلات",
    markAll: "تحديد الكل كمقروء",
    emptyNotifications: "لا توجد إشعارات.",
    open: "فتح",
    resolve: "وضع علامة كمُنجز",
    profile: "الملف الشخصي",
    logout: "تسجيل الخروج",
    taggedDescription: "تبقى المهام المسندة هنا حتى تحددها كمنجزة",
    emptyTagged: "لا توجد عناصر مسندة نشطة.",
    removeTag: "إزالة الإسناد",
  },
} as const;

type Key = keyof typeof messages.en;
type Ctx = {
  locale: Locale;
  theme: Theme;
  setLocale: (value: Locale) => void;
  setTheme: (value: Theme) => void;
  t: (key: Key) => string;
  save: () => Promise<void>;
};

const ExperienceContext = createContext<Ctx | undefined>(undefined);

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "fr" || value === "ar";
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function apply(theme: Theme, locale: Locale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = locale === "ar" ? "rtl" : "ltr";
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

export function ExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setThemeState] = useState<Theme>("system");
  const userPreferenceKey = user ? `efop.preferences.${user.id}` : null;

  useEffect(() => {
    const storedLocale = localStorage.getItem("efop.locale");
    const storedTheme = localStorage.getItem("efop.theme");
    const nextLocale = isLocale(storedLocale) ? storedLocale : "en";
    const nextTheme = isTheme(storedTheme) ? storedTheme : "system";

    apply(nextTheme, nextLocale);

    const timer = window.setTimeout(() => {
      setLocaleState(nextLocale);
      setThemeState(nextTheme);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.title =
      locale === "fr"
        ? "Plateforme d’opérations financières"
        : locale === "ar"
          ? "منصة العمليات المالية"
          : "Financial Operations Platform";
    const description =
      locale === "fr"
        ? "Plateforme de gestion financière d’entreprise"
        : locale === "ar"
          ? "منصة العمليات المالية للمؤسسات"
          : "Enterprise Financial Operations Platform";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
    document.cookie = `efop_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale]);

  useEffect(() => {
    if (!user) return;

    const locallySaved = userPreferenceKey
      ? localStorage.getItem(userPreferenceKey)
      : null;
    let localPreferences: Record<string, string> = {};
    try {
      localPreferences = locallySaved ? JSON.parse(locallySaved) : {};
    } catch {
      localPreferences = {};
    }

    apiClient
      .get<any>("/accounts/me/preferences/")
      .then((response) => {
        const preferences =
          response?.data?.preferences ?? response?.preferences ?? {};
        // A user-specific local choice wins over an older server value. This
        // prevents a refresh from reverting a language/theme change made in
        // the top bar before the preference request completed.
        const preferredLocale =
          localPreferences.preferredLanguage ?? preferences.preferredLanguage;
        const preferredTheme =
          localPreferences.preferredTheme ?? preferences.preferredTheme;
        const nextLocale: Locale = isLocale(preferredLocale)
          ? preferredLocale
          : "en";
        const nextTheme: Theme = isTheme(preferredTheme)
          ? preferredTheme
          : "system";

        setLocaleState(nextLocale);
        setThemeState(nextTheme);
        localStorage.setItem("efop.locale", nextLocale);
        localStorage.setItem("efop.theme", nextTheme);
        apply(nextTheme, nextLocale);
        if (userPreferenceKey) {
          localStorage.setItem(
            userPreferenceKey,
            JSON.stringify({
              preferredLanguage: nextLocale,
              preferredTheme: nextTheme,
            }),
          );
        }

        if (locallySaved) {
          syncPreferences({
            preferredLanguage: nextLocale,
            preferredTheme: nextTheme,
          });
        }
      })
      .catch(() => {});
  }, [user, userPreferenceKey]);

  const setLocale = useCallback(
    (value: Locale) => {
      setLocaleState(value);
      localStorage.setItem("efop.locale", value);
      apply(theme, value);
      if (userPreferenceKey) {
        const preferences = {
          preferredLanguage: value,
          preferredTheme: theme,
        };
        localStorage.setItem(userPreferenceKey, JSON.stringify(preferences));
        syncPreferences(preferences);
      }
    },
    [theme, userPreferenceKey],
  );

  const setTheme = useCallback(
    (value: Theme) => {
      setThemeState(value);
      localStorage.setItem("efop.theme", value);
      apply(value, locale);
      if (userPreferenceKey) {
        const preferences = {
          preferredLanguage: locale,
          preferredTheme: value,
        };
        localStorage.setItem(userPreferenceKey, JSON.stringify(preferences));
        syncPreferences(preferences);
      }
    },
    [locale, userPreferenceKey],
  );

  const save = useCallback(async () => {
    await apiClient.put("/accounts/me/preferences/", {
      preferences: {
        preferredLanguage: locale,
        preferredTheme: theme,
      },
    });
  }, [locale, theme]);

  const translate = useCallback(
    (key: Key) => messages[locale][key] || messages.en[key],
    [locale],
  );

  const value = useMemo(
    () => ({ locale, theme, setLocale, setTheme, t: translate, save }),
    [locale, theme, setLocale, setTheme, translate, save],
  );

  return (
    <ExperienceContext.Provider value={value}>
      {/*
        sourceText() reads document.documentElement.lang during render and is
        not a hook, so pages that use it would otherwise keep the previous
        language until navigation. Keying the tree forces those strings to
        recompute when the locale changes.
      */}
      <Fragment key={locale}>{children}</Fragment>
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience requires ExperienceProvider");
  return value;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `dateStyle` / `timeStyle` cannot be combined with `day` / `month` / `year`
 * (or hour/minute). Mixing them throws `Invalid option : option` in V8.
 */
function datetimeFormatOptions(
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  const extra = options ?? {};
  if (extra.dateStyle != null || extra.timeStyle != null) {
    const resolved: Intl.DateTimeFormatOptions = {};
    if (extra.dateStyle) resolved.dateStyle = extra.dateStyle;
    if (extra.timeStyle) resolved.timeStyle = extra.timeStyle;
    if (extra.timeZone) resolved.timeZone = extra.timeZone;
    if (typeof extra.hour12 === "boolean") resolved.hour12 = extra.hour12;
    return resolved;
  }
  const resolved: Intl.DateTimeFormatOptions = {
    day: extra.day ?? "2-digit",
    month: extra.month ?? "2-digit",
    year: extra.year ?? "numeric",
  };
  if (extra.weekday) resolved.weekday = extra.weekday;
  if (extra.hour) resolved.hour = extra.hour;
  if (extra.minute) resolved.minute = extra.minute;
  if (extra.second) resolved.second = extra.second;
  if (typeof extra.hour12 === "boolean") resolved.hour12 = extra.hour12;
  if (extra.timeZone) resolved.timeZone = extra.timeZone;
  return resolved;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale = "fr",
  options?: Intl.DateTimeFormatOptions,
) {
  const date = parseDate(value);
  if (!date) return "—";
  const formatOptions = datetimeFormatOptions(options);
  const tag =
    locale === "ar" ? "ar-MA" : locale === "en" ? "en-GB" : "fr-MA";
  try {
    // Date-only stays DD/MM/YYYY via fr-MA. Style-based calls keep the locale.
    const useStyle = Boolean(options?.dateStyle || options?.timeStyle);
    return new Intl.DateTimeFormat(useStyle ? tag : "fr-MA", formatOptions).format(
      date,
    );
  } catch {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
    } catch {
      return "—";
    }
  }
}

export function formatMoney(
  value: number | string,
  currency: string,
  locale: Locale,
) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const tag =
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB";
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency: currency || "MAD",
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(tag)} ${currency || "MAD"}`;
  }
}
