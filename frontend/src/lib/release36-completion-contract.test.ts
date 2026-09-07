import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

const invalidates = (source: string, queryKey: string) =>
  new RegExp(
    `invalidateQueries\\s*\\(\\s*\\{\\s*queryKey\\s*:\\s*\\[\\s*["']${queryKey}["']`,
  ).test(source);

describe("release completion contracts", () => {
  it("exposes Administrator Users & Roles navigation and page", () => {
    expect(read("lib/navigation.ts")).toMatch(/href:\s*["']\/users["']/);
    expect(
      fs.existsSync(path.join(root, "app/(protected)/users/page.tsx")),
    ).toBe(true);
  });
  it("supports tag removal and immediate cache invalidation", () => {
    expect(read("features/collaboration/api.ts")).toContain("/untag/");
    const action = read("components/collaboration/TagAction.tsx");
    expect(invalidates(action, "mentions")).toBe(true);
    expect(invalidates(action, "notifications")).toBe(true);
  });
  it("keeps API calls same-origin", () => {
    expect(read("lib/api.ts")).toMatch(/\|\|\s*["']\/api\/v1["']/);
  });
});
