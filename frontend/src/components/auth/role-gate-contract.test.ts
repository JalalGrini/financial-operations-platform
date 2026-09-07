import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * v17.23: role affordances beyond the page heroes.
 *
 * WHY THIS EXISTS ALONGSIDE write-gate-contract.test.ts
 * -----------------------------------------------------
 * That guard walks page files and checks one specific thing: that a hero
 * create button (`variant="onHero"`) sits inside <WriteOnly>. It is precise
 * and it has caught real regressions, but it is blind to everything that is
 * not a hero create button. A full audit of the protected tree found two
 * screens it could never have seen:
 *
 *   1. /users - account administration. The server refuses Assistant and
 *      Director on EVERY verb (AdministratorOnly in apps/accounts/views.py,
 *      which overrides has_permission rather than the role tuples, so even
 *      GET is Administrator-only). The page had no gate at all.
 *   2. /financial-records/[id] - the record detail page. Ten mutations,
 *      zero role checks. A Director saw Edit header, Cancel record, Post to
 *      ledger, Add line, Edit line, Delete line, Upload and Remove file.
 *
 * Neither uses `variant="onHero"`, so neither was ever in scope for the
 * hero guard. This file pins the gates that were added instead.
 *
 * It reads source text for the same reason the hero guard does: the failure
 * mode is a missing wrapper, which is structural, and a render test would
 * need fixtures for every role on every screen.
 */

const SRC = path.resolve(__dirname, "../..");
const REPO = path.resolve(__dirname, "../../../..");

/** Strip comments so prose in a docblock cannot satisfy an assertion. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

const read = (rel: string) =>
  stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));

const GATES = read("components/auth/WriteOnly.tsx");
const USERS = read("app/(protected)/users/page.tsx");
const RECORD = read("app/(protected)/financial-records/[id]/page.tsx");

/**
 * Returns the number of times `marker` appears WITHOUT `gate` opening before
 * it and still being open. Same index arithmetic as the hero guard: JSX
 * nesting is not a regular language, and heavy backslash nesting is a known
 * tooling failure mode in this repo.
 */
function ungatedBy(source: string, marker: string, gate: string): number {
  const open = `{${gate} && (`;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return count;
    const before = source.slice(0, at);
    const opened = before.lastIndexOf(open);
    // A gate that opened before this marker and has not been closed by a
    // matching `)}` counts as covering it.
    const closed = opened === -1 ? -1 : before.indexOf(")}", opened);
    if (opened === -1 || (closed !== -1 && closed < at && closed > opened)) {
      count += 1;
    }
    from = at + marker.length;
  }
}

