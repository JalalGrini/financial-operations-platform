"use client";
import type { ReactNode } from "react";

import { useRole } from "@/hooks/useRole";

/**
 * Renders its children only for users the server would allow to write.
 *
 * WHY A COMPONENT AND NOT A HOOK AT EACH CALL SITE
 * ------------------------------------------------
 * The gate is a single rule applied in ~15 places. Calling `useRole()` in every
 * page and writing `{canWrite && <Button .../>}` by hand spreads one decision
 * across fifteen files, which is how the matrix came to be missing from the UI
 * in the first place: `RoleBasedAccessPermission` exists precisely because
 * three byte-identical copies of an authorization rule had already drifted.
 * One component means one place to change, and it reads as intent at the call
 * site.
 *
 * This is an affordance gate, not security. The server is authoritative and
 * enforces the same matrix regardless of what renders here. The purpose is
 * honesty in the interface: a Director is read-only server-side, so offering
 * them a New or Archive button only produces a 403 and the impression that the
 * app is broken.
 *
 * Use this for create, edit, and archive. Use `DeleteOnly` for permanent
 * destruction, which is Administrator-only. Do not gate writes on `isAdmin` -
 * that wrongly excludes Assistants, who may write.
 */
export function WriteOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  /** Optional read-only substitute, e.g. a disabled control or a hint. */
  fallback?: ReactNode;
}) {
  const { canWrite } = useRole();
  return <>{canWrite ? children : fallback}</>;
}

/**
 * Renders its children only for Administrators (or superusers).
 *
 * WHY THIS IS SEPARATE FROM DeleteOnly (v17.23)
 * ---------------------------------------------
 * `DeleteOnly` and `AdminOnly` currently resolve to the same set of people,
 * but they answer different questions and will diverge the moment the matrix
 * does. `DeleteOnly` means "may permanently destroy a record"; `AdminOnly`
 * means "this whole surface is governance, not day-to-day work" - account
 * administration being the case that forced it, because
 * `AdministratorOnly` in apps/accounts/views.py refuses Assistants and
 * Directors on GET as well as on write. Using DeleteOnly there would have
 * read as though creating a colleague's login were an act of destruction.
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isAdmin } = useRole();
  return <>{isAdmin ? children : fallback}</>;
}

/**
 * Renders its children only for users allowed to permanently destroy records.
 * Administrator only: an Assistant archives, an Administrator destroys.
 */
export function DeleteOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { canDelete } = useRole();
  return <>{canDelete ? children : fallback}</>;
}
