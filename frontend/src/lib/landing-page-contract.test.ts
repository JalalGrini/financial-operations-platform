import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import en from "./i18n/source.en.json";
import fr from "./i18n/source.fr.json";
import ar from "./i18n/source.ar.json";

const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const required = [
  "Control every operation.",
  "Move with confidence.",
  "Security and guarding",
  "Cleaning and disinfection",
  "Financial records",
  "Three companies. One standard of commitment.",
  "Are financial documents ready for predefined templates?",
  "Turn daily operations into controlled, visible progress.",
] as const;

describe("French-first public landing contract", () => {
  it("catalogues core landing content in all locales", () => {
    for (const key of required) {
      expect(en[key]).toBe(key);
      expect(fr[key]).toBeTruthy();
      expect(fr[key]).not.toBe(key);
      expect(ar[key]).toBeTruthy();
      expect(ar[key]).not.toBe(key);
    }
  });

  it("uses local brand assets and public locale controls", () => {
    expect(page).toContain("/brand/3rb-logo-icon.png");
    expect(page).toContain("LandingExperienceControls");
    expect(page).not.toContain("GlobalControls");
  });

  it("ships layered motion with a reduced-motion safety gate", () => {
    for (const motion of [
      "landing-orb-drift",
      "landing-bar-rise",
      "landing-live-pulse",
      "landing-float",
      "landing-marquee",
      "landing-ring-spin",
    ])
      expect(css).toContain(motion);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("documents the predefined-template transition", () => {
    expect(page).toContain("predefined-template phase");
  });
});
