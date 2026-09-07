import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every create affordance on a page hero must be gated behind <WriteOnly>.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The backend has enforced the role matrix from the start; the frontend
 * implemented none of it. A Director is read-only server-side but was shown all
 * 15 hero create buttons, every one of which 403s on click. The gate was added
 * in v17.12. This test fails if a new page ships an ungated create button, or
 * if someone removes an existing gate.
 *
 * It reads source text rather than rendering, because the failure mode is
 * structural - a missing wrapper - and a render test would need 15 fixtures.
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

/** Strip comments so a commented-out example cannot satisfy or break a check. */
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

const FILES = walk(APP_DIR).map((file) => ({
  file,
  rel: path.relative(APP_DIR, file),
  source: stripComments(fs.readFileSync(file, "utf8")),
}));

const HERO_CREATE = FILES.filter((entry) =>
  entry.source.includes('variant="onHero"'),
);

/**
 * The only legitimate use of `isAdmin` as a gate is permanent destruction.
 * Returns the `isAdmin &&` sites that guard something else.
 *
 * Deliberately not a regex: heavy backslash nesting in generated content is a
 * known failure mode in this repo's tooling.
 */
function misusedAdminGates(source: string): number {
  const marker = "isAdmin && ";
  const allowed = ["Delete permanently", "purge", "Trash2", "destroy"];
  let count = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return count;
    const window = source.slice(at, at + 400);
    if (!allowed.some((token) => window.includes(token))) count += 1;
    from = at + marker.length;
  }
}

/**
 * Counts hero create buttons that are NOT inside a <WriteOnly> region.
 *
 * v17.20: this replaced a literal `includes("action={<WriteOnly>")` check.
 * That string was a proxy for the requirement, not the requirement itself, and
 * it broke as soon as a hero carried a second action - the export button, which
 * is a read and must stay visible to Directors. Asserting position relative to
 * the gate is stronger: it still fails if a create button escapes the gate, and
 * it no longer depends on the create button being written first.
 *
 * Deliberately index arithmetic rather than a regex: JSX nesting is not a
 * regular language, and heavy backslash nesting is a known tooling failure
 * mode in this repo.
 */
/**
 * Gates that satisfy "this write is not offered to someone who cannot perform
 * it".
 *
 * v17.27 added AdminOnly. It is a STRICTER gate than WriteOnly - Administrator
 * alone, versus Administrator or Assistant - so a write sitting inside it is
 * more restricted, never less. It became necessary because
 * FinancialDocumentTemplateViewSet is `IsAdministratorOrReadOnly`: WriteOnly
 * there showed an Assistant buttons that always 403'd, so the page was gated
 * correctly-looking and wrong.
 *
 * Order matters for the scan: the longest name is not a prefix of the other, so
 * plain indexOf on each is unambiguous.
 */
const WRITE_GATES = ["WriteOnly", "AdminOnly"] as const;

/** True when `at` sits inside an open region of any accepted gate. */
function insideAnyGate(source: string, at: number): boolean {
  const before = source.slice(0, at);
  return WRITE_GATES.some((gate) => {
    const open = before.lastIndexOf(`<${gate}>`);
    if (open === -1) return false;
    const close = before.lastIndexOf(`</${gate}>`);
    // Inside means: opened before this point and not yet closed.
    return close < open;
  });
}

function ungatedHeroCreates(source: string): number {
  const marker = 'variant="onHero"';
  let count = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return count;
    if (!insideAnyGate(source, at)) count += 1;
    from = at + marker.length;
  }
}

describe("write gate contract", () => {
  it("scanned a real page tree (vacuity guard)", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(HERO_CREATE.length).toBeGreaterThanOrEqual(15);
  });

  it("gates every hero create action behind WriteOnly", () => {
    const ungated = HERO_CREATE.filter(
      (entry) => ungatedHeroCreates(entry.source) > 0,
    ).map((entry) => entry.rel);
    expect(ungated).toEqual([]);
  });

  it("would notice a create button escaping the gate (vacuity guard)", () => {
    // Proves the check above can fail. Without this, a helper that always
    // returned 0 would make the gate assertion pass on any codebase.
    const escaped = `action={<div>
  <Button variant="onHero">New</Button>
</div>}`;
    expect(ungatedHeroCreates(escaped)).toBe(1);
    const gated = `action={<div>
  <WriteOnly><Button variant="onHero">New</Button></WriteOnly>
</div>}`;
    expect(ungatedHeroCreates(gated)).toBe(0);
    // The stricter gate must also count as gated, and an unrelated closed
    // region must not.
    const adminGated = `action={<div>
  <AdminOnly><Button variant="onHero">New</Button></AdminOnly>
</div>}`;
    expect(ungatedHeroCreates(adminGated)).toBe(0);
    const closedBefore = `<AdminOnly><span/></AdminOnly>
<Button variant="onHero">New</Button>`;
    expect(ungatedHeroCreates(closedBefore)).toBe(1);
  });

  it("imports whichever gate it uses", () => {
    const missingImport = FILES.filter(
      (entry) =>
        WRITE_GATES.some((gate) => entry.source.includes(`<${gate}>`)) &&
        !entry.source.includes('from "@/components/auth/WriteOnly"'),
    ).map((entry) => entry.rel);
    expect(missingImport).toEqual([]);
  });

  it("uses isAdmin only to gate permanent destruction", () => {
    // Assistants may write; Administrators alone may permanently delete.
    // Gating a create/edit/archive control on isAdmin is the plausible-looking
    // wrong fix - it locks out Assistants - so it is pinned here. Guarding
    // "Delete permanently" on isAdmin is correct and stays allowed.
    const offenders = FILES.filter(
      (entry) => misusedAdminGates(entry.source) > 0,
    ).map((entry) => entry.rel);
    expect(offenders).toEqual([]);
  });

  it("still finds the legitimate admin-only destroy gate (vacuity guard)", () => {
    // If this ever reaches zero, the test above has stopped proving anything
    // because there are no isAdmin gates left to classify.
    const adminGated = FILES.filter((entry) =>
      entry.source.includes("isAdmin && "),
    );
    expect(adminGated.length).toBeGreaterThan(0);
  });
});
