import { describe, expect, it } from "vitest";
import { archiveActionForRow, archiveStateForView } from "./archive-contract";

describe("personnel archive contract", () => {
  it("uses explicit mutually exclusive list states", () => {
    expect(archiveStateForView(false)).toBe("active");
    expect(archiveStateForView(true)).toBe("archived");
  });

  it("uses the archive flag—not employment status—to choose the row action", () => {
    expect(archiveActionForRow({ is_archived: false })).toBe("archive");
    expect(archiveActionForRow({ is_archived: true })).toBe("restore");
  });
});
