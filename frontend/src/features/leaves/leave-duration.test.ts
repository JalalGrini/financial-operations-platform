import { describe, expect, it } from "vitest";
import { leaveDurationDays } from "./api";

describe("leaveDurationDays", () => {
  it("counts the start date and excludes the return date", () => {
    expect(
      leaveDurationDays("2026-06-01", "2026-06-10", [0, 1, 2, 3, 4, 5, 6]),
    ).toBe(9);
  });

  it("returns 0 when start and return are the same day", () => {
    expect(leaveDurationDays("2026-09-10", "2026-09-10", [0, 1, 2, 3, 4, 5, 6])).toBe(
      0,
    );
  });
});
