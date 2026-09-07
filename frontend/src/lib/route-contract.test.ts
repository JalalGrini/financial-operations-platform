import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const appRoot = path.resolve(__dirname, "../app");
function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
}
const source = walk(path.resolve(__dirname, ".."))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
describe("internal route contract", () => {
  it("has every user-menu and public information page", () => {
    for (const rel of [
      "(auth)/forgot-password/page.tsx",
      "(auth)/register/page.tsx",
      "support/page.tsx",
      "docs/page.tsx",
      "api/page.tsx",
      "privacy/page.tsx",
      "security/page.tsx",
      "status/page.tsx",
      "terms/page.tsx",
      "(protected)/profile/page.tsx",
      "(protected)/settings/page.tsx",
    ])
      expect(fs.existsSync(path.join(appRoot, rel))).toBe(true);
  });
  it("contains no navigation to unsupported delete pages", () =>
    expect(source).not.toMatch(
      /href=\{`\/personnel\/(?:salaries|payroll|cnss)\/\$\{[^}]+}\/delete`}/,
    ));
});