describe("role gate contract (v17.23)", () => {
  it("read real source files (vacuity guard)", () => {
    expect(GATES.length).toBeGreaterThan(500);
    expect(USERS.length).toBeGreaterThan(1000);
    expect(RECORD.length).toBeGreaterThan(5000);
  });

  it("exposes an AdminOnly gate distinct from DeleteOnly", () => {
    expect(GATES).toContain("export function AdminOnly");
    expect(GATES).toContain("export function DeleteOnly");
    expect(GATES).toContain("export function WriteOnly");
    // AdminOnly must read isAdmin, not canWrite: an Assistant may write but
    // must never administer accounts.
    const adminBody = GATES.slice(GATES.indexOf("export function AdminOnly"));
    expect(adminBody).toContain("isAdmin");
    expect(adminBody.slice(0, 400)).not.toContain("canWrite");
  });

  it("gates account administration to administrators", () => {
    // The create button is wrapped, and the per-account role/activation
    // controls are behind the same predicate.
    expect(USERS).toContain("<AdminOnly>");
    expect(USERS).toContain('from "@/components/auth/WriteOnly"');
    expect(USERS).toContain("const canManageAccounts = useRole().isAdmin");
    // v17.26: Administrator rows are no longer skipped. An Administrator may
    // edit every profile including another Administrator's, so the gate is
    // the predicate on its own. The one thing an Administrator still cannot
    // do is demote themselves, and that is refused by the server, which is
    // the only place it can be enforced against a direct API call.
    expect(USERS).toContain("{canManageAccounts && (");
    expect(USERS).not.toContain('user.role !== "Administrator" && canManageAccounts');
    // "Create account" must sit inside the <AdminOnly> component. It is
    // gated by the wrapper rather than by a `canManageAccounts &&`
    // expression, so this is a position check against the tags, matching how
    // the hero guard checks <WriteOnly>.
    // The card *title* also reads "Create account" and is deliberately
    // ungated - it is a label on an Administrator-only page, not an
    // affordance. The button is the last occurrence.
    const at = USERS.lastIndexOf("Create account");
    expect(at).toBeGreaterThan(-1);
    const opened = USERS.lastIndexOf("<AdminOnly>", at);
    const closed = USERS.lastIndexOf("</AdminOnly>", at);
    expect(opened).toBeGreaterThan(-1);
    expect(closed).toBeLessThan(opened);
  });

  it("gates every financial-record write behind canWrite", () => {
    expect(RECORD).toContain("const { canWrite, canDelete } = useRole()");
    for (const marker of [
      "record.is_editable && canWrite",
      'record.status === "posted" && canWrite',
      'record.status === "draft" && canWrite',
    ]) {
      expect(RECORD).toContain(marker);
    }
    // Upload is a write, so it is canWrite and not canDelete.
    expect(RECORD).toContain("{canWrite && (");
  });

  it("restricts the two DELETE calls to administrators", () => {
    // deleteLine and deleteAttachment both issue HTTP DELETE, and
    // DELETE_ROLES is ("Administrator",) - so canWrite would be too wide
    // here and an Assistant would get a 403 on a button they were offered.
    expect(RECORD).toContain("{canDelete && (");
    expect(ungatedBy(RECORD, "setDeleteLineTarget(line)", "canDelete")).toBe(0);
    expect(ungatedBy(RECORD, "setDeleteAttachmentId(attachment.id)", "canDelete")).toBe(0);
    // ...and they are NOT merely behind canWrite.
    const deleteLineAt = RECORD.indexOf("setDeleteLineTarget(line)");
    const gateBefore = RECORD.lastIndexOf("{canDelete && (", deleteLineAt);
    const writeBefore = RECORD.lastIndexOf("{canWrite && (", deleteLineAt);
    expect(gateBefore).toBeGreaterThan(writeBefore);
  });

  it("opens transfers to every role but keeps writes with Administrator and Assistant", () => {
    // Until v17.26 CanManageTransfers granted Director full write access and
    // this test asserted that, precisely so that narrowing it would fail and
    // flag the ungated UI. It was narrowed in v17.26 and it did fail, which
    // is why the gates below exist. The assertion is now the new rule:
    // Director reads, Administrator and Assistant write, Administrator alone
    // deletes.
    const perms = fs.readFileSync(
      path.join(REPO, "backend/apps/transfers/permissions.py"),
      "utf8",
    );
    expect(perms).toContain("class CanManageTransfers");
    const roleLine = (prefix: string) =>
      perms.split("\n").find((line) => line.trim().startsWith(prefix));

    const readLine = roleLine("READ_ROLES");
    const writeLine = roleLine("WRITE_ROLES");
    const deleteLine = roleLine("DELETE_ROLES");
    expect(readLine).toBeDefined();
    expect(writeLine).toBeDefined();
    expect(deleteLine).toBeDefined();

    for (const role of ["Administrator", "Director", "Assistant"]) {
      expect(readLine, "every role may read transfers").toContain(role);
    }
    expect(writeLine).toContain("Administrator");
    expect(writeLine).toContain("Assistant");
    expect(writeLine, "Director is read-only on transfers").not.toContain(
      "Director",
    );
    expect(deleteLine).toContain("Administrator");
    expect(deleteLine).not.toContain("Director");
    expect(deleteLine).not.toContain("Assistant");

    // Because Director can now reach the screen without being able to write,
    // the controls must be gated or Director would be offered buttons that
    // return 403.
    const page = fs.readFileSync(
      path.join(REPO, "frontend/src/app/(protected)/transfers/page.tsx"),
      "utf8",
    );
    expect(page).toContain('from "@/hooks/useRole"');
    expect(page).toContain("const { canWrite } = useRole()");
    // NOTE: ungatedBy() cannot be used here. Its rule is "nearest
    // `{canWrite && (` before the marker, then the first `)}` after it closes
    // the gate" - and these buttons carry interpolated attributes such as
    // `title={sourceText("Archive")}` between the gate and the handler. That
    // attribute's `)}` reads as the gate closing, so a correctly gated button
    // is reported as ungated. A proximity check is the honest test for this
    // shape: the gate must open within the same JSX element.
    const gatedNear = (marker: string) => {
      const at = page.indexOf(marker);
      expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
      return page.slice(Math.max(0, at - 500), at).includes("{canWrite && (");
    };
    for (const marker of [
      "setArchiveTarget(t.id)",
      "confirmMutation.mutate(t.id)",
      "revertMutation.mutate(t.id)",
      '<Link href="/transfers/new">',
      '<Link href={`/transfers/${t.id}/edit`}>',
    ]) {
      expect(gatedNear(marker), `${marker} is not behind canWrite`).toBe(true);
    }

    // Vacuity: the same check must FAIL for something genuinely ungated, or
    // it would pass on any file at all. Viewing is open to every role.
    const viewAt = page.indexOf("`/transfers/${t.id}`");
    expect(viewAt).toBeGreaterThan(-1);
    expect(
      page.slice(Math.max(0, viewAt - 500), viewAt).includes("{canWrite && ("),
      "the View link must stay open to Director",
    ).toBe(false);

    // Viewing stays open to everyone - gating the read would hide the screen
    // from the role that is supposed to be reading it.
    expect(page).toContain("`/transfers/${t.id}`");

    // ...and the sidebar has to let all three roles in.
    const nav = fs.readFileSync(
      path.join(REPO, "frontend/src/lib/navigation.ts"),
      "utf8",
    );
    const at = nav.indexOf('name: "Transfers"');
    expect(at).toBeGreaterThan(-1);
    const entry = nav.slice(at, at + 500);
    for (const role of ["Administrator", "Director", "Assistant"]) {
      expect(entry, `nav must admit ${role}`).toContain(role);
    }
  });
});
