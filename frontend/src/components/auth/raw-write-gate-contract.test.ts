import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mutating controls that are neither page-hero actions nor `ExpandingActions`
 * entries must still sit inside a <WriteOnly> gate.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The role pass was applied in three waves: hero creates (v17.12, locked by
 * `write-gate-contract.test.ts`), row actions and `EntitySection` (v17.13,
 * locked by `row-action-permission-contract.test.ts`), and then nothing. The
 * handover recorded the remainder honestly as "still ungated: raw write buttons
 * that are neither hero actions nor ExpandingActions entries - for example the
 * second Calculate button at payroll line ~1004, and bulk-action bars".
 *
 * That long tail was real. A Director - read-only on the server - was still
 * shown the payroll bulk Calculate and Approve bar, the payroll row
 * Edit/Calculate/Approve/Archive icon strip, the deadlines card Edit and
 * Archive, the financial-records row Restore, and the inventory row Restore and
 * Archive. Every one 403s on click. They were gated in v17.14 and this test
 * keeps them gated.
 *
 * The check is positional, not per-file: it finds every `onClick=` whose
 * handler mutates and asserts the offset falls inside a `<WriteOnly>` region.
 * A file-level "does this file mention WriteOnly" check would have passed on
 * all seven of these sites before the fix, because each of those pages already
 * gated its hero button.
 */

const APP_DIR = path.resolve(__dirname, "../../app/(protected)");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments, replacing them with equal-length blanks so byte offsets stay
 * aligned with the original file. A commented-out gate must not appear to cover
 * live code, and a commented-out button must not be reported as ungated.
 */
function blankComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      const end = nl === -1 ? source.length : nl;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i);
      const end = close === -1 ? source.length : close + 2;
      for (let j = i; j < end; j += 1) {
        out += source[j] === "\n" ? "\n" : " ";
      }
      i = end;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/** Handler text that means "this control writes to the server". */
const MUTATING = [
  "handleBulkCreate",
  "handleBulkCalculate",
  "handleBulkApprove",
  "handleCalculate(",
  "handleApprove(",
  "restorePayroll(",
  "archivePayroll(",
  "archiveMutation.mutate",
  "restoreMutation.mutate",
  "archive.mutate(",
  "restore.mutate(",
  "openEdit(",
];

/** [start, end) offsets of every `<WriteOnly>...</WriteOnly>` region. */
/**
 * Gates that count. `AdminOnly` (v17.27) is STRICTER than `WriteOnly` -
 * Administrator alone rather than Administrator or Assistant - so a mutating
 * control inside it is more restricted, never less. It is required on
 * configuration/templates, whose ViewSet is `IsAdministratorOrReadOnly`: gating
 * that page with WriteOnly showed Assistants buttons that always 403'd.
 *
 * Each gate is tracked with its own open-stack, so nesting one inside the other
 * cannot pair the wrong tags.
 */
const GATES = ["WriteOnly", "AdminOnly"] as const;

function writeOnlyRegions(source: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const opens: Record<string, number[]> = { WriteOnly: [], AdminOnly: [] };
  let i = 0;
  outer: while (i < source.length) {
    for (const gate of GATES) {
      const openTag = `<${gate}>`;
      const closeTag = `</${gate}>`;
      // Closing tag first: "</WriteOnly>" also starts with "<".
      if (source.startsWith(closeTag, i)) {
        const start = opens[gate].pop();
        if (start !== undefined) regions.push([start, i + closeTag.length]);
        i += closeTag.length;
        continue outer;
      }
      if (source.startsWith(openTag, i)) {
        opens[gate].push(i);
        i += openTag.length;
        continue outer;
      }
    }
    i += 1;
  }
  return regions;
}

/** Offsets of JSX `onClick=` attributes whose handler mutates. */
function mutatingClickOffsets(source: string): number[] {
  const offsets: number[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("onClick=", from);
    if (at === -1) return offsets;
    const window = source.slice(at, at + 220);
    if (MUTATING.some((token) => window.includes(token))) offsets.push(at);
    from = at + "onClick=".length;
  }
}

const FILES = walk(APP_DIR).map((file) => {
  const source = blankComments(fs.readFileSync(file, "utf8"));
  return {
    rel: path.relative(APP_DIR, file).split(path.sep).join("/"),
    source,
    regions: writeOnlyRegions(source),
    clicks: mutatingClickOffsets(source),
  };
});

const TOTAL_CLICKS = FILES.reduce((sum, f) => sum + f.clicks.length, 0);
const TOTAL_REGIONS = FILES.reduce((sum, f) => sum + f.regions.length, 0);

/** The seven sites fixed in v17.14, pinned so a silent revert is loud. */
const FIXED_IN_V17_14 = [
  "personnel/payroll/page.tsx",
  "deadlines/page.tsx",
  "financial-records/page.tsx",
  "inventory/page.tsx",
];

describe("raw write gate contract", () => {
  it("scanned a real page tree and found gates to check (vacuity guard)", () => {
    // If any of these collapse, the assertions below prove nothing.
    expect(FILES.length).toBeGreaterThan(20);
    expect(TOTAL_REGIONS).toBeGreaterThanOrEqual(15);
    expect(TOTAL_CLICKS).toBeGreaterThanOrEqual(10);
  });

  it("places every mutating onClick inside a WriteOnly region", () => {
    const ungated: string[] = [];
    for (const file of FILES) {
      for (const offset of file.clicks) {
        const covered = file.regions.some(
          ([start, end]) => offset > start && offset < end,
        );
        if (!covered) {
          const line = file.source.slice(0, offset).split("\n").length;
          ungated.push(`${file.rel}:${line}`);
        }
      }
    }
    expect(ungated).toEqual([]);
  });

  it("still finds mutating controls on each page fixed in v17.14 (vacuity guard)", () => {
    // Pins the handler list. If a page is refactored so none of its mutating
    // handlers match, the check above would silently stop covering it.
    const blind = FIXED_IN_V17_14.filter((rel) => {
      const file = FILES.find((entry) => entry.rel === rel);
      return !file || file.clicks.length === 0;
    });
    expect(blind).toEqual([]);
  });

  it("does not gate read-only affordances", () => {
    // Clearing a selection and viewing a record are read-safe; gating them
    // would hide navigation from Directors, who are allowed to read.
    const payroll = FILES.find(
      (entry) => entry.rel === "personnel/payroll/page.tsx",
    );
    expect(payroll).toBeDefined();
    const clearSelection = payroll!.source.indexOf("setSelectedIds([])");
    expect(clearSelection).toBeGreaterThan(-1);
    const gated = payroll!.regions.some(
      ([start, end]) => clearSelection > start && clearSelection < end,
    );
    expect(gated).toBe(false);
  });
});
