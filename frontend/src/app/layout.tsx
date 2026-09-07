import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/hooks/useAuth";
import { EfopToaster } from "@/components/ui/toast";
import { ExperienceProvider } from "@/lib/experience";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

const FALLBACK_TITLE = "Plateforme d’opérations financières";
const FALLBACK_DESCRIPTION = "Plateforme d’opérations financières d’entreprise";

/** Inline so Next/Script cannot be rewritten by browser extensions on hydrate. */
const EXPERIENCE_INIT = `(function(){try{var locale=localStorage.getItem("efop.locale")||"en";var theme=localStorage.getItem("efop.theme")||"system";var root=document.documentElement;root.lang=locale;root.dir=locale==="ar"?"rtl":"ltr";var dark=theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);root.classList.toggle("dark",dark);}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: FALLBACK_TITLE,
    template: "%s · 3RB Extreme",
  },
  description: FALLBACK_DESCRIPTION,
  applicationName: "3RB Extreme",
  openGraph: {
    siteName: "3RB Extreme",
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
  },
  icons: {
    icon: "/brand/3rb-logo-icon.png",
    apple: "/brand/3rb-logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning` on <html> covers the inline theme/locale
    // bootstrap, which sets lang/dir/.dark before hydration to avoid a flash.
    // It is repeated on <head> because browser extensions routinely inject
    // extra <script> tags there (chrome-extension://… is the common case).
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: EXPERIENCE_INIT }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <ExperienceProvider>{children}</ExperienceProvider>
          </AuthProvider>
        </QueryProvider>
        <EfopToaster />
      </body>
    </html>
  );
}
