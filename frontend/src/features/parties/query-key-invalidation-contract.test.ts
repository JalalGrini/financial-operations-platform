/**
 * Guard for React Query cache-key shape across the app.
 *
 * THE BUG
 * -------
 * EntitySection invalidates by prefix: queryClient.invalidateQueries with
 * ["parties:associated-persons"]. React Query matches prefixes segment by
 * segment, so ["a", "b"] is matched by prefix ["a"], but the single joined
 * string ["a:b"] is a completely different head and is never matched.
 *
 * Two queries on the parties page had joined their segments with a colon:
 *   ["parties:associated-person-options"]
 *   ["parties:intercompany-balances:summary"]
 * so creating, editing or archiving a record refreshed the list while the
 * associated-person dropdown and the balances summary kept serving stale data
 * until a manual reload. This is the "numbers don't change instantly" report.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The bug is invisible on inspection - the strings look fine, and the only tell
 * is that a head contains a colon *after* the entity prefix. It is also easy to
 * reintroduce, since the surrounding code is full of legitimately
 * colon-namespaced heads like "parties:suppliers". This test was written once,
 * lost when the working tree was re-extracted, and the fix silently reverted
 * with it - which is exactly the argument for it being in the repo.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const PARTIES_PAGE = path.join(SRC, "app", "(protected)", "parties", "page.tsx");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (
      /\.tsx?$/.test(entry) &&
      !/\.test\.tsx?$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Comments must be stripped before asserting on source text. An earlier version
 * of this guard asserted that certain strings were absent, then failed on the
 * comments that explained the fix - which pressures the next person into
 * deleting the reasoning to get the suite green.
 */
function stripComments(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = sourceFiles(SRC).map((file) => ({
  file: path.relative(SRC, file),
  code: stripComments(readFileSync(file, "utf8")),
}));

/** Heads of array-form cache keys: queryKey: ["head", ...]. */
function cacheKeyHeads(code: string) {
  return [...code.matchAll(/queryKey:\s*\[\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Prefixes EntitySection-style components invalidate: queryKey="prefix". */
function invalidationPrefixes(code: string) {
  return [...code.matchAll(/queryKey="([^"]+)"/g)].map((m) => m[1]);
}

describe("query key invalidation contract", () => {
  it("sweeps a non-empty set of source files", () => {
    // Vacuity check: an empty sweep passes every assertion below.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("finds the invalidation prefixes it is meant to protect", () => {
    // Vacuity check: if the queryKey="..." convention is ever renamed, the
    // sweep below would silently protect nothing.
    const all = FILES.flatMap(({ code }) => invalidationPrefixes(code));
    expect(all).toContain("parties:associated-persons");
    expect(all).toContain("parties:intercompany-balances");
  });

  it("keeps the two previously broken parties keys segment-addressable", () => {
    const code = stripComments(readFileSync(PARTIES_PAGE, "utf8"));
    const heads = cacheKeyHeads(code);

    // The fixed form: prefix is its own segment.
    expect(code).toMatch(
      /queryKey:\s*\[\s*"parties:associated-persons",\s*"options"\s*\]/,
    );
    expect(code).toMatch(
      /queryKey:\s*\[\s*"parties:intercompany-balances",\s*"section-summary"\s*\]/,
    );

    // The broken form: extra colon-joined segment glued onto the prefix.
    expect(heads).not.toContain("parties:associated-person-options");
    expect(heads).not.toContain("parties:intercompany-balances:summary");
  });

  it("has no cache key gluing an extra segment onto an invalidated prefix", () => {
    const prefixes = new Set(
      FILES.flatMap(({ code }) => invalidationPrefixes(code)),
    );

    const offenders: string[] = [];
    for (const { file, code } of FILES) {
      for (const head of cacheKeyHeads(code)) {
        if (prefixes.has(head)) continue; // exactly a prefix - fine
        for (const prefix of prefixes) {
          // head is prefix + ":something" -> prefix invalidation can't reach it
          if (head.startsWith(`${prefix}:`)) {
            offenders.push(`${file}: ["${head}"] unreachable by ["${prefix}"]`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
