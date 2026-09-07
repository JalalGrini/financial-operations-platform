"""Database portability guards: SQLite (tests) vs PostgreSQL (production).

WHY THIS FILE EXISTS
--------------------
The platform runs on PostgreSQL everywhere by default, including the test
suite. SQLite is reachable only via an explicit USE_SQLITE_FOR_TESTS=True
opt-in, used by offline build environments where no PostgreSQL daemon can be
installed.

SQLite is permissive exactly where PostgreSQL is strict, so a fully green
SQLite run can still hide defects that only surface on PostgreSQL. These
guards exist so that any run on either backend still catches the divergences
that matter.

Every test here is database-agnostic on purpose: it must pass on BOTH
backends. Each one encodes a specific divergence that could break the
SQLite -> PostgreSQL migration, so a regression is caught mechanically on
SQLite long before the switch.

These are guards, not proof. They cannot substitute for actually running the
suite against PostgreSQL; see state/POSTGRES_MIGRATION_RUNBOOK.md.
"""

from __future__ import annotations

import ast
from pathlib import Path

from django.apps import apps
from django.db import models
from django.test import SimpleTestCase

BACKEND_DIR = Path(__file__).resolve().parents[3]
APPS_DIR = BACKEND_DIR / "apps"

# PostgreSQL truncates identifiers at NAMEDATALEN - 1 = 63 bytes. SQLite has no
# such limit, so an over-long index name is invisible until the cutover, where
# it can silently collide with another truncated name.
POSTGRES_MAX_IDENTIFIER_LENGTH = 63


def project_models():
    """Yield production models defined by this project.

    Excludes Django/third-party models, and excludes concrete models declared
    inside test modules to exercise abstract bases (e.g.
    common.ConcreteArchiveModel). Those exist only while the suite runs, are
    never queried by production code, and are never paginated.
    """
    for model in apps.get_models():
        app_path = Path(model._meta.app_config.path).resolve()
        if APPS_DIR not in app_path.parents and app_path != APPS_DIR:
            continue
        if ".tests" in model.__module__ or model.__module__.startswith("test"):
            continue
        yield model


def iter_source_modules():
    """Yield production source modules (excludes tests and migrations)."""
    for path in sorted(APPS_DIR.rglob("*.py")):
        parts = path.parts
        if "migrations" in parts or "tests" in parts:
            continue
        if path.name.startswith("test_"):
            continue
        yield path


def iter_test_modules():
    """Yield test modules, excluding this guard's own source.

    This file necessarily contains the very strings it searches for, so it
    must exclude itself or it reports itself as an offender.
    """
    this_file = Path(__file__).resolve()
    for path in sorted(APPS_DIR.rglob("test_*.py")):
        if path.resolve() != this_file:
            yield path


def _mentions_atomic(node: ast.AST) -> bool:
    """True if the expression references `atomic` (transaction.atomic/atomic())."""
    for child in ast.walk(node):
        if isinstance(child, ast.Attribute) and child.attr == "atomic":
            return True
        if isinstance(child, ast.Name) and child.id == "atomic":
            return True
    return False


