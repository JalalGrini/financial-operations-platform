import type { ReactNode } from "react";
import { TopBar } from "@/components/landing/TopBar";
import { LandingNav } from "@/components/landing/LandingNav";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { LandingExperienceControls } from "@/components/product/LandingExperienceControls";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";

export default function PublicCompaniesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="landing-shell relative min-h-screen bg-background text-foreground">
      <TopBar>
        <LandingNav
          languageSwitcher={<LandingExperienceControls />}
          themeSwitch={<ThemeSwitch />}
        />
      </TopBar>
      {children}
      <PublicFooter />
    </div>
  );
}
