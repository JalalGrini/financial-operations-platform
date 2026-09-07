import { describe, expect, it } from "vitest";
import { releasesMatch, UI_RELEASE_ID } from "./release";

describe("release identity", () => {
  it("accepts only an exact API/UI release match", () => {
    expect(releasesMatch(UI_RELEASE_ID)).toBe(true);
    expect(releasesMatch("EFOP-OLD")).toBe(false);
    expect(releasesMatch(null)).toBe(false);
  });
});
