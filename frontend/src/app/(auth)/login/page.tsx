"use client";

import { Suspense } from "react";
import { LoginPageContent } from "./login-content";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-background dark:bg-[hsl(var(--landing-ink))]">
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
