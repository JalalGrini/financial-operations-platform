/**
 * Guard for the shared <GuidePanel />.
 *
 * Twelve pages used to carry their own copy of this panel as ~31 lines of
 * hand-copied markup. They now call one component. Two things can silently
 * undo that, and neither would fail tsc, eslint or any other test:
 *
 *  1. Someone pastes the raw markup back onto a page instead of calling the
 *     component, and the duplication creeps back one screen at a time.
 *  2. A refactor of the component stops routing a prop through `sourceText`,
 *     which would leave that text permanently English while everything around
 *     it translates. Nothing type-checks that.
 *
 * The string census is the important part: the conversion moved 72 strings out
 * of markup and into props, and a dropped bullet is invisible at runtime unless
 * someone happens to look at that one screen in that one locale.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const APP = path.join(SRC, "app/(protected)");
const COMPONENT = path.join(SRC, "components/ui/guide-panel.tsx");

/** The markup that must no longer appear on any page. */
const RAW_WRAPPER = 'rounded-2xl border border-primary/15 bg-primary/5 p-5';

/** Every page that had a guide panel. */
const PAGES = [
  "audit-log/page.tsx",
  "companies/[id]/edit/page.tsx",
  "configuration/templates/page.tsx",
  "personnel/employments/[id]/edit/page.tsx",
  "personnel/employments/page.tsx",
  "personnel/payroll/new/page.tsx",
  "personnel/payroll/page.tsx",
  "personnel/personnel/[id]/edit/page.tsx",
  "personnel/personnel/page.tsx",
  "personnel/reports/page.tsx",
  "personnel/salaries/page.tsx",
  "reports/page.tsx",
];

/** Total strings the conversion moved into props, across all twelve pages. */
const TOTAL_STRINGS = 72;

const read = (file: string) => fs.readFileSync(file, "utf8");

/** Comments must not satisfy or break any check below. */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
}

/** The <GuidePanel ... /> call on a page, or null if it has none. */
function panelCall(source: string): string | null {
  const start = source.indexOf("<GuidePanel");
  if (start === -1) return null;
  const end = source.indexOf("/>", start);
  if (end === -1) return null;
  return source.slice(start, end + 2);
}

const pageSources = PAGES.map((rel) => ({
  rel,
  source: blankComments(read(path.join(APP, rel))),
}));
const component = blankComments(read(COMPONENT));

describe("guide panel contract", () => {
  it("is not vacuous: real pages, a real component, substantial content", () => {
    expect(PAGES.length).toBe(12);
    expect(component.length).toBeGreaterThan(800);
    for (const { rel, source } of pageSources) {
      expect(source.length, rel).toBeGreaterThan(3000);
    }
  });

  it("every page renders the shared component instead of its own markup", () => {
    const missing = pageSources
      .filter(({ source }) => !source.includes("<GuidePanel"))
      .map(({ rel }) => rel);
    expect(missing).toEqual([]);

    const notImported = pageSources
      .filter(({ source }) => !source.includes('from "@/components/ui/guide-panel"'))
      .map(({ rel }) => rel);
    expect(notImported).toEqual([]);
  });

  it("the duplicated markup is gone from every page and lives only in the component", () => {
    const stillRaw = pageSources
      .filter(({ source }) => source.includes(RAW_WRAPPER))
      .map(({ rel }) => rel);
    expect(stillRaw).toEqual([]);
    // The component is the single place that markup is allowed to exist.
    expect(component).toContain(RAW_WRAPPER);
  });

  it("all 72 strings survived the move into props", () => {
    let total = 0;
    for (const { rel, source } of pageSources) {
      const call = panelCall(source);
      expect(call, `${rel}: no <GuidePanel /> call found`).not.toBeNull();
      const body = call as string;

      // Each panel keeps its eyebrow, heading, paragraph and its bullets.
      expect(body, rel).toMatch(/eyebrow=\{"/);
      expect(body, rel).toMatch(/title=\{"/);
      expect(body, rel).toMatch(/body=\{"/);
      expect(body, rel).toMatch(/items=\{\[/);

      const items = body.slice(body.indexOf("items={["));
      const itemCount = (items.match(/"(?:[^"\\]|\\.)*"/g) ?? []).length;
      expect(itemCount, `${rel}: needs at least 2 bullets`).toBeGreaterThanOrEqual(2);

      const all = (body.match(/"(?:[^"\\]|\\.)*"/g) ?? []).length;
      expect(all, `${rel}: fewer than eyebrow+title+body+2 bullets`).toBeGreaterThanOrEqual(5);
      total += all;

      // The eyebrow is the panel's identity; it always names a guide.
      expect(body, `${rel}: eyebrow should name a guide`).toMatch(/eyebrow=\{"[^"]*guide"\}/i);
    }
    expect(total, "the conversion moved 72 strings; a different count means one was dropped or invented")
      .toBe(TOTAL_STRINGS);
  });

  it("every prop is still translated, so no panel text can silently freeze in English", () => {
    for (const prop of ["eyebrow", "title", "body"]) {
      expect(component, `${prop} must be passed through sourceText`).toContain(
        `{sourceText(${prop})}`,
      );
    }
    // Bullets are rendered from the array, so the item must be translated too.
    expect(component).toMatch(/items\.map\(\([\s\S]*?sourceText\(item\)/);
    expect(component).toContain('from "@/lib/i18n/source-catalog"');
  });
});
