"""Structural guard: no function may perform 2+ database writes without a
shared transaction (Cycle 25, state/IMPLEMENTATION_PLAN.md Section 19).

WHY THIS EXISTS
---------------
Cycle 25 found nine functions across apps/personnel, apps/parties, and
apps/common that performed a sequence of two dependent writes (for example:
demote every other 'current' row, then save the new current row) with no
transaction spanning them. When the second write failed for any reason, the
first was already committed, silently corrupting an invariant such as "an
employment has exactly one current salary" or "a person has at most one
active CNSS declaration". Three of these were reproduced empirically with
fault-injection probes under TransactionTestCase (see Section 19.1-19.3).

This test parses every non-test, non-migration module under apps/ with the
stdlib ast module (not regex/grep - multi-line code shapes defeat single-line
greps, a lesson from Cycle 24) and fails if any function performs two or more
ORM write calls (save, create, delete, update, bulk_create, bulk_update,
get_or_create, update_or_create, or the m2m add/remove/set/clear methods)
outside of a transaction.atomic() block or an @transaction.atomic decorator.

This mirrors the philosophy of test_reference_generation_guard.py (Cycle 24)
and test_endpoint_protection_guard.py: convert a lesson learned once into a
structural check instead of institutional memory, so it also covers code not
yet written.
"""

import ast
from pathlib import Path

from django.test import SimpleTestCase

APPS_DIR = Path(__file__).resolve().parent.parent.parent

EXCLUDED_DIR_NAMES = {"__pycache__", "migrations", "tests"}

WRITE_METHODS = {
    "save",
    "create",
    "delete",
    "update",
    "bulk_create",
    "bulk_update",
    "get_or_create",
    "update_or_create",
    "add",
    "remove",
    "set",
    "clear",
}

# Receivers whose same-named method is not a database write in this codebase
# (e.g. dict.update, set.update). Checked against the leftmost name in the
# dotted call chain.
BENIGN_RECEIVER_ROOTS = {
    "serializer",
    "form",
    "cache",
    "session",
    "logger",
    "default_storage",
}

# (relative_path, function_name): reason. Each entry here was read and
# deliberately judged NOT to need a transaction in the Cycle 25 architect
# pass (state/IMPLEMENTATION_PLAN.md Section 19.5). Anything not on this list
# that trips the guard is a new, unreviewed finding and should be fixed, not
# added here.
ALLOWLIST = {
    (
        "common/messaging.py",
        "send_ticket_reply",
    ): "False positive: the two client.messages.create() calls are Twilio REST "
    "API calls, not Django ORM writes. They are also on mutually-exclusive "
    "branches (SMS returns early; WhatsApp is the else path), so at most one "
    "ever executes per invocation. No shared database invariant exists across "
    "them and transaction.atomic would have no effect on an external HTTP call.",
    (
        "companies/management/commands/seed_companies.py",
        "handle",
    ): "Idempotent get_or_create seed command, not a runtime request path.",
    (
        "configuration/views.py",
        "_build_category_names_map",
    ): "False positive: the flagged calls are set.update(...), not ORM writes.",
    (
        "extensibility/services.py",
        "_apply_template",
    ): "Two saves on independent rows with no invariant spanning them; a "
    "partial apply is safely recoverable by re-running.",
    (
        "extensibility/services.py",
        "set_custom_fields",
    ): "False positive: merged.update(...) is dict.update, not an ORM write.",
}


def _receiver_dotted_name(node):
    """Best-effort dotted name of a call's receiver expression."""
    parts = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


class _WriteCallCollector(ast.NodeVisitor):
    def __init__(self):
        self.writes = []

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute) and node.func.attr in WRITE_METHODS:
            dotted = _receiver_dotted_name(node.func)
            root = dotted.split(".")[0] if dotted else ""
            if root not in BENIGN_RECEIVER_ROOTS and "serializer" not in dotted:
                self.writes.append((node.lineno, dotted or node.func.attr))
        self.generic_visit(node)


