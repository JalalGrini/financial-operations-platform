/**
 * Structural guard: every form <Select> bound to a react-hook-form value must
 * receive a defined string.
 *
 * WHY THIS EXISTS
 * ---------------
 * `Select` is `@radix-ui/react-select`'s `Root` re-exported directly. Radix
 * decides on first render whether it is controlled, based on whether `value` is
 * defined. These forms declare `defaultValues: {}`, so a `useWatch(...)` value
 * starts as `undefined` - the Select mounts *uncontrolled* and then ignores the
 * value that `reset()` supplies once the record loads.
 *
 * On a "new" page that is invisible: the user's own click sets Radix's internal
 * state, so the trigger updates. On an "edit" page the value only ever arrives
 * programmatically, so the trigger kept showing its placeholder - the employment
 * / employee / company fields looked empty even though the form held the right
 * id, and saving could therefore submit a value the user could not see.
 *
 * Writing `value={x ?? ""}` keeps the component controlled from the first
 * render. This test scans the personnel forms so the pattern cannot regress; it
 * is deliberately source-level rather than a rendered-DOM assertion, because
 * Radix Select's trigger label depends on portalled content that jsdom cannot
 * exercise reliably.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PERSONNEL_PAGES = path.resolve(__dirname, "../../app/(protected)/personnel");

function collectTsx(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectTsx(full));
    } else if (entry.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

/** Names bound through `const x = useWatch(...)` in a file. */
function watchedNames(source: string): Set<string> {
  const names = new Set<string>();
  const pattern = /const\s+(\w+)\s*=\s*useWatch\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  return names;
}

describe("personnel form selects stay controlled", () => {
  const files = collectTsx(PERSONNEL_PAGES);

  it("finds the personnel form pages", () => {
    // Guards against the walk silently covering nothing.
    expect(files.length).toBeGreaterThan(5);
  });

  it("never binds a Select value to a possibly-undefined watched field", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const watched = watchedNames(source);
      if (watched.size === 0) continue;

      source.split(/\r?\n/).forEach((line, index) => {
        // `value={foo}` with no fallback, where foo is a useWatch binding.
        const match = line.match(/^\s*value=\{(\w+)\}\s*$/);
        if (!match) return;
        if (!watched.has(match[1])) return;
        offenders.push(
          `${path.relative(PERSONNEL_PAGES, file)}:${index + 1} value={${match[1]}} ` +
            `- use value={${match[1]} ?? ""} so the Select is controlled on first render`,
        );
      });
    }

    expect(offenders).toEqual([]);
  });
});
