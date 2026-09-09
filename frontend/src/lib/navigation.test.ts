import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  ALL_NAV_ITEMS,
  NAVIGATION,
  RETIRED_ROUTES,
  canAccessNavigationItem,
  getEffectiveRoles,
} from "./navigation";
import type { RoleName, User } from "@/types/auth";

function user(roles: RoleName[], isSuperuser = false): User {
  return {
    id: "1",
    email: "user@example.test",
    first_name: "Test",
    last_name: "User",
    full_name: "Test User",
    is_staff: isSuperuser,
    is_superuser: isSuperuser,
    is_active: true,
    date_joined: null,
    last_login: null,
    roles,
    permissions: [],
    must_change_password: false,
  };
}

describe("role-normalized navigation", () => {
  it("does not default a role-less user to Assistant", () => {
    expect(getEffectiveRoles(user([]))).toEqual([]);
    expect(
      NAVIGATION.filter((item) => canAccessNavigationItem(user([]), item)),
    ).toEqual([]);
  });

  it("normalizes a superuser to Administrator and exposes administrator routes", () => {
    const superuser = user([], true);
    expect(getEffectiveRoles(superuser)).toContain("Administrator");
    const names = NAVIGATION.filter((item) =>
      canAccessNavigationItem(superuser, item),
    ).map((item) => item.name);
    expect(names).toContain("Configuration");
    expect(names).toContain("Settings");
  });

  it("exposes every required Cycle 33 module to an administrator", () => {
    const admin = user(["Administrator"]);
    const names = NAVIGATION.filter((item) =>
      canAccessNavigationItem(admin, item),
    ).map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Clients",
        "Suppliers",
        "Financial Records",
        "Reports Registry",
        "Configuration",
        "Document Templates",
        "Settings",
      ]),
    );
  });

  it("uses /reports for the registry", () => {
    expect(
      NAVIGATION.find((item) => item.name === "Reports Registry")?.href,
    ).toBe("/reports");
  });

  it("shows Trésorerie to every recognised role, under Dashboard", () => {
    const href = "/tresorerie";
    const item = NAVIGATION.find((entry) => entry.href === href);
    expect(item, `${href} must be present in the sidebar`).toBeDefined();
    expect(item!.roles).toEqual(["Administrator", "Assistant", "Director"]);
    expect(NAVIGATION[0]?.href).toBe("/dashboard");
    expect(NAVIGATION[1]?.href).toBe(href);

    const visibleFor = (audience: User) =>
      NAVIGATION.filter((entry) => canAccessNavigationItem(audience, entry)).map(
        (entry) => entry.href,
      );

    expect(visibleFor(user(["Administrator"]))).toContain(href);
    expect(visibleFor(user(["Assistant"]))).toContain(href);
    expect(visibleFor(user(["Director"]))).toContain(href);
  });

  it("shows Treasury and Personnel Reports to administrators only", () => {
    // v17.21 supersedes the v17.18 retirement. Both modules are back in the
    // sidebar, restricted to Administrator. This is NOT a cosmetic gate: the
    // API answers 403 to the other roles - see
    // backend/apps/common/tests/test_admin_only_modules_contract.py.
    const adminOnly = ["/treasury", "/personnel/reports"];

    for (const href of adminOnly) {
      const item = NAVIGATION.find((entry) => entry.href === href);
      expect(item, `${href} must be present in the sidebar`).toBeDefined();
      expect(item!.roles, href).toEqual(["Administrator"]);
    }

    const visibleFor = (audience: User) =>
      NAVIGATION.filter((item) => canAccessNavigationItem(audience, item)).map(
        (item) => item.href,
      );

    for (const href of adminOnly) {
      expect(visibleFor(user(["Administrator"])), href).toContain(href);
      expect(visibleFor(user([], true)), `superuser ${href}`).toContain(href);
      expect(visibleFor(user(["Assistant"])), href).not.toContain(href);
      expect(visibleFor(user(["Director"])), href).not.toContain(href);
    }
  });

  it("keeps the retirement mechanism available even though nothing uses it", () => {
    // Vacuity guard: the test above would also pass if the whole nav were empty.
    expect(NAVIGATION.length).toBeGreaterThan(15);

    // Nothing is retired as of v17.21; the mechanism stays because it is the
    // supported way to remove a module for every role at once.
    expect([...RETIRED_ROUTES]).toEqual([]);
    expect(ALL_NAV_ITEMS.length).toBe(NAVIGATION.length + RETIRED_ROUTES.length);
    for (const retired of RETIRED_ROUTES) {
      expect(ALL_NAV_ITEMS.map((item) => item.href)).toContain(retired);
    }
  });

  it("has no obsolete duplicate sidebar source", () => {
    const obsolete = path.resolve(__dirname, "../components/ui/sidebar.tsx");
    expect(fs.existsSync(obsolete)).toBe(false);
  });
});
