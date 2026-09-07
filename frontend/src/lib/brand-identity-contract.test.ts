/**
 * Guard: the public landing page must keep using the real 3RB identity, and the
 * components adapted for it must stay wired.
 *
 * Every assertion here exists because `tsc`, `eslint` and the rendering tests
 * are all structurally blind to it:
 *
 * - An image path is a string. `src="/brand/partners/xaluca.jpg"` type-checks
 *   perfectly when the file is not on disk; the failure is a broken image in
 *   the browser. Nothing else in this repo checks that a public asset exists.
 * - The brand gradients previously ran `--primary` (the app's indigo, a colour
 *   the logo does not contain). Repointing them at the sampled ramp is a
 *   one-line change that a later refactor could silently undo, and no visual
 *   test would notice.
 * - An adapted component that nothing imports is dead code, which is exactly
 *   how `ExportableListMixin` sat unused for a whole release: it was written,
 *   documented, and imported by nothing, and dead code cannot fail.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const PAGE = fs.readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const TAILWIND = fs.readFileSync(path.join(ROOT, "tailwind.config.js"), "utf8");

/** Comments must not satisfy an assertion, nor hide a violation. */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) =>
      p1 + m.slice(p1.length).replace(/./g, " "),
    );
}

const PAGE_CODE = blankComments(PAGE);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) =>
  m.replace(/[^\n]/g, " "),
);

