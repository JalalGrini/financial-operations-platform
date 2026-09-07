/**
 * Guard for the PageHero action-button styling.
 *
 * BACKGROUND
 * ----------
 * PageHero is a fixed dark indigo gradient with text-white. It does not follow
 * the light/dark theme, so its action buttons must be styled with literal white
 * rather than theme tokens - `bg-card` there would invert in dark mode.
 *
 * That correct-but-unusual requirement was originally met by pasting the same
 * class string into every page: 15 identical copies of the solid button and 5 of
 * the translucent one, across 17 files. They had not drifted, but restyling the
 * primary call-to-action meant editing 17 files and hoping none were missed,
 * which is how drift starts.
 *
 * They are now the `onHero` and `onHeroOutline` Button variants. This test keeps
 * the literals from being pasted back in, because a re-pasted copy is invisible
 * in review - it renders identically on the day it is written and only diverges
 * later, once the variant is restyled and the stragglers are not.
 *
 * SCOPE
 * -----
 * Only src/app is swept. components/ui/button.tsx is where these exact strings
 * legitimately live, so including it would make the guard fail on the variant
 * definition itself.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const APP = path.join(SRC, "app");
const BUTTON = path.join(SRC, "components", "ui", "button.tsx");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGES = tsxFiles(APP).map((file) => ({
  file: path.relative(SRC, file),
  code: stripComments(readFileSync(file, "utf8")),
}));

describe("PageHero action button variants", () => {
  it("sweeps a non-empty set of app files", () => {
    // Vacuity check: an empty sweep would make every assertion below pass.
    expect(PAGES.length).toBeGreaterThan(20);
  });

  it("declares both hero variants on Button", () => {
    const button = readFileSync(BUTTON, "utf8");
    expect(button).toMatch(/onHero:/);
    expect(button).toMatch(/onHeroOutline:/);
    // Present in the variant union, not just the style map.
    expect(button).toMatch(/\|\s*"onHero"/);
    expect(button).toMatch(/\|\s*"onHeroOutline"/);
  });

  it("has no page pasting the solid hero button classes inline", () => {
    const offenders = PAGES.filter(({ code }) =>
      /bg-white\s+text-slate-950/.test(code),
    ).map(({ file }) => file);

    // Use variant="onHero" instead.
    expect(offenders).toEqual([]);
  });

  it("has no page pasting the translucent hero button classes inline", () => {
    const offenders = PAGES.filter(({ code }) =>
      /border-white\/30\s+bg-white\/15/.test(code),
    ).map(({ file }) => file);

    // Use variant="onHeroOutline" instead.
    expect(offenders).toEqual([]);
  });

  it("actually uses the variants at the call sites", () => {
    const solid = PAGES.filter(({ code }) => /variant="onHero"/.test(code));
    const outline = PAGES.filter(({ code }) =>
      /variant="onHeroOutline"/.test(code),
    );

    // Locks in the migration: 15 solid and 5 translucent call sites were
    // converted. If a page legitimately adds or removes a hero action, update
    // these numbers deliberately rather than loosening the assertion.
    expect(solid.length).toBe(15);
    // v17.20: deadlines, financial-records and companies heroes each
    // gained an onHeroOutline export button, so 5 -> 8. Updated
    // deliberately, as the comment above requires.
    // v17.25: the CNSS hero gained the monthly declaration export dialog,
    // so 8 -> 9. The payroll hero gained one too but was already counted,
    // since this counts pages carrying the variant, not buttons.
    expect(outline.length).toBe(9);
  });
});
