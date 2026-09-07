/**
 * Structural guards for two UI defects that are invisible in a unit test but
 * obvious to anyone using the app, and that a plausible-looking edit would
 * silently reintroduce.
 *
 * 1. SCROLL TRAPPING. Every <Table> is wrapped in a scroll container. That
 *    wrapper used to carry `overflow-auto overscroll-contain`. It has no
 *    max-height, so it never scrolled vertically - but overscroll-behavior:
 *    contain still stopped a vertical wheel from reaching the page, so with the
 *    cursor over any table the page would not scroll at all.
 *
 * 2. OVERLAY POSITIONING. ProtectedLayout wraps every page in a framer-motion
 *    `motion.div` that animates `y`, so it carries a transform. A transformed
 *    ancestor becomes the containing block for `position: fixed`, which means a
 *    `fixed inset-0` overlay rendered inside a page covers the PAGE CONTENT box
 *    rather than the viewport - the archive confirmation appeared centred in the
 *    middle of the list instead of the middle of the screen. Overlays must
 *    therefore be portalled out to document.body.
 *
 * These are source-level assertions on purpose: jsdom performs no layout and
 * does not implement overscroll-behavior or containing-block resolution, so a
 * rendered test could not detect either fault.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(SRC, relativePath), "utf8");
}

/**
 * Source with comments removed.
 *
 * The "must not appear" assertions below are about what the COMPONENT DOES, and
 * the explanation of why each class was removed necessarily names the class it
 * warns against. Matching raw text would make the guard fail on its own
 * documentation and pressure the next person into deleting the reasoning to get
 * the suite green.
 */
function code(relativePath: string) {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("table scroll container", () => {
  const source = code("components/ui/table.tsx");

  it("does not contain the scroll, so the page still scrolls over a table", () => {
    expect(source).not.toMatch(/overscroll-contain/);
  });

  it("scrolls horizontally only, so a vertical wheel always reaches the page", () => {
    expect(source).toMatch(/overflow-x-auto/);
    // `overflow-auto` would make it a vertical scroll container again.
    expect(source).not.toMatch(/\boverflow-auto\b/);
  });
});

describe("overlays are portalled out of the transformed page wrapper", () => {
  it("ProtectedLayout still animates y, which is what makes portalling necessary", () => {
    // If this ever stops being true the reasoning above should be revisited
    // rather than silently relied upon.
    const layout = read("components/layout/ProtectedLayout.tsx");
    expect(layout).toMatch(/motion\.div/);
    expect(layout).toMatch(/y:\s*-?\d+/);
  });

  it("the shared ConfirmDialog renders through the portalled Dialog primitives", () => {
    const source = read("features/personnel/components/common.tsx");
    expect(source).toMatch(/from "@\/components\/ui\/dialog"/);
    expect(source).toMatch(/<DialogContent/);
  });

  it("the shared ConfirmDialog no longer hand-rolls a fixed overlay", () => {
    const source = code("features/personnel/components/common.tsx");
    expect(source).not.toMatch(/fixed inset-0 z-50 flex items-center justify-center/);
  });

  it("FilePreviewModal is portalled to document.body", () => {
    const source = read("components/ui/file-preview.tsx");
    expect(source).toMatch(/createPortal\(/);
    expect(source).toMatch(/document\.body/);
  });

  it("the Dialog primitive itself portals its content", () => {
    const source = read("components/ui/dialog.tsx");
    expect(source).toMatch(/DialogPortal/);
  });
});
