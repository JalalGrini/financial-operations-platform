import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every mutating row action must declare which permission it needs.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * v17.12 gated the 15 hero create buttons behind <WriteOnly>, but row-level
 * actions (Edit, Archive, Restore, Delete, Calculate, Approve...) live inside
 * ExpandingActions `actions` arrays and were still shown to every role. A
 * Director is read-only server-side, so each of those 403s on click.
 *
 * v17.13 moved the decision into ExpandingActions itself: an action tagged
 * `permission: "write"` is hidden unless canWrite, `"delete"` unless canDelete.
 * That only works if call sites actually tag their mutating actions, which is
 * what this test enforces. An untagged action is visible to everyone.
 *
 * It reads source text rather than rendering, because the failure mode is a
 * missing property on an object literal, and covering it by rendering would
 * need a fixture per page per role.
 */

const APP_DIR = path.resolve(__dirname, "../../app/(protected)");
const EXPANDING_ACTIONS = path.resolve(__dirname, "./expanding-actions.tsx");
const ENTITY_SECTION = path.resolve(
  __dirname,
  "../../features/configuration/components/EntitySection.tsx",
);

/** Labels that change server state. Anything here must carry a permission. */
const WRITE_LABELS = [
  "Edit",
  "Archive",
  "Restore",
  "Unarchive",
  "Stop",
  "Restart",
  "Calculate",
  "Approve",
  "Reject",
  "Duplicate",
];

/** Labels that destroy data. Administrator only. */
const DELETE_LABELS = ["Delete", "Delete permanently", "Purge", "Remove"];

const QUOTES = "'\"`";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
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

/** Index of the bracket closing the one at `open`, ignoring bracket-like
 *  characters inside string and template literals. */
function matchBracket(text: string, open: number): number {
  const opener = text[open];
  const closer = opener === "[" ? "]" : opener === "(" ? ")" : "}";
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (QUOTES.includes(c)) {
      quote = c;
      continue;
    }
    if (c === opener) depth += 1;
    else if (c === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The `actions={...}` expression of every <ExpandingActions> in a file.
 *  The value may be an array literal or a ternary yielding different arrays,
 *  so the whole JSX expression container is matched. */
function actionSpans(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (;;) {
    const tag = text.indexOf("<ExpandingActions", start);
    if (tag === -1) break;
    const key = text.indexOf("actions=", tag);
    if (key === -1) {
      start = tag + 1;
      continue;
    }
    const brace = text.indexOf("{", key);
    if (brace === -1 || brace > key + 10) {
      start = tag + 1;
      continue;
    }
    const end = matchBracket(text, brace);
    if (end === -1) {
      start = tag + 1;
      continue;
    }
    out.push([brace, end]);
    start = end;
  }
  return out;
}

/** The object literal enclosing `index`, found by walking back to its `{`. */
function enclosingObject(text: string, index: number): string {
  let depth = 0;
  for (let i = index; i >= 0; i -= 1) {
    const c = text[i];
    if (c === "}") depth += 1;
    else if (c === "{") {
      if (depth === 0) {
        const end = matchBracket(text, i);
        return end === -1 ? text.slice(i, index) : text.slice(i, end + 1);
      }
      depth -= 1;
    }
  }
  return "";
}

type Found = { file: string; label: string; object: string };

function collectActions(): Found[] {
  const found: Found[] = [];
  for (const file of walk(APP_DIR)) {
    const text = stripComments(fs.readFileSync(file, "utf8"));
    if (!text.includes("<ExpandingActions")) continue;
    for (const [lo, hi] of actionSpans(text)) {
      let i = lo;
      for (;;) {
        const at = text.indexOf("label:", i);
        if (at === -1 || at > hi) break;
        let k = at + "label:".length;
        while (k < hi && text[k] === " ") k += 1;
        if (text[k] === '"') {
          const close = text.indexOf('"', k + 1);
          if (close !== -1 && close < hi) {
            found.push({
              file: path.relative(APP_DIR, file),
              label: text.slice(k + 1, close),
              object: enclosingObject(text, at),
            });
          }
        }
        i = at + 1;
      }
    }
  }
  return found;
}

const ACTIONS = collectActions();

describe("row action permission contract", () => {
  it("finds the row action call sites it is meant to police", () => {
    // Vacuity guard: if the parser silently stops matching, every assertion
    // below passes trivially. This is the tripwire for that.
    const files = new Set(ACTIONS.map((a) => a.file));
    expect(files.size).toBeGreaterThanOrEqual(9);

    const mutating = ACTIONS.filter(
      (a) => WRITE_LABELS.includes(a.label) || DELETE_LABELS.includes(a.label),
    );
    expect(mutating.length).toBeGreaterThanOrEqual(30);
  });

  it("tags every mutating row action with a permission", () => {
    const untagged = ACTIONS.filter(
      (a) =>
        (WRITE_LABELS.includes(a.label) || DELETE_LABELS.includes(a.label)) &&
        !a.object.includes("permission:"),
    ).map((a) => `${a.file}: ${a.label}`);

    expect(untagged).toEqual([]);
  });

  it("gates destructive row actions on delete, never on write", () => {
    const wrong = ACTIONS.filter(
      (a) =>
        DELETE_LABELS.includes(a.label) &&
        !a.object.includes('permission: "delete"'),
    ).map((a) => `${a.file}: ${a.label}`);

    expect(wrong).toEqual([]);
  });

  it("keeps the permission rule itself in one place", () => {
    // If this filter is deleted, every tag above becomes decorative.
    const source = fs.readFileSync(EXPANDING_ACTIONS, "utf8");
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('permission?: "write" | "delete"');
    expect(source).toContain('action.permission === "write"');
    expect(source).toContain('action.permission === "delete"');
    expect(source).toContain("canWrite");
    expect(source).toContain("canDelete");
  });

  it("gates the shared configuration row actions behind WriteOnly", () => {
    // EntitySection renders raw Buttons rather than ExpandingActions, and is
    // reused by every configuration section, so it needs its own check.
    const source = fs.readFileSync(ENTITY_SECTION, "utf8");
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('from "@/components/auth/WriteOnly"');

    const stripped = stripComments(source);
    const gates = stripped.split("<WriteOnly>").length - 1;
    // Edit + Archive, Restore, and the create button.
    expect(gates).toBeGreaterThanOrEqual(3);
  });
});
