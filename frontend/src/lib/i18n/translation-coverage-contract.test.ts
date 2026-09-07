/**
 * Guard: no visible string may be missing from any catalogue.
 *
 * The complaint this exists for was "when I change language, not every detail
 * changes". The cause was not a broken switcher - the switcher works and
 * remounts the tree. The cause was that 47 French and 71 Arabic keys were
 * simply absent from the catalogues, and the runtime falls back to the English
 * source string when a key is missing. A silent fallback is the right runtime
 * behaviour (better than showing a raw key) but it means an untranslated
 * string looks exactly like a translated one to every automated check. Nothing
 * in tsc, eslint or any other test could see it.
 *
 * So the census is the test. It re-derives the set of keys from the source and
 * demands that all three catalogues cover it. Adding a `sourceText("...")` call
 * without translating it now fails here rather than shipping English into a
 * French screen.
 *
 * Both call styles are counted, because both resolve against the same
 * catalogue and a key missing from either one leaks:
 *   sourceText("Save")            - the function
 *   <SourceText source="Save" />  - the component
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const LOCALES = ["en", "fr", "ar"] as const;

const CALL = /sourceText\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
const TAG = /<SourceText\s+[^>]*?source="((?:[^"\\]|\\.)*)"/g;

/**
 * Interpret the literal the way the JS engine will. The source writes
 * "\u2014" as an escape but the runtime looks the key up as a real em dash, so
 * comparing the raw text would report a false miss. JSON.parse is the correct
 * decoder here: a TS string literal body is JSON string syntax.
 */
function decode(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".bak")) {
      out.push(full);
    }
  }
  return out;
}

/** Comments must not contribute keys or hide them. */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) =>
      p1 + m.slice(p1.length).replace(/./g, " "),
    );
}

/**
 * PageHero receives its eyebrow, title and description as bare literals at the
 * call site and passes them into sourceText() as variables. The literal
 * patterns above therefore cannot see them - which is precisely how 54 hero
 * strings sat untranslated across ~40 screens without any check noticing. The
 * runtime fallback showed English and looked intentional.
 *
 * These props are collected explicitly so that adding a screen with an
 * untranslated hero fails here.
 */
const HERO_BLOCK = /<PageHero\b([\s\S]*?)\/>/g;
const HERO_PROP = /\b(?:eyebrow|title|description)="((?:[^"\\]|\\.)*)"/g;

const files = sourceFiles(SRC);

const census = new Set<string>();
for (const file of files) {
  const source = blankComments(fs.readFileSync(file, "utf8"));
  for (const pattern of [CALL, TAG]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      census.add(decode(match[1]));
    }
  }
  HERO_BLOCK.lastIndex = 0;
  let hero: RegExpExecArray | null;
  while ((hero = HERO_BLOCK.exec(source)) !== null) {
    HERO_PROP.lastIndex = 0;
    let prop: RegExpExecArray | null;
    while ((prop = HERO_PROP.exec(hero[1])) !== null) {
      census.add(decode(prop[1]));
    }
  }
}

const catalogues = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(path.join(__dirname, `source.${locale}.json`), "utf8"),
    ) as Record<string, string>,
  ]),
) as Record<(typeof LOCALES)[number], Record<string, string>>;

describe("translation coverage", () => {
  it("is not vacuous: a real census over a real tree", () => {
    // If the walker or the regexes break, the census collapses to a handful
    // of keys and every assertion below passes for the wrong reason.
    expect(files.length).toBeGreaterThan(200);
    expect(census.size).toBeGreaterThan(1500);
    for (const locale of LOCALES) {
      expect(Object.keys(catalogues[locale]).length).toBeGreaterThan(1500);
    }
  });

  it.each(LOCALES)("%s covers every string in the census", (locale) => {
    const catalogue = catalogues[locale];
    const missing = [...census].filter((key) => !(key in catalogue)).sort();
    // The message carries the actual keys: the whole point is that the person
    // who added the string learns which one to translate.
    expect(
      missing,
      `${locale} is missing ${missing.length} key(s):\n  ${missing
        .slice(0, 30)
        .join("\n  ")}`,
    ).toEqual([]);
  });

  it("holds no keys containing an undecoded escape", () => {
    // A key written as a literal backslash-u can never be hit at runtime, so
    // it is dead weight that also hides a real miss. One of these was written
    // by a first attempt at the fill script and removed; this stops it
    // coming back.
    for (const locale of LOCALES) {
      const bad = Object.keys(catalogues[locale]).filter((key) =>
        /\\u[0-9a-fA-F]{4}|\\n/.test(key),
      );
      expect(bad, `${locale} has undecoded keys`).toEqual([]);
    }
  });

  it("actually translates rather than copying English through", () => {
    // A catalogue could satisfy the coverage test by mapping every key to
    // itself. English is allowed to do that - it is the source language - but
    // French and Arabic copying everything would mean nothing changes on
    // switch, which is the exact complaint. Some entries legitimately match
    // ("ICE", "RC", "CSV (.csv)"), so this is a proportion, not an absolute.
    for (const locale of ["fr", "ar"] as const) {
      const catalogue = catalogues[locale];
      const keys = [...census];
      const identical = keys.filter((key) => catalogue[key] === key);
      expect(
        identical.length / keys.length,
        `${locale}: ${identical.length}/${keys.length} entries are untranslated copies`,
      ).toBeLessThan(0.2);
    }
  });

  it("Arabic is written in Arabic script", () => {
    // Guards against a fill script that pasted French into the Arabic file,
    // which would pass every check above.
    const arabic = /[\u0600-\u06FF]/;
    const values = [...census]
      .map((key) => catalogues.ar[key])
      .filter((value): value is string => Boolean(value) && value.length > 3);
    const scripted = values.filter((value) => arabic.test(value));
    expect(values.length).toBeGreaterThan(1000);
    expect(scripted.length / values.length).toBeGreaterThan(0.85);
  });
});

