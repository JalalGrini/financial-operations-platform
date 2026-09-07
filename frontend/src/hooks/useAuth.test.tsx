// frontend/src/hooks/useAuth.test.tsx
/**
 * M1-A Task 1: failing tests written BEFORE the tokenless-cookie
 * rewrite of useAuth. Static source checks proving the auth hook
 * never touches localStorage/sessionStorage, never builds an
 * Authorization header, and never sends a `refresh` field in a
 * refresh/logout request body.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const USE_AUTH_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "./useAuth.tsx"),
  "utf-8",
);

describe("useAuth static source checks (M1-A tokenless cookie contract)", () => {
  it("does not reference localStorage anywhere", () => {
    expect(USE_AUTH_SOURCE).not.toMatch(/localStorage/);
  });

  it("does not reference sessionStorage anywhere", () => {
    expect(USE_AUTH_SOURCE).not.toMatch(/sessionStorage/);
  });

  it("does not construct an Authorization header with a Bearer token", () => {
    expect(USE_AUTH_SOURCE).not.toMatch(/Authorization.*Bearer/);
  });

  it("logout() does not send a refresh token in the request body", () => {
    // A tokenless logout call must not read a client-held refresh value
    // and place it in the POST body.
    const logoutFnMatch = USE_AUTH_SOURCE.match(
      /const logout = async[\s\S]*?\n  };/,
    );
    expect(logoutFnMatch).not.toBeNull();
    const logoutBody = logoutFnMatch ? logoutFnMatch[0] : "";
    expect(logoutBody).not.toMatch(/refresh/);
  });

  it("refreshTokens() does not read or store a refresh/access token value", () => {
    const refreshFnMatch = USE_AUTH_SOURCE.match(
      /const refreshTokens = async[\s\S]*?\n  };/,
    );
    expect(refreshFnMatch).not.toBeNull();
    const refreshBody = refreshFnMatch ? refreshFnMatch[0] : "";
    expect(refreshBody).not.toMatch(/localStorage/);
  });
});
