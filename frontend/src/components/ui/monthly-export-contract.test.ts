/*
 * Monthly export contract (v17.25).
 *
 * Two regressions this file exists to prevent, both of which were real:
 *
 *  1. Dead export handlers. Both the CNSS and payroll pages carried a
 *     `handleExport` that no JSX ever rendered, so neither screen could
 *     export anything at all. A handler with no call site is invisible in
 *     review and looks identical to a working feature.
 *
 *  2. Exporting "now" instead of the chosen month. The CNSS page built its
 *     request from `new Date()`, so on 1 September you could not produce the
 *     August declaration you were actually filing.
 *
 * It also pins the two printed-template names, because those strings are the
 * contract with the backend serializer: a typo silently produces the wide
 * default export with no error anywhere.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const read = (relative: string) => readFileSync(join(SRC, relative), "utf8");

const DIALOG = "components/ui/monthly-export-dialog.tsx";
const CNSS = "app/(protected)/personnel/cnss/page.tsx";
const PAYROLL = "app/(protected)/personnel/payroll/page.tsx";

const PAGES = [
  { file: CNSS, template: "declaration", reportType: "cnss_monthly" },
  { file: PAYROLL, template: "monthly_list", reportType: "payroll_monthly" },
] as const;

/** Strip comments so prose about a pattern never satisfies a check for it. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("monthly export contract", () => {
  it("scanned real source files (vacuity guard)", () => {
    for (const { file } of PAGES) {
      expect(stripComments(read(file)).length).toBeGreaterThan(5000);
    }
    expect(stripComments(read(DIALOG)).length).toBeGreaterThan(2000);
  });

  it("renders the month picker on both monthly screens", () => {
    for (const { file } of PAGES) {
      const code = stripComments(read(file));
      // Imported AND rendered. The import alone is what the old dead
      // handlers effectively amounted to.
      expect(code).toContain("monthly-export-dialog");
      expect(code).toContain("<MonthlyExportDialog");
    }
  });

  it("asks the backend for the printed template on each screen", () => {
    for (const { file, template, reportType } of PAGES) {
      const code = stripComments(read(file));
      expect(code).toContain(`template: "${template}"`);
      expect(code).toContain(`report_type: "${reportType}"`);
    }
  });

  it("exports the chosen period, never today's date", () => {
    // The dialog supplies year and month; a page that reads the clock inside
    // its export request has regressed to the v17.24 behaviour.
    const cnss = stripComments(read(CNSS));
    const start = cnss.indexOf("handleExportMonth");
    const exportCall = cnss.slice(start, start + 700);
    expect(start).toBeGreaterThan(-1);
    expect(exportCall).not.toContain("new Date()");
    expect(exportCall).not.toContain("getFullYear()");
    expect(exportCall).not.toContain("getMonth()");
  });

  it("leaves no dead export handler behind on either page", () => {
    for (const { file } of PAGES) {
      const code = stripComments(read(file));
      // Every handler defined must be referenced somewhere else in the file.
      const defined = [...code.matchAll(/const (handleExport\w*)\s*=/g)].map(
        (match) => match[1],
      );
      expect(defined.length).toBeGreaterThan(0);
      for (const name of defined) {
        const uses = code.split(name).length - 1;
        expect(uses, `${name} in ${file} is never rendered`).toBeGreaterThan(1);
      }
    }
  });

  it("offers both Excel and CSV, and lets the user pick any month", () => {
    const dialog = stripComments(read(DIALOG));
    expect(dialog).toContain('"xlsx"');
    expect(dialog).toContain('"csv"');
    // Twelve months, and a year list rather than a single hard-coded year.
    expect(dialog).toContain("January");
    expect(dialog).toContain("December");
    expect(dialog).toMatch(/years\s*=|const years/);
  });

  it("keeps the export available to every role that can read the screen", () => {
    // Export is a read. Wrapping the dialog in WriteOnly would hide it from
    // Directors, who are exactly the people asking for the monthly files.
    for (const { file } of PAGES) {
      const code = stripComments(read(file));
      const dialogAt = code.indexOf("<MonthlyExportDialog");
      const writeOnlyAt = code.indexOf("<WriteOnly>");
      expect(dialogAt).toBeGreaterThan(-1);
      if (writeOnlyAt > -1) {
        expect(dialogAt).toBeLessThan(writeOnlyAt);
      }
    }
  });
});