/** Pull every local asset path the page references. */
const assetPaths = [...PAGE_CODE.matchAll(/"(\/brand\/[^"]+)"/g)].map(
  (m) => m[1],
);
/** Template-literal form used by the partner marquee. */
const templateAssets = [
  ...PAGE_CODE.matchAll(/`(\/brand\/[^`$]*)\$\{[^}]+\}`/g),
].map((m) => m[1]);

/** Read one CSS rule body by selector. */
function ruleBody(selector: string): string {
  const index = CSS_CODE.indexOf(selector);
  if (index === -1) return "";
  const open = CSS_CODE.indexOf("{", index);
  const close = CSS_CODE.indexOf("}", open);
  return CSS_CODE.slice(open + 1, close);
}

describe("3RB brand assets are real files on disk", () => {
  it("is not vacuous: the page references a meaningful number of assets", () => {
    // If the extraction regex breaks, every existence check below passes by
    // iterating an empty list.
    expect(assetPaths.length).toBeGreaterThan(8);
    expect(templateAssets.length).toBeGreaterThan(0);
  });

  it("every /brand asset referenced by the landing page exists", () => {
    const missing = assetPaths.filter(
      (asset) => !fs.existsSync(path.join(ROOT, "public", asset)),
    );
    expect(
      missing,
      `these paths are referenced by src/app/page.tsx but are not in public/:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every partner logo named in the page exists in public/brand/partners", () => {
    const files = [...PAGE_CODE.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(10);
    const dir = path.join(ROOT, "public", "brand", "partners");
    const missing = files.filter((file) => !fs.existsSync(path.join(dir, file)));
    expect(missing, `missing partner logos: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps the 5.9 MB full logo off the landing page", () => {
    // public/brand/3rb-logo.png is 5.9 MB. LANDING_PAGE_UI_GUIDE flags it
    // explicitly: using it uncompressed would dominate mobile load time.
    expect(PAGE_CODE).not.toContain("/brand/3rb-logo.png");
    expect(PAGE_CODE).toContain("/brand/3rb-logo-icon.png");
  });
});

describe("brand colour ramps are the sampled logo colours", () => {
  it("defines the blue and orange ramps in light and dark", () => {
    for (const token of [
      "--brand-blue-500",
      "--brand-blue-700",
      "--brand-orange-500",
      "--brand-orange-700",
    ]) {
      // Once in :root, once in .dark - a ramp defined only for light mode
      // collapses to the light value on a dark canvas.
      const occurrences = CSS_CODE.split(`${token}:`).length - 1;
      expect(occurrences, `${token} must be declared twice`).toBe(2);
    }
  });

  it("pins the core hues measured off the logo", () => {
    // Sampled by scripts/sample-logo-colors.js: #0096D2 and #F08214.
    expect(CSS_CODE).toContain("--brand-blue-500: 197 100% 41%");
    expect(CSS_CODE).toContain("--brand-orange-500: 30 88% 51%");
    expect(CSS_CODE).toContain("--brand-warm: 30 88% 51%");
  });

  it("exposes both ramps to Tailwind", () => {
    expect(TAILWIND).toContain("--brand-blue-500");
    expect(TAILWIND).toContain("--brand-orange-500");
  });

  it("runs the brand gradients on the logo ramp, not the app indigo", () => {
    // This is the specific correction the owner asked for: the gradient must
    // carry the logo's blue AND orange. Before, it went --primary (indigo) to
    // --brand-warm, mixing in a hue the mark does not contain.
    for (const selector of [".landing-gradient-text", ".landing-stat-number"]) {
      const body = ruleBody(selector);
      expect(body, `${selector} rule not found`).not.toBe("");
      expect(body, `${selector} must use the blue ramp`).toMatch(
        /--brand-blue-\d00/,
      );
      expect(body, `${selector} must use the orange ramp`).toMatch(
        /--brand-orange-\d00/,
      );
      expect(body, `${selector} must not fall back to --primary`).not.toContain(
        "var(--primary)",
      );
    }
  });
});

describe("adapted open-source components are wired, not dead code", () => {
  const COMPONENTS = [
    ["AuroraBackdrop", "aurora-backdrop"],
    ["Marquee", "marquee"],
    ["NumberTicker", "number-ticker"],
    ["BlurFade", "blur-fade"],
    ["SpotlightCard", "spotlight-card"],
    ["ShineBorder", "shine-border"],
  ] as const;

  it.each(COMPONENTS)("%s exists, is imported and is rendered", (name, file) => {
    const source = path.join(ROOT, "src/components/ui", `${file}.tsx`);
    expect(fs.existsSync(source), `${file}.tsx is missing`).toBe(true);
    expect(PAGE_CODE, `${name} is not imported`).toContain(
      `@/components/ui/${file}`,
    );
    expect(PAGE_CODE, `${name} is imported but never rendered`).toContain(
      `<${name}`,
    );
  });

  it("keeps the server-safe components out of the client bundle", () => {
    // page.tsx is a server component. A stray "use client" in one of these
    // would pull it - and everything it renders - into the client bundle.
    //
    // Comments must be blanked first. These files *discuss* "use client" in
    // their header comments to explain why they do not use it, and the first
    // version of this assertion failed on exactly that - the same
    // guard-matches-its-own-documentation trap the project already recorded.
    for (const file of ["aurora-backdrop", "marquee", "shine-border"]) {
      const source = blankComments(
        fs.readFileSync(
          path.join(ROOT, "src/components/ui", `${file}.tsx`),
          "utf8",
        ),
      );
      expect(source, `${file}.tsx must stay server-safe`).not.toContain(
        "use client",
      );
    }
  });

  it("marks the interactive components as client components", () => {
    for (const file of ["number-ticker", "blur-fade", "spotlight-card"]) {
      const source = blankComments(
        fs.readFileSync(
          path.join(ROOT, "src/components/ui", `${file}.tsx`),
          "utf8",
        ),
      );
      // Must be the real directive on the first line, not a mention.
      expect(source.trimStart(), `${file}.tsx needs "use client"`).toMatch(
        /^"use client";/,
      );
    }
  });

  it("respects reduced motion in every animated component", () => {
    // The global CSS rule zeroes animation-duration, which freezes an infinite
    // animation mid-cycle instead of resting it. These three declare their own
    // resting state, and the JS-driven ticker cannot be reached by CSS at all.
    expect(CSS_CODE).toContain("prefers-reduced-motion: reduce");
    expect(ruleBody(".aurora-layer-blue")).toBeTruthy();
    for (const file of ["number-ticker", "blur-fade"]) {
      const source = fs.readFileSync(
        path.join(ROOT, "src/components/ui", `${file}.tsx`),
        "utf8",
      );
      expect(source, `${file}.tsx must honour reduced motion`).toContain(
        "useReducedMotion",
      );
    }
  });
});

describe("landing page structural rules from LANDING_PAGE_UI_GUIDE", () => {
  it("stays a server component", () => {
    expect(PAGE_CODE).not.toContain("use client");
  });

  it("keeps the health probe uncached and the sign-in route reachable", () => {
    expect(PAGE_CODE).toContain('export const dynamic = "force-dynamic"');
    expect(PAGE_CODE).toContain("getHealthData");
    expect(PAGE_CODE).toContain('href="/login"');
  });

  it("keeps the footer links the sibling public pages expect", () => {
    for (const href of ["/security", "/privacy", "/status"]) {
      expect(PAGE_CODE, `footer must link ${href}`).toContain(`href="${href}"`);
    }
  });

  it("keeps the header anchor targets it navigates to", () => {
    for (const id of ["groupe", "services", "plateforme", "contact"]) {
      expect(PAGE_CODE, `missing anchor id ${id}`).toContain(`id="${id}"`);
      expect(PAGE_CODE, `missing anchor link #${id}`).toContain(`"#${id}"`);
    }
  });

  it("uses logical direction utilities rather than physical ones", () => {
    // Arabic is a supported locale. `ml-`/`mr-`/`left-`/`right-` do not flip.
    const physical = [
      ...PAGE_CODE.matchAll(/className="[^"]*\b(ml-\d|mr-\d|pl-\d|pr-\d)\b/g),
    ].map((m) => m[1]);
    expect(
      physical,
      `use ms-/me-/ps-/pe- instead: found ${physical.join(", ")}`,
    ).toEqual([]);
  });

  it("gives every directional arrow an RTL flip", () => {
    // An arrow that does not flip points backwards in Arabic.
    const arrows = PAGE_CODE.split("<ArrowRight").slice(1);
    expect(arrows.length).toBeGreaterThan(3);
    const unflipped = arrows.filter((chunk) => {
      const tag = chunk.slice(0, chunk.indexOf("/>"));
      return !tag.includes("rtl:rotate-180");
    });
    expect(
      unflipped.length,
      `${unflipped.length} ArrowRight icon(s) have no rtl:rotate-180`,
    ).toBe(0);
  });
});

describe("portal components do not reintroduce setState-in-effect", () => {
  // Both files portalled to document.body in v17.26 using a
  // `useState(false)` + `useEffect(() => setMounted(true))` pair. That tripped
  // react-hooks/set-state-in-effect and cost a second render pass on every
  // mount. It was also redundant: the portal is gated on `open`, which starts
  // false and is only set by the trigger's onClick, so the DOM provably exists
  // by the time the portal renders. eslint would catch a regression, but
  // `eslint src` is an owner-side gate that was not run for a whole release -
  // which is exactly how these two errors shipped. This runs in the suite.
  it.each(["export-button", "monthly-export-dialog"])(
    "%s.tsx has no mounted flag",
    (file) => {
      const source = blankComments(
        fs.readFileSync(
          path.join(ROOT, "src/components/ui", `${file}.tsx`),
          "utf8",
        ),
      );
      expect(source, `${file}.tsx still declares a mounted flag`).not.toMatch(
        /setMounted/,
      );
      expect(source).toContain("createPortal");
    },
  );
});
