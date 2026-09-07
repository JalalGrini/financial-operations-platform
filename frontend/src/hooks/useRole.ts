"use client";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import type { RoleName } from "@/types/auth";

/**
 * Client-side mirror of the server's role matrix.
 *
 * The authoritative definition is `RoleBasedAccessPermission` in
 * `backend/apps/common/permissions.py`. These three tuples must stay
 * byte-equal to the Python ones; `role-permission-contract.test.ts` parses
 * that file and fails if they drift.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, the only role predicate used by any screen was
 * `isAdministrator`, and it gated exactly one kind of affordance: permanent
 * delete. Nothing gated create, edit, or archive. Because a Director is
 * read-only on the server, every Director was shown all 15 "New" buttons and
 * every Edit / Archive row action, and every one of them failed with 403 on
 * click. The permission boundary was correct on the server and absent in the
 * UI.
 *
 * These are affordance gates, not security. The server decides. Hiding a
 * button the API would refuse is a correctness and trust concern: an action
 * offered to a user must be an action that user can actually complete.
 *
 * Use `canWrite` for create / edit / archive, and `canDelete` for permanent
 * destruction. Do not reintroduce bare `isAdmin` checks for write
 * affordances - that wrongly locks out Assistants, who may write.
 */
export const READ_ROLES: readonly RoleName[] = [
  "Administrator",
  "Assistant",
  "Director",
];
export const WRITE_ROLES: readonly RoleName[] = ["Administrator", "Assistant"];
export const DELETE_ROLES: readonly RoleName[] = ["Administrator"];

export function useRole() {
  const { user } = useAuth();
  const roles = getEffectiveRoles(user);

  // A superuser bypasses everything, exactly as it does server-side.
  const isSuperuser = user?.is_superuser ?? false;
  const inAny = (allowed: readonly RoleName[]) =>
    isSuperuser || roles.some((role) => allowed.includes(role));

  return {
    roles,
    isAdmin: roles.includes("Administrator") || isSuperuser,
    isDirector: roles.includes("Director"),
    isAssistant: roles.includes("Assistant"),

    /** May view. An authenticated user in no recognised role may not. */
    canRead: inAny(READ_ROLES),
    /** May create, edit, and archive. Administrator or Assistant. */
    canWrite: inAny(WRITE_ROLES),
    /** May permanently destroy. Administrator only. */
    canDelete: inAny(DELETE_ROLES),

    hasRole: (role: RoleName) => roles.includes(role),
    user,
  };
}
