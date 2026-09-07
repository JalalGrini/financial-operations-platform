"use client";

import { Suspense } from "react";
import { LoginPageContent } from "./login-content";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-background dark:bg-[hsl(var(--landing-ink))]">
      <div className="absolute right-4 top-4 z-30">
        <ThemeSwitch />
      </div>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#EEF2FF_0%,#E0F2FE_100%)] dark:bg-[hsl(var(--landing-ink))]">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <LoginPageContent />
      </Suspense>
    </div>
  );
}
