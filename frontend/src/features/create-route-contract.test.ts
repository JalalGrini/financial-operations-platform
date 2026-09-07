import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards the "inline panel -> dedicated route" conversions.
 *
 * Each conversion moved a create/edit form out of the bottom of a long list
 * page and onto its own route. The failure modes this catches:
 *   - the route or the form component disappearing while the list page keeps
 *     linking to it (a broken link that tsc cannot see, because route files are
 *     never imported by anything - this has already happened once, when the
 *     sandbox reverted freshly written files);
 *   - the panel machinery creeping back into the list page;
 *   - the create/edit link escaping its <WriteOnly> wrapper, which would expose
 *     a write entry point to Directors. The raw-write gate test cannot see
 *     these, because a <Link> has no onClick to inspect;
 *   - validation and payload logic being dropped during the move.
 */

const SRC = path.resolve(__dirname, "..");
const APP = path.join(SRC, "app/(protected)");

type Conversion = {
  name: string;
  list: string;
  route: string;
  form: string;
  href: string;
  component: string;
  mustKeep: string[];
  /**
   * Banned tokens this page is allowed to keep, with the reason. Only for
   * pages that still host a NON-create/edit panel: `useRevealOnOpen` is the
   * right tool for an action or confirm panel, so a page can convert its form
   * and legitimately keep the hook. Anything exempted here must be pinned down
   * by `alsoPresent`/`alsoAbsent` so the exemption cannot hide a regression.
   */
  allowLeftover?: string[];
  alsoPresent?: string[];
  alsoAbsent?: string[];
};

const CONVERSIONS: Conversion[] = [
  {
    name: "financial records create",
    list: path.join(APP, "financial-records/page.tsx"),
    route: path.join(APP, "financial-records/new/page.tsx"),
    form: path.join(SRC, "features/financial-records/RecordCreateForm.tsx"),
    href: "/financial-records/new",
    component: "RecordCreateForm",
    mustKeep: [
      "Company is required.",
      "Record type is required.",
      "Record date is required.",
      "Description is required.",
      "The selected type template could not be loaded.",
      "is required by this document type.",
      "custom_fields:",
      "record_date:",
      "record_type:",
      "multi_choice",
      "buildQuickClientPayload",
      "validateQuickClient",
    ],
  },
  {
    name: "deadlines create",
    list: path.join(APP, "deadlines/page.tsx"),
    route: path.join(APP, "deadlines/new/page.tsx"),
    form: path.join(SRC, "features/deadlines/DeadlineForm.tsx"),
    href: "/deadlines/new",
    component: "DeadlineCreateForm",
    mustKeep: [
      "Deadline saved",
      "Unable to save deadline",
      "period_type",
      "recurrence_days",
      "one_time",
      "Save deadline",
      "parseInt",
    ],
  },
  {
    name: "deadlines edit",
    list: path.join(APP, "deadlines/page.tsx"),
    route: path.join(APP, "deadlines/[id]/edit/page.tsx"),
    form: path.join(SRC, "features/deadlines/DeadlineForm.tsx"),
    // Built from the row id, so the list page holds a template literal.
    href: "/deadlines/${row.id}/edit",
    component: "DeadlineEditLoader",
    mustKeep: [
      "Deadline updated",
      "Unable to update deadline",
      "Save changes",
      "deadlineToForm",
      "deadlinesApi.retrieve",
    ],
  },
  {
    name: "document templates create",
    list: path.join(APP, "configuration/templates/page.tsx"),
    route: path.join(APP, "configuration/templates/new/page.tsx"),
    form: path.join(SRC, "features/financial-records/TemplateBuilderForm.tsx"),
    href: "/configuration/templates/new",
    component: "TemplateCreateForm",
    mustKeep: [
      "Record type is required.",
      "Template name is required.",
      "Effective-to cannot precede effective-from.",
      "Duplicate field key:",
      "needs at least one choice.",
      "Draft template created",
      "choices_text",
      "output_mapping",
      "multi_choice",
    ],
    // The Excel import panel still lives on this page and still uses the hook.
    allowLeftover: ["useRevealOnOpen"],
    alsoPresent: ["importPanelRef", "importMutation"],
    alsoAbsent: ["editorPanelRef", "saveTemplate", "blankForm", "FIELD_TYPES"],
  },
  {
    name: "document templates edit",
    list: path.join(APP, "configuration/templates/page.tsx"),
    route: path.join(APP, "configuration/templates/[id]/edit/page.tsx"),
    form: path.join(SRC, "features/financial-records/TemplateBuilderForm.tsx"),
    href: "/configuration/templates/${template.id}/edit",
    component: "TemplateEditLoader",
    mustKeep: [
      "Draft template updated",
      "templateToForm",
      "financialTemplatesApi.get",
      "Publish a new version instead of editing a published schema in place.",
      'status !== "draft"',
    ],
    allowLeftover: ["useRevealOnOpen"],
    // The new-version flow used to reopen the editor on the fresh draft; it
    // must now navigate there instead, or that path silently does nothing.
    alsoPresent: ["router.push", "${draft.id}/edit"],
    alsoAbsent: ["openEdit", "openCreate"],
  },
];

