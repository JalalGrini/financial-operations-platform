/**
 * Guard: a screen whose API is Administrator-only must gate with AdminOnly, not
 * WriteOnly.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * `FinancialDocumentTemplateViewSet` declares
 * `permission_classes = [IsAuthenticated, IsAdministratorOrReadOnly]`, so only
 * an Administrator may write a document template. The page gated its controls
 * with `<WriteOnly>`, which resolves to Administrator *or* Assistant. Every
 * Assistant was therefore shown New / Edit / Publish / Archive / Restore and
 * received a 403 the moment they saved.
 *
 * Why nothing caught it: `tsc` sees two valid components, `eslint` sees nothing,
 * and the existing write-gate guard only asked "is this write gated at all?" -
 * to which the answer was yes. The gate was present and wrong, which is the
 * hardest kind of authorization defect to see, because the screen looks
 * deliberately built.
 *
 * So this test reads the **backend** permission class and derives which gate the
 * frontend must use. It fails if either side moves without the other, in either
 * direction:
 *
 *   - loosening the page to WriteOnly while the API stays admin-only
 *   - widening the API to WRITE_ROLES while the page stays AdminOnly (which
 *     would then be needlessly hiding a permission an Assistant now has)
 *
 * The second direction matters because widening the API is a live open question
 * for this exact ViewSet. If the owner decides Assistants should manage
 * templates, this test is what tells whoever does it that the UI must change
 * too.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = path.resolve(__dirname, "..", "..", "..");
const BACKEND = path.resolve(FRONTEND, "..", "backend");

/** Screens whose write controls are governance, not day-to-day work. */
const ADMIN_ONLY_SURFACES = [
  {
    name: "financial document templates",
    /** The backend module and the ViewSet whose permissions decide the gate. */
    backendModule: "apps/financial_records/views.py",
    viewSet: "FinancialDocumentTemplateViewSet",
    /** The permission class that means "Administrator writes, others read". */
    adminOnlyPermission: "IsAdministratorOrReadOnly",
    page: "src/app/(protected)/configuration/templates/page.tsx",
    /** Controls that must not be offered to a non-Administrator. */
    mutatingLabels: [
      "Publish",
      "Archive",
      "Restore",
      "New version",
    ],
  },
] as const;

function read(base: string, relative: string): string {
  return fs.readFileSync(path.join(base, relative), "utf8");
}

/**
 * Drop docstrings and comments so prose can never satisfy an assertion.
 *
 * Only whole-line `#` comments are removed. A blanket `#[^\n]*` would also eat
 * `#` characters inside string literals, and this module contains URL patterns.
 */
function stripPy(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, "")
    .replace(/^[ \t]*#.*$/gm, "");
}

function stripTs(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) =>
      p1 + m.slice(p1.length).replace(/./g, " "),
    );
}

/**
 * Extract the `permission_classes = [...]` that belongs to one ViewSet, by
 * scanning from its `class` statement to the next top-level `class`.
 *
 * Not "the first permission_classes after the name": these modules hold several
 * ViewSets, and grabbing the wrong one is precisely the mistake recorded in the
 * v17.26 notes about a contract test that latched onto the wrong bracket and
 * passed while checking almost nothing.
 */
function permissionClassesFor(source: string, viewSet: string): string {
  const start = source.indexOf(`class ${viewSet}`);
  if (start === -1) return "";
  const rest = source.slice(start + 1);
  const nextClass = rest.search(/\nclass\s+\w/);
  const body = nextClass === -1 ? rest : rest.slice(0, nextClass);
  const at = body.indexOf("permission_classes");
  if (at === -1) return "";
  const open = body.indexOf("[", at);
  const close = body.indexOf("]", open);
  if (open === -1 || close === -1) return "";
  return body.slice(open + 1, close);
}

describe("admin-only surfaces gate with AdminOnly", () => {
  it("is not vacuous: the backend tree is where this test expects", () => {
    // If the relative path is wrong every read below throws rather than
    // silently passing, but this states the dependency explicitly.
    expect(fs.existsSync(path.join(BACKEND, "apps"))).toBe(true);
    expect(ADMIN_ONLY_SURFACES.length).toBeGreaterThan(0);
  });

  it.each(ADMIN_ONLY_SURFACES)(
    "$name: the API is still Administrator-only",
    (surface) => {
      const backend = stripPy(read(BACKEND, surface.backendModule));
      const declared = permissionClassesFor(backend, surface.viewSet);
      // Vacuity: an empty extraction would make the next assertion trivially
      // true for the wrong reason.
      expect(
        declared.trim().length,
        `could not find permission_classes for ${surface.viewSet}`,
      ).toBeGreaterThan(0);
      expect(
        declared,
        `${surface.viewSet} no longer uses ${surface.adminOnlyPermission}. ` +
          `If the API was widened on purpose, ${surface.page} should move from ` +
          `<AdminOnly> to <WriteOnly> in the same change.`,
      ).toContain(surface.adminOnlyPermission);
    },
  );

  it.each(ADMIN_ONLY_SURFACES)(
    "$name: the page gates with AdminOnly and not WriteOnly",
    (surface) => {
      const page = stripTs(read(FRONTEND, surface.page));
      expect(page, `${surface.page} must import AdminOnly`).toContain(
        "AdminOnly",
      );
      expect(
        page.includes("<WriteOnly>"),
        `${surface.page} still uses <WriteOnly>, which admits Assistants. ` +
          `Its API is ${surface.adminOnlyPermission}, so an Assistant gets 403 ` +
          `on save.`,
      ).toBe(false);
    },
  );

  it.each(ADMIN_ONLY_SURFACES)(
    "$name: every mutating control sits inside an AdminOnly region",
    (surface) => {
      const page = stripTs(read(FRONTEND, surface.page));
      const ungated: string[] = [];
      for (const label of surface.mutatingLabels) {
        const at = page.indexOf(`source="${label}"`);
        // Vacuity per label: a renamed control must fail loudly, not vanish
        // from the check.
        expect(at, `${surface.page} no longer renders "${label}"`).toBeGreaterThan(
          -1,
        );
        const before = page.slice(0, at);
        const open = before.lastIndexOf("<AdminOnly>");
        const close = before.lastIndexOf("</AdminOnly>");
        if (open === -1 || close > open) ungated.push(label);
      }
      expect(
        ungated,
        `these mutating controls are outside <AdminOnly> on ${surface.page}: ` +
          ungated.join(", "),
      ).toEqual([]);
    },
  );
});
