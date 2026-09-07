import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the v17.20 list-export UI.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * v17.19 wired ExportableListMixin into six list endpoints. Wiring it exposed
 * two bugs that this test is built around:
 *
 *   1. `format` is reserved by DRF content negotiation (URL_FORMAT_OVERRIDE),
 *      so `?format=csv` answers 404 before the view body runs. The frontend
 *      must send `output_format`. A backend test pins the 404; this pins the
 *      frontend side, because sending the wrong key produces a 404 that looks
 *      like a missing route rather than a bad parameter.
 *
 *   2. Export must NOT be gated behind <WriteOnly>. Exporting is a read, and
 *      Directors are read-only but fully entitled to read. Wrapping the button
 *      in the write gate would hide it from exactly the role most likely to
 *      want a spreadsheet.
 *
 * It reads source text rather than rendering, because the failure modes are
 * structural (a wrong query key, a button inside the wrong wrapper, a page
 * that quietly loses its button) and because these route files are never
 * imported by anything, so tsc cannot see a regression here.
 */

const SRC = path.resolve(__dirname, "../..");
const APP = path.join(SRC, "app/(protected)");
const API = path.join(SRC, "features/exports/api.ts");
const BUTTON = path.join(SRC, "components/ui/export-button.tsx");

/** Strip comments so prose in a header cannot satisfy or break a check. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function read(file: string): string {
  return stripComments(fs.readFileSync(file, "utf8"));
}

const apiSource = read(API);
const buttonSource = read(BUTTON);

/**
 * The six endpoints carrying the mixin, with the paths verified against the
 * backend routers. `companies` is registered with an empty prefix, which is
 * why it is not `/companies/companies`.
 */
const EXPECTED_ENDPOINTS: Array<[string, string]> = [
  ["deadlines", "/deadlines/deadlines"],
  ["financialRecords", "/financial-records/records"],
  ["clients", "/parties/clients"],
  ["suppliers", "/parties/suppliers"],
  ["cashTransfers", "/transfers/cash-transfers"],
  ["companies", "/companies"],
];

/** The list screens that carry an export button. */
const WIRED_PAGES = [
  "deadlines/page.tsx",
  "financial-records/page.tsx",
  "companies/page.tsx",
  "transfers/page.tsx",
];

const PAGES = WIRED_PAGES.map((rel) => ({
  rel,
  source: read(path.join(APP, rel)),
}));

/**
 * Counts <ExportButton occurrences that sit inside an open <WriteOnly> region.
 * Index arithmetic rather than a regex: JSX nesting is not regular, and heavy
 * backslash nesting is a known tooling failure mode in this repo.
 */
function gatedExportButtons(source: string): number {
  const marker = "<ExportButton";
  let count = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return count;
    const before = source.slice(0, at);
    const open = before.lastIndexOf("<WriteOnly>");
    const close = before.lastIndexOf("</WriteOnly>");
    if (open !== -1 && open > close) count += 1;
    from = at + marker.length;
  }
}

describe("list export wiring contract", () => {
  it("read real, non-trivial sources (vacuity guard)", () => {
    // Without this, an empty or missing file would make every check below pass.
    expect(apiSource.length).toBeGreaterThan(500);
    expect(buttonSource.length).toBeGreaterThan(500);
    expect(PAGES).toHaveLength(4);
    for (const page of PAGES) {
      expect(page.source.length, page.rel).toBeGreaterThan(1000);
    }
  });

  it("declares every endpoint that carries the export mixin", () => {
    for (const [key, url] of EXPECTED_ENDPOINTS) {
      expect(apiSource, key).toContain(`${key}: "${url}"`);
    }
  });

  it("sends output_format, never the reserved format parameter", () => {
    expect(apiSource).toContain('"output_format"');
    // `format` alone is swallowed by DRF content negotiation and answers 404.
    expect(apiSource).not.toContain('append("format"');
    expect(apiSource).not.toContain('set("format"');
    expect(apiSource).not.toContain("format=");
  });

  it("asks the server for a file, not for JSON", () => {
    expect(apiSource).toContain('responseType: "blob"');
    expect(apiSource).toContain("/export/?");
    expect(apiSource).toContain("/export-options/");
  });

  it("downloads and then releases the object URL", () => {
    // A createObjectURL without a matching revoke leaks the whole file in the
    // tab for as long as the page lives.
    expect(buttonSource).toContain("createObjectURL");
    expect(buttonSource).toContain("revokeObjectURL");
    // Failures must surface; a silent catch would look like a dead button.
    expect(buttonSource).toContain("toast.error");
  });

  it("puts an export button on every wired list screen", () => {
    for (const page of PAGES) {
      expect(page.source, page.rel).toContain("<ExportButton");
      expect(page.source, page.rel).toContain(
        'from "@/components/ui/export-button"',
      );
      expect(page.source, page.rel).toContain(
        'from "@/features/exports/api"',
      );
      expect(page.source, page.rel).toContain("listExportApi(");
    }
  });

  it("never hides an export behind the write gate", () => {
    // Export is a read. Directors are read-only and must still be able to
    // export, so the button must live outside <WriteOnly>.
    const gated = PAGES.filter(
      (page) => gatedExportButtons(page.source) > 0,
    ).map((page) => page.rel);
    expect(gated).toEqual([]);
  });

  it("would notice a button moving inside the write gate (vacuity guard)", () => {
    // Proves the check above can fail; otherwise a helper that always returned
    // 0 would pass on any codebase.
    const bad = "<WriteOnly>\n  <ExportButton />\n</WriteOnly>";
    expect(gatedExportButtons(bad)).toBe(1);
    const good = "<WriteOnly>\n  <Button />\n</WriteOnly>\n<ExportButton />";
    expect(gatedExportButtons(good)).toBe(0);
  });

  /*
   * v17.22. Clients and suppliers were the two endpoints from v17.19 that
   * still had no button after v17.20, and they were skipped because neither
   * has a page of its own: both render through the shared EntitySection. The
   * button therefore lives in that shared section, gated on an optional
   * exportKey, so the check above (which walks page files) cannot see it.
   * These two tests cover that path instead.
   */
  const SECTION = path.join(
    SRC,
    "features/configuration/components/EntitySection.tsx",
  );
  const CLIENTS = path.join(
    SRC,
    "features/parties/components/ClientsSection.tsx",
  );
  const PARTIES_PAGE = path.join(SRC, "app/(protected)/parties/page.tsx");

  it("offers an export button from the shared entity section", () => {
    const section = read(SECTION);
    expect(section.length).toBeGreaterThan(1000);
    expect(section).toContain("<ExportButton");
    expect(section).toContain("listExportApi(exportKey)");
    // Optional: sections that pass no key must render no button at all.
    expect(section).toContain("{exportKey && (");
    // Export is a read here too, so it must not sit inside the write gate.
    expect(gatedExportButtons(section)).toBe(0);
  });

  it("wires clients and suppliers to real export endpoints", () => {
    const wired: Array<[string, string]> = [
      [read(CLIENTS), "clients"],
      [read(PARTIES_PAGE), "suppliers"],
    ];
    for (const [source, key] of wired) {
      expect(source.length, key).toBeGreaterThan(1000);
      expect(source, key).toContain(`exportKey="${key}"`);
      // The key must be one the API client actually knows, otherwise the
      // button compiles and 404s at runtime.
      expect(apiSource, key).toContain(`${key}: "/parties/${key}"`);
    }
  });
});
