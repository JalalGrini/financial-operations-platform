// frontend/src/lib/api.test.ts
/**
 * M1-A Task 1: failing tests written BEFORE the tokenless-cookie
 * rewrite, characterizing the approved contract for the Axios client:
 *
 * - `withCredentials: true` by default.
 * - No `Authorization: Bearer` header injection.
 * - No JWT read from or written to localStorage/sessionStorage.
 * - Login/refresh consume/produce no `access`/`refresh` token fields.
 *
 * A static source-text check is used alongside the axios-instance
 * check because the current module executes side-effecting singleton
 * construction (`export const apiClient = new ApiClient()`) at import
 * time; reading the compiled instance's config is more reliable for
 * proving `withCredentials`, while the source-text check directly
 * proves the *absence* of forbidden API surface (localStorage,
 * Authorization header assignment) regardless of whether that code
 * path is reachable in this test's specific call graph.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const API_TS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "./api.ts"),
  "utf-8",
);

describe("apiClient static source checks (M1-A tokenless cookie contract)", () => {
  it("does not reference localStorage anywhere", () => {
    expect(API_TS_SOURCE).not.toMatch(/localStorage/);
  });

  it("does not reference sessionStorage anywhere", () => {
    expect(API_TS_SOURCE).not.toMatch(/sessionStorage/);
  });

  it("does not construct an Authorization header with a Bearer token", () => {
    expect(API_TS_SOURCE).not.toMatch(/Authorization.*Bearer/);
  });

  it("configures withCredentials: true for the underlying axios instance", () => {
    expect(API_TS_SOURCE).toMatch(/withCredentials:\s*true/);
  });

  it("does not read or write an access_token or refresh_token value", () => {
    expect(API_TS_SOURCE).not.toMatch(/access_token/);
    expect(API_TS_SOURCE).not.toMatch(/refresh_token/);
  });
});

describe("apiClient module import (M1-A tokenless cookie contract)", () => {
  it("the imported apiClient axios instance has withCredentials: true", async () => {
    const { apiClient } = await import("./api");
    // Test-only introspection of the private axios client.
    const axiosInstance = (apiClient as any).client;
    expect(axiosInstance.defaults.withCredentials).toBe(true);
  });
});
