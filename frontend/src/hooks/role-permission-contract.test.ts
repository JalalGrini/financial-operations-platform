import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { DELETE_ROLES, READ_ROLES, WRITE_ROLES } from "./useRole";

/**
 * Cross-stack contract.
 *
 * The role matrix is authored once, in Python, at
 * backend/apps/common/permissions.py. The frontend keeps a copy so it can hide
 * affordances the API would refuse. Two copies of an authorization rule is the
 * exact defect RoleBasedAccessPermission was created to remove, so the copy is
 * only acceptable if drift is impossible. This test reads the Python source and
 * fails if the tuples disagree.
 *
 * If this fails, change the Python first, then match it here. Never the
 * reverse: the server is authoritative.
 */

const PERMISSIONS_PY = path.resolve(
  __dirname,
  "../../../backend/apps/common/permissions.py",
);

// Extracts the quoted members of a Python tuple assignment without regex, so
// there is no escaping subtlety to get wrong.
function pythonTuple(source: string, name: string): string[] {
  const marker = name + " = (";
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error("Could not find " + name + " in permissions.py");
  }
  const end = source.indexOf(")", start);
  const body = source.slice(start + marker.length, end);
  return body.split('"').filter((_, index) => index % 2 === 1);
}

describe("role permission contract", () => {
  const source = fs.readFileSync(PERMISSIONS_PY, "utf8");

  // Vacuity guard: a moved or emptied backend file must fail loudly rather than
  // silently make every assertion below trivially true.
  it("can actually read the backend permission source", () => {
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("class RoleBasedAccessPermission");
  });

  it("agrees with the backend on who may read", () => {
    expect([...READ_ROLES]).toEqual(pythonTuple(source, "READ_ROLES"));
  });

  it("agrees with the backend on who may write", () => {
    expect([...WRITE_ROLES]).toEqual(pythonTuple(source, "WRITE_ROLES"));
  });

  it("agrees with the backend on who may permanently delete", () => {
    expect([...DELETE_ROLES]).toEqual(pythonTuple(source, "DELETE_ROLES"));
  });

  it("keeps Director read-only and Assistant unable to destroy", () => {
    // These are the two facts the UI kept getting wrong. Pinning them means any
    // future widening of the matrix has to be deliberate.
    expect(READ_ROLES).toContain("Director");
    expect(WRITE_ROLES).not.toContain("Director");
    expect(WRITE_ROLES).toContain("Assistant");
    expect(DELETE_ROLES).not.toContain("Assistant");
  });
});
