/**
 * Guard for the three defects fixed in v17.28. Each was invisible to tsc,
 * eslint and every existing test, and two of them were *dead correct code* -
 * the logic existed and was never reached, which is the hardest kind to spot.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), "utf8");
}

/** Comments must not satisfy an assertion nor hide a violation. */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) =>
      p1 + m.slice(p1.length).replace(/./g, " "),
    );
}

const CNSS_LIST = "app/(protected)/personnel/cnss/page.tsx";
const CNSS_EDIT = "app/(protected)/personnel/cnss/[id]/edit/page.tsx";
const PERSON_EDIT = "app/(protected)/personnel/personnel/[id]/edit/page.tsx";

describe("CNSS edit locks the record it is editing", () => {
  const source = blankComments(read(CNSS_EDIT));

  it("is not vacuous", () => {
    expect(source.length).toBeGreaterThan(3000);
  });

  it("offers no picker for person, company or employment", () => {
    // The reported bug: three Radix Selects whose options arrive from separate
    // queries rendered their placeholder while the form already held the right
    // ids, so the screen looked blank and demanded re-picking. Re-pointing a
    // declaration at a different person is a new declaration, not an edit.
    for (const field of ["person", "company", "employment"]) {
      expect(
        source.includes(`setValue("${field}"`),
        `${CNSS_EDIT} still lets the user change ${field}`,
      ).toBe(false);
    }
    expect(source).not.toContain("Select person");
    expect(source).not.toContain("Select company");
    expect(source).not.toContain("Select employment");
  });

  it("still submits all three ids", () => {
    // Locking the UI must not drop them from the payload.
    for (const field of ["person", "company", "employment"]) {
      expect(source, `${field} must stay registered`).toContain(
        `register("${field}")`,
      );
    }
  });

  it("shows the locked subject instead", () => {
    expect(source).toContain("Declaration subject (cannot be changed)");
    expect(source).toContain("person_name");
    expect(source).toContain("company_name");
  });
});

describe("CNSS list does not offer Edit on an archived row", () => {
  const source = blankComments(read(CNSS_LIST));

  it("is not vacuous: the live table is still here", () => {
    expect(source).toContain("cnssData?.results");
  });

  it("branches the row action on is_archived", () => {
    // Two defects were live: Edit was offered on an archived declaration, which
    // the API refuses, and the controls sat outside <WriteOnly> so a Director
    // saw Edit and got a 403.
    const cell = source.slice(source.indexOf("cnssData?.results"));
    expect(cell).toContain("row.is_archived");
    expect(cell).toContain("<WriteOnly>");
  });

  it("keeps every Edit link inside a WriteOnly region", () => {
    const marker = "/edit`}";
    let from = 0;
    const ungated: number[] = [];
    for (;;) {
      const at = source.indexOf(marker, from);
      if (at === -1) break;
      const before = source.slice(0, at);
      const open = before.lastIndexOf("<WriteOnly>");
      const close = before.lastIndexOf("</WriteOnly>");
      if (open === -1 || close > open) ungated.push(at);
      from = at + marker.length;
    }
    expect(
      ungated.length,
      `${ungated.length} edit link(s) on ${CNSS_LIST} are outside <WriteOnly>`,
    ).toBe(0);
  });
});

describe("personnel profile photo is wired, not dead code", () => {
  const source = blankComments(read(PERSON_EDIT));
  const avatar = blankComments(read("components/ui/employee-avatar.tsx"));

  it("is not vacuous", () => {
    expect(source.length).toBeGreaterThan(3000);
    expect(avatar.length).toBeGreaterThan(1000);
  });

  it("renders the editable avatar", () => {
    // Before v17.28 the state, both handlers and the EmployeeAvatar import all
    // existed and nothing rendered them, so no photo could be set from this
    // screen at all.
    expect(source).toContain("<EmployeeAvatar");
    expect(source).toContain("editable");
    expect(source).toContain("onPhotoChange={handlePhotoChange}");
    expect(source).toContain("onPhotoDelete={handlePhotoDelete}");
  });

  it("persists an upload as multipart", () => {
    expect(source).toContain("new FormData()");
    expect(source).toContain("personnelApi.updateWithPhoto");
  });

  it("persists a removal as an explicit null", () => {
    // The old handler only cleared local state, so on a person who already had
    // a stored photo it discarded nothing and the photo survived the save.
    expect(source).toContain("photoRemoved");
    expect(source).toContain("photo: null");
  });

  it("gates the control behind WriteOnly", () => {
    const at = source.indexOf("<EmployeeAvatar");
    const before = source.slice(0, at);
    const open = before.lastIndexOf("<WriteOnly>");
    const close = before.lastIndexOf("</WriteOnly>");
    expect(open, "avatar editor must sit inside <WriteOnly>").toBeGreaterThan(-1);
    expect(close).toBeLessThan(open);
  });

  it("falls back to initials when there is no photo", () => {
    expect(avatar).toContain("getInitials");
    expect(avatar).toContain("showPhoto");
    expect(avatar).toContain("onError");
  });
});

describe("SearchableSelect is wired and dependency-free", () => {
  const component = blankComments(read("components/ui/searchable-select.tsx"));

  it("exists and filters accent-insensitively", () => {
    expect(component).toContain("normalize(\"NFD\")");
    expect(component).toContain("createPortal");
  });

  it("adds no new dependency", () => {
    // @radix-ui/react-popover and cmdk are not available here, and this repo's
    // node_modules cannot be reproduced from its own manifest, so a new package
    // would block every other build until the owner installed it online.
    expect(component).not.toContain("@radix-ui/react-popover");
    expect(component).not.toContain("cmdk");
  });

  it("has no mounted-flag setState in an effect", () => {
    expect(component).not.toContain("setMounted");
  });

  it("is rendered by at least one screen", () => {
    // Dead components are this repo's documented failure mode.
    const callSite = blankComments(
      read("app/(protected)/personnel/cnss/new/page.tsx"),
    );
    expect(callSite).toContain("searchable-select");
    expect(callSite).toContain("<SearchableSelect");
  });
});