/*
 * Added after this guard passed while six strings were still English-only in
 * fr and ar. The census test above asks "is every censused key present in
 * every catalogue?", and those six were present in en, which is where the
 * census found them - but nothing asserted that fr and ar cover what en
 * covers. Keys can also enter en directly (a fill script, a hand edit), and
 * those are invisible to a census-driven check. So this compares the
 * catalogues to each other instead of to the source.
 */
/**
 * Guard: the four screens converted in v17.27 must not regrow a raw
 * user-visible string.
 *
 * The census above is keyed on `sourceText(...)` / `<SourceText>` / PageHero
 * props, so it is structurally blind to a bare JSX text node or a literal
 * `placeholder=`. Those render English in every locale, and 107 of them were
 * sitting in these four files. Nothing in tsc, eslint or the census could see
 * them.
 *
 * Scoped to these four files rather than the whole tree on purpose: a
 * repo-wide version fails immediately on screens that have not been converted
 * yet, which would make the suite red for a known, listed backlog rather than
 * for a regression. Add a file here as it is converted.
 */
describe("converted screens keep every visible string in the catalogue", () => {
  /**
   * Now the WHOLE tree, not a four-file allowlist.
   *
   * It was scoped to four files while ~45 others still carried raw strings,
   * because a repo-wide assertion would have gone red on a known backlog rather
   * than on a regression. That backlog is closed: the conversion swept 98 strings
   * across 50 files and the census reports zero remaining, so the guard can now
   * police everything.
   *
   * Exclusions, both deliberate:
   * - `*.test.*` â€” several guards use raw strings as fixtures
   *   (`expect(isProse("Upcoming Deadlines"))`). Wrapping those would break the
   *   very checks that police this.
   * - `SourceText.tsx` â€” it defines the mechanism, so it would match its own
   *   documentation.
   */
  function walkTsx(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkTsx(full));
      } else if (
        entry.name.endsWith(".tsx") &&
        !entry.name.includes(".test.") &&
        entry.name !== "SourceText.tsx"
      ) {
        out.push(path.relative(SRC, full).split(path.sep).join("/"));
      }
    }
    return out;
  }

  const CONVERTED = walkTsx(SRC);

  /** Markers that mean the captured text is code, not prose. */
  const CODE = [
    "=>",
    "??",
    "?.",
    "useState",
    "useMemo",
    "{",
    "}",
    "length",
    "null",
    "undefined",
  ];

  /**
   * MUST stay identical to `looksHuman` in scripts/find-raw-strings.js and
   * scripts/wrap-raw-strings.js.
   *
   * The keyword list above was tuned against four hand-picked files. Widening
   * the scan to ~250 files immediately reported 151 "offenders", every one of
   * them a false positive: TypeScript generics and ternaries, because the
   * `>...<` text-node pattern also matches `) : driftQuery.isError ? (`.
   *
   * So the rule is character-based now: prose contains no brackets, braces,
   * backslashes or boolean operators. `CODE` is kept for the operator sequences
   * that are not single characters.
   */
  const CODE_CHARS = /[(){}[\]\\|=;`$]|&&|=>|\?\?|\?\./;
  const CODE_WORDS = new Set([
    "Promise", "Record", "React", "ReactNode", "ReactElement", "String",
    "Number", "Boolean", "Object", "Array", "Partial", "Omit", "Pick", "void",
    "any", "unknown", "never",
  ]);

  function isProse(text: string): boolean {
    const t = text.trim();
    if (t.length < 2) return false;
    if (!/[A-Za-z]{2}/.test(t)) return false;
    if (CODE_CHARS.test(t)) return false;
    if (CODE_WORDS.has(t)) return false;
    if (CODE.some((marker) => t.includes(marker))) return false;
    if (/^[,.:]/.test(t)) return false;
    // camelCase or dotted member access, e.g. `driftQuery.isError`.
    if (/[a-z][A-Z]/.test(t) && !/ /.test(t)) return false;
    if (/\w\.\w/.test(t)) return false;
    if (/^[a-z0-9_-]+$/.test(t) && !/ /.test(t)) return false;
    if (/^[A-Z][A-Z0-9_]*$/.test(t)) return false;
    if (t.startsWith("/") || t.startsWith("#") || t.startsWith("http")) {
      return false;
    }
    if (/^[\w-]+\/[\w-]+/.test(t)) return false;
    if (/^\d/.test(t) && t.length < 6) return false;
    // Tailwind class strings leak in through className text positions.
    if (/^(?:[a-z-]+:)?[a-z-]+-\d/.test(t) && !/ [a-z]{4}/.test(t)) return false;
    return true;
  }

  const VISIBLE_ATTRS = ["placeholder", "title", "aria-label", "label"];

  function rawStrings(relative: string): string[] {
    const source = blankComments(
      fs.readFileSync(path.join(SRC, relative), "utf8"),
    );
    const found: string[] = [];
    for (const m of source.matchAll(/>([^<>{}]+)</g)) {
      if (isProse(m[1])) found.push(m[1].trim().replace(/\s+/g, " "));
    }
    for (const attr of VISIBLE_ATTRS) {
      const re = new RegExp(`\\b${attr}="([^"]+)"`, "g");
      for (const m of source.matchAll(re)) {
        if (isProse(m[1])) found.push(m[1]);
      }
    }
    return found;
  }

  it("is not vacuous: every scanned file exists and has real content", () => {
    // The per-file 3000-character floor was right for four hand-picked screens
    // and wrong for a whole-tree walk - `(auth)/forgot-password/page.tsx` is 704
    // characters and perfectly legitimate. The vacuity property that actually
    // matters is total volume, not a minimum per file.
    let total = 0;
    for (const relative of CONVERTED) {
      const full = path.join(SRC, relative);
      expect(fs.existsSync(full), relative).toBe(true);
      const size = fs.readFileSync(full, "utf8").length;
      expect(size, relative).toBeGreaterThan(50);
      total += size;
    }
    expect(total).toBeGreaterThan(500_000);
  });

  it("would still detect a raw string (vacuity guard on the detector)", () => {
    // Proves the detector can fire. Without this a broken regex would make the
    // assertions below pass on any file.
    expect(isProse("Upcoming Deadlines")).toBe(true);
    expect(isProse("Due at")).toBe(true);
    expect(isProse("useState<Foo>(null); const x = useState<")).toBe(false);
  });

  it("scans a real tree (vacuity guard)", () => {
    // A broken walker would make the assertion below pass by iterating nothing.
    expect(CONVERTED.length).toBeGreaterThan(150);
  });

  it("no screen renders an untranslated visible string", () => {
    // One test rather than `it.each` over ~250 files: the useful output is the
    // full list of offenders in one message, not 250 mostly-identical passes
    // padding the suite count.
    const offenders: string[] = [];
    for (const relative of CONVERTED) {
      for (const raw of rawStrings(relative)) {
        offenders.push(`${relative}: ${JSON.stringify(raw)}`);
      }
    }
    expect(
      offenders,
      `${offenders.length} visible string(s) are outside the catalogue, so they stay English in French and Arabic:\n  ${offenders
        .slice(0, 30)
        .join("\n  ")}`,
    ).toEqual([]);
  });
});

