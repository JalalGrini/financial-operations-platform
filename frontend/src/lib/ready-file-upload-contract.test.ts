import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

describe("permanent ready-file upload contract", () => {
  it("keeps financial-record attachments available", () => {
    const page = read("src/app/(protected)/financial-records/[id]/page.tsx");
    expect(page).toContain('type="file"');
    expect(page).toContain("uploadAttachment");
  });
  it("supports ready report upload and authenticated download", () => {
    const page = read("src/app/(protected)/reports/page.tsx");
    const api = read("src/features/reports/api/index.ts");
    expect(page).toContain("Upload a ready file (optional)");
    expect(api).toContain("/reports/reports/upload-ready/");
    expect(api).toContain("downloadReadyFile");
  });
  it("supports private personnel-document upload and download", () => {
    const page = read("src/app/(protected)/personnel/personnel/[id]/page.tsx");
    const api = read("src/features/personnel/api/index.ts");
    expect(page).toContain("Upload a ready file");
    expect(api).toContain("new FormData()");
    expect(api).toContain("document.download_url");
  });
  it("supports editing inventory items with image uploads", () => {
    const page = read("src/app/(protected)/inventory/[id]/edit/page.tsx");
    const form = read("src/features/inventory/InventoryItemForm.tsx");
    const api = read("src/features/inventory/api.ts");
    // The contract is "the edit page fetches the item and hands it to the
    // form", not the name of the local that holds it. This previously asserted
    // the literal `InventoryItemForm item={data}` and broke the day the page
    // renamed the destructured query result to `item` - a false failure about a
    // page that was working correctly.
    expect(page).toContain("inventoryApi.getItem");
    expect(page).toMatch(/<InventoryItemForm\s+item=\{\w+\}/);
    expect(form).toContain('type="file"');
    expect(api).toContain("updateItem");
  });

  it("preserves spreadsheet template import for future predefined templates", () => {
    const page = read("src/app/(protected)/configuration/templates/page.tsx");
    expect(page).toContain("Import Excel template");
    expect(page).toContain('type="file"');
  });
});