describe("header notification badge is wired to the real count", () => {
  const header = blankComments(read("components/ui/header.tsx"));

  it("is not vacuous", () => {
    expect(header.length).toBeGreaterThan(1000);
    expect(header).toContain("unreadCount");
  });

  it("no longer hardcodes zero", () => {
    // `const unreadCount = 0` behind a TODO meant the badge - which only renders
    // above zero - could never appear. The indicator was dead while looking
    // deliberately built.
    expect(header).not.toMatch(/const unreadCount\s*=\s*0\s*;/);
    expect(header).toContain("collaborationApi.unreadCount");
  });

  it("shares the cache key with the other two consumers", () => {
    // GlobalControls and the dashboard already poll this endpoint. A different
    // key would mean three independent refetches and three numbers that can
    // disagree on screen.
    expect(header).toContain('"notifications", "count"');
  });
});

describe("popover, checkbox and slider primitives add no dependency", () => {
  const files = {
    popover: blankComments(read("components/ui/popover.tsx")),
    checkbox: blankComments(read("components/ui/checkbox.tsx")),
    slider: blankComments(read("components/ui/slider.tsx")),
    filter: blankComments(read("components/ui/filter-popover.tsx")),
  };

  it("is not vacuous", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source.length, name).toBeGreaterThan(400);
    }
  });

  it("imports no Radix package that is not declared", () => {
    // package.json declares dialog, dropdown-menu, select, slot, tabs, tooltip.
    // popover, checkbox and slider are NOT declared, so importing them would
    // build here (node_modules is a superset) and fail for anyone who installed
    // from the manifest.
    const banned = [
      "@radix-ui/react-popover",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-slider",
      "cmdk",
      "react-icons",
    ];
    for (const [name, source] of Object.entries(files)) {
      for (const pkg of banned) {
        expect(source, `${name} must not import ${pkg}`).not.toContain(pkg);
      }
    }
  });

  it("builds the checkbox and slider on native inputs", () => {
    // Native inputs are focusable, form-associable and announced correctly; a
    // div with role="checkbox" has to reimplement all of that.
    expect(files.checkbox).toContain('type="checkbox"');
    expect(files.slider).toContain('type="range"');
  });

  it("portals the popover and has no mounted-flag effect", () => {
    expect(files.popover).toContain("createPortal");
    expect(files.popover).not.toContain("setMounted");
  });

  it("keeps the popover RTL-aware", () => {
    // `align="end"` must follow reading order, not always be the right edge.
    expect(files.popover).toContain('dir === "rtl"');
  });
});

describe("no list offers a mutating action on an archived row", () => {
  /**
   * The repo-wide version of the CNSS fix.
   *
   * Three pages had the identical defect and it was invisible for the same
   * reason each time: the page had a `columns` definition that branched
   * correctly on `row.is_archived`, and a *different*, live table that rendered
   * Edit unconditionally. The correct logic existed and was never reached, so
   * reading the file casually suggested it was handled.
   *
   * Found and fixed: personnel/cnss, personnel/employments, personnel/salaries
   * (live tables offering Edit on an archived row, none inside <WriteOnly>), and
   * configuration/templates (an archived draft is still status "draft", so Edit
   * and Publish were offered on it).
   *
   * The lookback window is 1800 characters: enough to cover a full row-actions
   * cell including a long ternary branch. At 600 it reported false positives on
   * correctly-guarded cells, which is the more expensive failure for a guard -
   * a noisy check gets ignored.
   */
  const APP = path.resolve(SRC, "app", "(protected)");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  const MUTATORS: Array<[string, RegExp]> = [
    ["edit link", /\/edit`\}/g],
    ["Archive action", /label:\s*"Archive"/g],
    ["Restore action", /label:\s*"Restore"/g],
    ["Stop action", /label:\s*"Stop"/g],
    ["Edit action", /label:\s*"Edit"/g],
  ];

  const files = walk(APP);
  const archiveAware = files.filter((file) =>
    /is_archived|archive_state|archivedCount|showArchived/.test(
      blankComments(fs.readFileSync(file, "utf8")),
    ),
  );

  it("is not vacuous: several pages are archive-aware", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(archiveAware.length).toBeGreaterThan(5);
  });

  it("would still detect an unguarded control (vacuity guard on the detector)", () => {
    const unguarded = `<Link href={\`/x/\${row.id}/edit\`}>`;
    const guarded = `{row.is_archived ? <Restore/> : <Link href={\`/x/\${row.id}/edit\`}>}`;
    const check = (source: string) => {
      const at = source.indexOf("/edit`}");
      const window = source.slice(Math.max(0, at - 1800), at);
      return /is_archived/.test(window);
    };
    expect(check(unguarded)).toBe(false);
    expect(check(guarded)).toBe(true);
  });

  it("has no mutating control outside an is_archived branch", () => {
    const offenders: string[] = [];
    for (const file of archiveAware) {
      const source = blankComments(fs.readFileSync(file, "utf8"));
      const rel = path.relative(APP, file).split(path.sep).join("/");
      for (const [name, pattern] of MUTATORS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          const window = source.slice(Math.max(0, match.index - 1800), match.index);
          if (!/is_archived/.test(window)) {
            const line = source.slice(0, match.index).split("\n").length;
            offenders.push(`${rel}:${line} ${name}`);
          }
        }
      }
    }
    expect(
      offenders,
      `these mutating controls are offered regardless of archive state, and the API refuses them:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