describe("catalogue parity", () => {
  const CATALOGUE_DIR = path.resolve(__dirname);

  function catalogue(locale: string): Record<string, string> {
    return JSON.parse(
      fs.readFileSync(path.join(CATALOGUE_DIR, `source.${locale}.json`), "utf8"),
    ) as Record<string, string>;
  }

  const en = catalogue("en");

  it("is not vacuous", () => {
    expect(Object.keys(en).length).toBeGreaterThan(2000);
  });

  for (const locale of ["fr", "ar"] as const) {
    it(`${locale} covers every key present in en`, () => {
      const target = catalogue(locale);
      const missing = Object.keys(en).filter((key) => !(key in target));
      expect(
        missing,
        `${locale} is missing ${missing.length} keys that exist in en, so those screens render English:\n  ${missing
          .slice(0, 30)
          .join("\n  ")}`,
      ).toEqual([]);
    });
  }

  it("no catalogue contains a key that looks like captured source code", () => {
    // A fill script whose regex over-matched once wrote a slab of JSX into en
    // as if it were a translatable string. Real UI strings are single-line and
    // contain no markup.
    const suspicious = LOCALES.flatMap((locale) =>
      Object.keys(catalogue(locale))
        .filter(
          (key) =>
            key.includes("\n") ||
            key.includes("className") ||
            key.includes("/>") ||
            key.includes("</"),
        )
        .map((key) => `${locale}: ${key.slice(0, 60)}`),
    );
    expect(suspicious).toEqual([]);
  });
});