/** Replace comment bodies with blanks so a comment can never satisfy a check. */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/**
 * Every region between an accepted write gate and its closing tag.
 *
 * `AdminOnly` (v17.27) is admitted alongside `WriteOnly` because it is
 * STRICTER - Administrator alone versus Administrator or Assistant - so a
 * create link inside it is exposed to fewer people, not more. It is required on
 * configuration/templates, whose ViewSet is `IsAdministratorOrReadOnly`; gating
 * that page with WriteOnly showed Assistants an Edit link whose save always
 * 403'd.
 */
const ACCEPTED_GATES = ["WriteOnly", "AdminOnly"] as const;

function writeOnlyRegions(source: string): string[] {
  const regions: string[] = [];
  for (const gate of ACCEPTED_GATES) {
    const openTag = `<${gate}>`;
    const closeTag = `</${gate}>`;
    let from = 0;
    for (;;) {
      const start = source.indexOf(openTag, from);
      if (start === -1) break;
      const end = source.indexOf(closeTag, start);
      if (end !== -1) regions.push(source.slice(start, end));
      from = start + openTag.length;
    }
  }
  return regions;
}

describe("create/edit route conversions", () => {
  it("is not vacuous: the list pages are real and the assertions are substantial", () => {
    expect(CONVERSIONS.length).toBeGreaterThanOrEqual(5);
    for (const c of CONVERSIONS) {
      const list = read(c.list);
      expect(list.length, c.name).toBeGreaterThan(5000);
      expect(c.mustKeep.length, c.name).toBeGreaterThanOrEqual(4);
      expect(writeOnlyRegions(list).length, c.name).toBeGreaterThan(0);
    }
  });

  it("every route file exists and mounts its form component", () => {
    for (const c of CONVERSIONS) {
      expect(fs.existsSync(c.route), `${c.name}: missing route ${c.route}`).toBe(true);
      const route = blankComments(read(c.route));
      expect(route, c.name).toContain(`<${c.component}`);
      expect(route, c.name).toContain(c.component);
    }
  });

  it("every form component file exists and exports its component", () => {
    for (const c of CONVERSIONS) {
      expect(fs.existsSync(c.form), `${c.name}: missing form ${c.form}`).toBe(true);
      const form = blankComments(read(c.form));
      expect(form, c.name).toMatch(new RegExp(`export function ${c.component}\\b`));
    }
  });

  it("the list pages link to the routes, and only from inside <WriteOnly>", () => {
    for (const c of CONVERSIONS) {
      const list = blankComments(read(c.list));
      expect(list, c.name).toContain(c.href);
      const gated = writeOnlyRegions(list).some((r) => r.includes(c.href));
      expect(gated, `${c.name}: ${c.href} is not inside a <WriteOnly> region`).toBe(true);
    }
  });

  it("the panel machinery is gone from the converted list pages", () => {
    const banned = [
      "useRevealOnOpen",
      "createPanelRef",
      "editPanelRef",
      "dialogOpen",
      "setFormOpen",
    ];
    for (const c of CONVERSIONS) {
      const list = blankComments(read(c.list));
      const exempt = c.allowLeftover ?? [];
      for (const token of banned) {
        if (exempt.includes(token)) continue;
        expect(list, `${c.name}: ${token} still in ${path.basename(c.list)}`).not.toContain(token);
      }
    }
  });

  it("exemptions are paid for: the surviving panel is present and the editor is not", () => {
    for (const c of CONVERSIONS) {
      const list = blankComments(read(c.list));
      for (const token of c.alsoPresent ?? []) {
        expect(list, `${c.name}: expected ${token} to survive`).toContain(token);
      }
      for (const token of c.alsoAbsent ?? []) {
        expect(list, `${c.name}: ${token} should have moved out`).not.toContain(token);
      }
      // An exemption is only allowed to cover a panel that is still there.
      if (c.allowLeftover?.includes("useRevealOnOpen")) {
        expect(
          (c.alsoPresent ?? []).length,
          `${c.name}: exempting useRevealOnOpen requires naming the panel that keeps it`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("validation and payload logic moved with the form, and it navigates on save", () => {
    for (const c of CONVERSIONS) {
      const form = blankComments(read(c.form));
      for (const needle of c.mustKeep) {
        expect(form, `${c.name}: lost ${needle}`).toContain(needle);
      }
      expect(form, c.name).toContain("router.push");
      expect(form, c.name).not.toContain("setDialogOpen");
    }
  });
});