def _is_atomic_with(node):
    """Is this a `with transaction.atomic():` (or `with atomic():`) statement?"""
    if not isinstance(node, (ast.With, ast.AsyncWith)):
        return False
    for item in node.items:
        ctx = item.context_expr
        if isinstance(ctx, ast.Call):
            ctx = ctx.func
        name = _receiver_dotted_name(ctx) if isinstance(ctx, (ast.Attribute, ast.Name)) else ""
        if name == "atomic" or name.endswith(".atomic"):
            return True
    return False


def _has_atomic_decorator(fn_node):
    for decorator in fn_node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = (
            _receiver_dotted_name(target) if isinstance(target, (ast.Attribute, ast.Name)) else ""
        )
        if "atomic" in name:
            return True
    return False


def _unprotected_writes(fn_node):
    """Writes in fn_node's own body that are not inside an atomic block,
    given the whole function is not itself atomic-decorated."""
    if _has_atomic_decorator(fn_node):
        return []

    lines_inside_atomic_blocks = set()
    for node in ast.walk(fn_node):
        if _is_atomic_with(node):
            for sub in ast.walk(node):
                if hasattr(sub, "lineno"):
                    lines_inside_atomic_blocks.add(sub.lineno)

    collector = _WriteCallCollector()
    for stmt in fn_node.body:
        collector.visit(stmt)
    return [(ln, expr) for ln, expr in collector.writes if ln not in lines_inside_atomic_blocks]


def _iter_candidate_files():
    for path in sorted(APPS_DIR.rglob("*.py")):
        if any(part in EXCLUDED_DIR_NAMES for part in path.parts):
            continue
        yield path


class WriteAtomicityGuardTests(SimpleTestCase):
    def test_no_function_has_two_or_more_unprotected_writes(self):
        violations = []
        files_scanned = 0

        for path in _iter_candidate_files():
            files_scanned += 1
            relative_path = path.relative_to(APPS_DIR).as_posix()
            source = path.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source, filename=str(path))
            except SyntaxError as exc:
                self.fail(f"{relative_path} failed to parse: {exc}")
                continue

            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                unprotected = _unprotected_writes(node)
                if len(unprotected) < 2:
                    continue
                key = (relative_path, node.name)
                if key in ALLOWLIST:
                    continue
                violations.append(
                    f"apps/{relative_path}:{node.lineno} {node.name}() has "
                    f"{len(unprotected)} database writes not wrapped in "
                    f"transaction.atomic: " + ", ".join(f"L{ln} {expr}" for ln, expr in unprotected)
                )

        # Sanity: this guard is only meaningful if it actually walked a
        # non-trivial number of real files.
        self.assertGreaterEqual(
            files_scanned,
            50,
            f"Expected to scan at least 50 files under apps/, only scanned "
            f"{files_scanned}. The discovery logic in this guard may be broken.",
        )

        self.assertEqual(
            violations,
            [],
            "Found functions with multiple database writes not protected by "
            "a shared transaction (Cycle 25 defect class, "
            "state/IMPLEMENTATION_PLAN.md Section 19):\n" + "\n".join(violations),
        )

    def test_allowlist_entries_are_still_real_and_still_findable(self):
        """If an allowlisted function is renamed, moved, or its writes become
        newly protected, the entry should be removed rather than silently
        stop matching anything - otherwise the allowlist rots and eventually
        hides an unrelated new finding at the same location.
        """
        found_keys = set()
        for path in _iter_candidate_files():
            relative_path = path.relative_to(APPS_DIR).as_posix()
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if len(_unprotected_writes(node)) >= 2:
                        found_keys.add((relative_path, node.name))

        stale = set(ALLOWLIST.keys()) - found_keys
        self.assertEqual(
            stale,
            set(),
            f"These ALLOWLIST entries no longer match any 2+ unprotected-write "
            f"function and should be removed: {sorted(stale)}",
        )
