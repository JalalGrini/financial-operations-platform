import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/*
 * Guards against interactive elements that look clickable but do nothing.
 *
 * The Related Records tab strip on the payroll detail page shipped as two
 * buttons with a hardcoded aria-selected of false and an empty arrow-function
 * click handler, while both panels rendered at once. Nothing failed: the
 * markup was valid, the types were fine, and the page looked correct in a
 * screenshot. Only clicking it revealed the tabs were decoration.
 *
 * IMPORTANT: every check below runs against comment-stripped source. The
 * comment you are reading contains the exact patterns being banned, and an
 * earlier version of a sibling guard failed because its own documentation
 * matched its own negative assertion.
 */

const SRC = path.resolve(__dirname, "../..");

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles();

/** An arrow function body that is empty or evaluates to nothing. */
const EMPTY_HANDLER =
  /on(?:Click|Change|Submit|MouseDown|PointerDown)=\{\s*\(\s*\)\s*=>\s*(?:\{\s*\}|undefined|null|void 0)\s*\}/;

/** aria-selected / aria-checked pinned to a literal, so it can never reflect state. */
const PINNED_ARIA = /aria-(?:selected|checked|expanded)=\{(?:false|true)\}/;

describe("interactive element contract", () => {
  it("scans a meaningful number of component files", () => {
    // Vacuity guard: if the walk breaks, every assertion below passes for free.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("has no interactive element wired to an empty handler", () => {
    const offenders = FILES.filter((f) =>
      EMPTY_HANDLER.test(stripComments(readFileSync(f, "utf8"))),
    ).map((f) => path.relative(SRC, f));

    expect(offenders).toEqual([]);
  });

  it("has no aria state pinned to a literal instead of reflecting state", () => {
    const offenders = FILES.filter((f) =>
      PINNED_ARIA.test(stripComments(readFileSync(f, "utf8"))),
    ).map((f) => path.relative(SRC, f));

    expect(offenders).toEqual([]);
  });

  it("drives the payroll Related Records tabs from state", () => {
    const page = path.join(
      SRC,
      "app",
      "(protected)",
      "personnel",
      "payroll",
      "[id]",
      "page.tsx",
    );
    const code = stripComments(readFileSync(page, "utf8"));

    // The tab strip exists and is the thing under test.
    expect(code).toMatch(/role="tablist"/);

    // Selection and the click handler both read/write the same state.
    expect(code).toMatch(/aria-selected=\{relatedTab === tab\}/);
    expect(code).toMatch(/onClick=\{\(\) => setRelatedTab\(tab\)\}/);

    // Both panels are gated, so exactly one renders at a time.
    expect(code).toMatch(/relatedTab === "adjustments" &&/);
    expect(code).toMatch(/relatedTab === "payments" &&/);
  });
});
