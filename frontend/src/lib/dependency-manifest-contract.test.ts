import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every third-party package that `src` imports must be declared in
 * package.json, and must appear in package-lock.json.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Until v17.14 the tree only built because `node_modules` had been hand-copied
 * from the v17.7 package. Four packages that `src` imports were declared
 * nowhere - `framer-motion` (18 files), `@radix-ui/react-dialog`,
 * `@radix-ui/react-slot`, and `@radix-ui/react-tooltip` - so *any*
 * plain `npm install`, not just `npm ci`, pruned them and returned the repo to
 * a broken state. The green state could not be reproduced from the repository
 * itself, which made the working tree the only copy of the truth.
 *
 * This test reads source text rather than resolving modules, because the
 * failure being guarded is a declaration gap, and a resolver would happily
 * find the undeclared package sitting in the copied `node_modules`.
 */

const FRONTEND = path.resolve(__dirname, "../..");
const SRC = path.join(FRONTEND, "src");

const pkg = JSON.parse(
  fs.readFileSync(path.join(FRONTEND, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lock = JSON.parse(
  fs.readFileSync(path.join(FRONTEND, "package-lock.json"), "utf8"),
) as { packages: Record<string, { version?: string }> };

const DECLARED = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/**
 * Packages that need no declaration: provided by the framework, the test
 * runner, or the Node runtime itself. Node builtins are listed explicitly
 * rather than imported from `node:module`, because some are imported bare
 * (`from "fs"`) in this repo's test files and would otherwise look undeclared.
 */
const IMPLICIT = new Set([
  "react",
  "react-dom",
  "next",
  "vitest",
  "fs",
  "path",
  "os",
  "url",
  "util",
  "crypto",
  "child_process",
  "process",
  "buffer",
  "stream",
  "assert",
]);

/**
 * This file legitimately contains the marker strings the scanner searches for,
 * so scanning itself would yield garbage "package names" cut out of its own
 * source. Excluding the file that defines the pattern is the same rule section
 * 7.2 of the handover records for structural guards.
 */
const SELF = "src/lib/dependency-manifest-contract.test.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments before scanning, so a commented-out import cannot force a
 * dependency to be declared and a commented-out example cannot mask a real one.
 */
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

/** "@scope/name/sub/path" -> "@scope/name" ; "name/sub" -> "name" */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isBareSpecifier(specifier: string): boolean {
  if (!specifier) return false;
  if (specifier.startsWith(".")) return false; // relative
  if (specifier.startsWith("@/")) return false; // tsconfig path alias into src
  if (specifier.startsWith("/")) return false;
  if (specifier.startsWith("node:")) return false;
  // Reject anything that is not a legal package specifier. Other guard tests in
  // this repo embed regex literals containing `from "`-like text, and a naive
  // scanner cuts fragments such as `@\/components\` out of them and reports
  // them as undeclared packages. npm names are lowercase and never contain a
  // backslash, space, or bracket.
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(specifier)) {
    return false;
  }
  return true;
}

/**
 * Collect quoted module specifiers from `from "x"`, `require("x")` and
 * `import("x")`. Deliberately string-scanning rather than regex: heavy
 * backslash nesting in generated content is a known failure mode in this
 * repo's tooling.
 */
function specifiersIn(source: string): string[] {
  const found: string[] = [];
  const markers = ['from "', 'require("', 'import("'];
  for (const marker of markers) {
    let from = 0;
    for (;;) {
      const at = source.indexOf(marker, from);
      if (at === -1) break;
      const start = at + marker.length;
      const end = source.indexOf('"', start);
      if (end === -1) break;
      found.push(source.slice(start, end));
      from = end + 1;
    }
  }
  return found;
}

const FILES = walk(SRC)
  .map((file) => ({
    rel: path.relative(FRONTEND, file).split(path.sep).join("/"),
    source: stripComments(fs.readFileSync(file, "utf8")),
  }))
  .filter((entry) => entry.rel !== SELF);

const USED = new Map<string, string[]>();
for (const { rel, source } of FILES) {
  for (const specifier of specifiersIn(source)) {
    if (!isBareSpecifier(specifier)) continue;
    const name = packageNameOf(specifier);
    if (IMPLICIT.has(name)) continue;
    const files = USED.get(name) ?? [];
    if (!files.includes(rel)) files.push(rel);
    USED.set(name, files);
  }
}

/**
 * The five that were missing. Pinned by name because losing any one of them is
 * the specific regression this file exists to prevent, and a scanner that
 * silently stopped matching would otherwise let it back in.
 */
const PREVIOUSLY_UNDECLARED = [
  "framer-motion",
  "@radix-ui/react-dialog",
  "@radix-ui/react-slot",
  "@radix-ui/react-tooltip",
];

describe("dependency manifest contract", () => {
  it("scanned a real source tree (vacuity guard)", () => {
    // If either number collapses, every assertion below passes for free.
    expect(FILES.length).toBeGreaterThan(200);
    expect(USED.size).toBeGreaterThan(10);
    expect(DECLARED.size).toBeGreaterThan(20);
  });

  it("declares every imported package in package.json", () => {
    const undeclared = [...USED.entries()]
      .filter(([name]) => !DECLARED.has(name))
      .map(([name, files]) => `${name} (imported by ${files.length}: ${files[0]})`);
    expect(undeclared).toEqual([]);
  });

  it("keeps the once-undeclared packages declared", () => {
    const missing = PREVIOUSLY_UNDECLARED.filter((name) => !DECLARED.has(name));
    expect(missing).toEqual([]);
  });

  it("still sees each of those packages imported by src (vacuity guard)", () => {
    const notSeen = PREVIOUSLY_UNDECLARED.filter((name) => !USED.has(name));
    expect(notSeen).toEqual([]);
  });

  it("lists every declared runtime dependency in package-lock.json", () => {
    const rootDeps = (lock.packages[""] as { dependencies?: Record<string, string> })
      .dependencies ?? {};
    const missingFromLockRoot = Object.keys(pkg.dependencies ?? {}).filter(
      (name) => !(name in rootDeps),
    );
    const missingEntry = Object.keys(pkg.dependencies ?? {}).filter(
      (name) => !lock.packages[`node_modules/${name}`],
    );
    expect({ missingFromLockRoot, missingEntry }).toEqual({
      missingFromLockRoot: [],
      missingEntry: [],
    });
  });
});
