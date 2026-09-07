import { describe, expect, it } from "vitest";
import { flattenApiErrors } from "./api";

describe("flattenApiErrors", () => {
  it("preserves nested template field paths", () => {
    expect(
      flattenApiErrors({
        fields: [{ key: ["Already exists."], choices: ["Required."] }],
      }),
    ).toEqual([
      "fields[0].key: Already exists.",
      "fields[0].choices: Required.",
    ]);
  });

  it("does not prefix non-field or detail messages", () => {
    expect(
      flattenApiErrors({
        non_field_errors: ["Records overlap."],
        detail: "Forbidden.",
      }),
    ).toEqual(["Records overlap.", "Forbidden."]);
  });

  it("keeps false and zero messages representable", () => {
    expect(flattenApiErrors({ enabled: false, count: 0 })).toEqual([
      "enabled: false",
      "count: 0",
    ]);
  });
});