def _atomic_line_ranges(tree: ast.AST) -> list[tuple[int, int]]:
    """Line ranges covered by a `with transaction.atomic()` or @transaction.atomic."""
    ranges: list[tuple[int, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.With | ast.AsyncWith):
            if any(_mentions_atomic(item.context_expr) for item in node.items):
                ranges.append((node.lineno, node.end_lineno or node.lineno))
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            if any(_mentions_atomic(dec) for dec in node.decorator_list):
                ranges.append((node.lineno, node.end_lineno or node.lineno))
    return ranges


class PostgresIdentifierLimitTests(SimpleTestCase):
    """PostgreSQL rejects/truncates identifiers over 63 bytes; SQLite does not."""

    def test_no_index_name_exceeds_the_postgres_identifier_limit(self):
        offenders = [
            f"{model._meta.label}: {index.name} ({len(index.name)} chars)"
            for model in project_models()
            for index in model._meta.indexes
            if index.name and len(index.name) > POSTGRES_MAX_IDENTIFIER_LENGTH
        ]
        self.assertEqual(
            offenders,
            [],
            "PostgreSQL truncates identifiers at 63 bytes, which can cause a name "
            "collision at migrate time. SQLite accepts these silently.",
        )

    def test_no_constraint_name_exceeds_the_postgres_identifier_limit(self):
        offenders = [
            f"{model._meta.label}: {constraint.name} ({len(constraint.name)} chars)"
            for model in project_models()
            for constraint in model._meta.constraints
            if len(constraint.name) > POSTGRES_MAX_IDENTIFIER_LENGTH
        ]
        self.assertEqual(offenders, [])

    def test_no_table_name_exceeds_the_postgres_identifier_limit(self):
        offenders = [
            f"{model._meta.label}: {model._meta.db_table}"
            for model in project_models()
            if len(model._meta.db_table) > POSTGRES_MAX_IDENTIFIER_LENGTH
        ]
        self.assertEqual(offenders, [])


class MoneyIsNeverStoredAsFloatTests(SimpleTestCase):
    """Float money is wrong on every backend, but rounding differs per backend."""

    def test_no_model_declares_a_float_field(self):
        offenders = [
            f"{model._meta.label}.{field.name}"
            for model in project_models()
            for field in model._meta.get_fields()
            if isinstance(field, models.FloatField)
        ]
        self.assertEqual(
            offenders,
            [],
            "Money must use DecimalField. SQLite and PostgreSQL round floats "
            "differently, so float columns produce backend-dependent totals.",
        )


class DeterministicOrderingTests(SimpleTestCase):
    """Without ORDER BY, PostgreSQL row order is arbitrary; SQLite looks stable.

    This is the classic 'passes locally, paginates wrongly in production' bug:
    page 2 can repeat or omit rows when the queryset has no total ordering.
    """

    def test_every_project_model_declares_meta_ordering(self):
        offenders = [model._meta.label for model in project_models() if not model._meta.ordering]
        self.assertEqual(
            offenders,
            [],
            "A model without Meta.ordering returns rows in arbitrary order on "
            "PostgreSQL, which breaks pagination stability.",
        )


class SelectForUpdateSafetyTests(SimpleTestCase):
    """select_for_update() is a silent no-op on SQLite and real locking on PG.

    On PostgreSQL, calling it outside a transaction raises
    TransactionManagementError at runtime. On SQLite the same code passes,
    so this defect is undetectable without a static guard.
    """

    def test_every_select_for_update_call_is_inside_a_transaction(self):
        offenders: list[str] = []
        for path in iter_source_modules():
            tree = ast.parse(path.read_text(encoding="utf-8"))
            atomic_ranges = _atomic_line_ranges(tree)
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "select_for_update"
                ):
                    inside = any(low <= node.lineno <= high for low, high in atomic_ranges)
                    if not inside:
                        offenders.append(f"{path.relative_to(APPS_DIR.parent)}:{node.lineno}")
        self.assertEqual(
            offenders,
            [],
            "select_for_update() outside transaction.atomic() raises "
            "TransactionManagementError on PostgreSQL but is ignored by SQLite.",
        )


class NoVendorBranchingTests(SimpleTestCase):
    """Production behaviour must not depend on which database is configured."""

    def test_production_code_does_not_branch_on_the_database_vendor(self):
        offenders = [
            f"{path.relative_to(APPS_DIR.parent)}:{number}"
            for path in iter_source_modules()
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
            if "connection.vendor" in line
        ]
        self.assertEqual(
            offenders,
            [],
            "Vendor branching means production runs a code path the SQLite test "
            "suite never executes.",
        )


class SqliteSkippedTestsAreTrackedTests(SimpleTestCase):
    """Tests skipped on SQLite are unverified code paths until the cutover.

    Three tests are skipped today because JSONField __contains is unsupported
    on SQLite. They execute for the first time on PostgreSQL. This guard stops
    that list from growing silently.
    """

    EXPECTED_SQLITE_SKIPS = 3

    def test_the_set_of_sqlite_only_skips_has_not_grown(self):
        skips = [
            f"{path.relative_to(APPS_DIR.parent)}:{number}"
            for path in iter_test_modules()
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
            if "SKIP_JSON_CONTAINS" in line and "skipIf" in line
        ]
        self.assertEqual(
            len(skips),
            self.EXPECTED_SQLITE_SKIPS,
            "The number of SQLite-skipped tests changed. Every skip is a code "
            f"path first executed on PostgreSQL. Found: {skips}",
        )
