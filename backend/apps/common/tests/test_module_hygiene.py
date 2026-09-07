# apps/common/tests/test_module_hygiene.py
"""
Cross-app module hygiene guards.

WHY THIS FILE EXISTS
--------------------
``apps/authentication/tests/test_m1a_module_import_and_migration_safety.py``
already guards *one* app against two specific defects:

1. the same class being defined twice in one module, where Python silently keeps
   only the last definition, and
2. an app re-defining its own local ``ActiveManager``, shadowing the canonical
   one in ``apps.common.models``.

That guard was app-local, so the same defects were free to exist elsewhere - and
they did. Cycle 2 coverage measurement surfaced two of them:

* ``apps/personnel/managers.py`` defined ``PayrollPaymentManager`` **twice**. The
  second definition won and did not include the ``advances()`` helper, so that
  method silently did not exist despite being written in the file.
* ``apps/common/managers.py`` re-defined ``ActiveManager``, ``ArchivedManager``
  and ``ActiveQuerySet``, which already live in ``apps/common/models.py``. Nothing
  imported the duplicate module, so it was 0%-covered dead code that a future
  author could easily have imported by mistake, getting a second, divergent
  implementation of archive filtering.

Both are fixed. These tests generalise the existing guard to **every** app so the
defect class cannot silently return in a new module.

Like the original, these tests inspect source text rather than runtime
attributes. A reintroduced duplicate would still "work" at runtime - that is
precisely what makes it dangerous - so runtime identity checks cannot catch it.
"""

import ast
from pathlib import Path

from django.test import SimpleTestCase

APPS_DIR = Path(__file__).resolve().parent.parent.parent

# Modules where duplicate top-level definitions are most damaging and most
# likely: the service-layer files that make up the project's architecture.
GUARDED_MODULE_NAMES = (
    "managers.py",
    "models.py",
    "permissions.py",
    "selectors.py",
    "serializers.py",
    "services.py",
    "validators.py",
    "views.py",
)


def iter_guarded_modules():
    """Yield every guarded service-layer module across all apps."""
    for app_dir in sorted(p for p in APPS_DIR.iterdir() if p.is_dir()):
        if app_dir.name.startswith("__"):
            continue
        for module_name in GUARDED_MODULE_NAMES:
            module_path = app_dir / module_name
            if module_path.exists():
                yield module_path


def top_level_definition_names(module_path):
    """
    Return the list of top-level class and function names defined in a module,
    in source order, including repeats.

    Uses the AST rather than text matching so that names appearing in strings,
    comments or nested scopes are not miscounted.
    """
    tree = ast.parse(module_path.read_text(encoding="utf-8"))
    names = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            names.append(node.name)
    return names


class NoDuplicateTopLevelDefinitionsTests(SimpleTestCase):
    """No guarded module may define the same top-level name twice."""

    def test_no_guarded_module_defines_the_same_name_twice(self):
        offenders = []

        for module_path in iter_guarded_modules():
            names = top_level_definition_names(module_path)
            seen = set()
            duplicates = set()
            for name in names:
                if name in seen:
                    duplicates.add(name)
                seen.add(name)
            if duplicates:
                relative = module_path.relative_to(APPS_DIR.parent)
                for name in sorted(duplicates):
                    offenders.append(f"{relative}: {name}")

        self.assertEqual(
            offenders,
            [],
            "Duplicate top-level definitions found. Python keeps only the LAST "
            "definition, so the earlier one is dead code and any behaviour it "
            "alone provides silently disappears:\n  " + "\n  ".join(offenders),
        )

    def test_guard_actually_inspects_a_meaningful_number_of_modules(self):
        """
        Protects the guard itself. If the directory layout changes and the
        discovery helper silently finds nothing, the test above would pass
        vacuously and provide false assurance.
        """
        discovered = list(iter_guarded_modules())
        self.assertGreater(
            len(discovered),
            20,
            f"Expected to discover many service-layer modules, found "
            f"{len(discovered)}. The discovery helper is probably broken, which "
            f"would make the duplicate-definition guard vacuous.",
        )


class CanonicalArchiveManagerLocationTests(SimpleTestCase):
    """
    ``ActiveManager`` / ``ArchivedManager`` / ``ActiveQuerySet`` have exactly one
    home: ``apps/common/models.py``. Everything else must import them.
    """

    CANONICAL_CLASSES = ("ActiveManager", "ArchivedManager", "ActiveQuerySet")

    def test_canonical_classes_live_in_common_models(self):
        names = top_level_definition_names(APPS_DIR / "common" / "models.py")
        for class_name in self.CANONICAL_CLASSES:
            with self.subTest(class_name=class_name):
                self.assertEqual(
                    names.count(class_name),
                    1,
                    f"{class_name} must be defined exactly once in " f"apps/common/models.py.",
                )

    def test_no_other_module_redefines_the_canonical_classes(self):
        canonical = APPS_DIR / "common" / "models.py"
        offenders = []

        for module_path in iter_guarded_modules():
            if module_path == canonical:
                continue
            names = top_level_definition_names(module_path)
            for class_name in self.CANONICAL_CLASSES:
                if class_name in names:
                    relative = module_path.relative_to(APPS_DIR.parent)
                    offenders.append(f"{relative}: {class_name}")

        self.assertEqual(
            offenders,
            [],
            "These modules re-define archive manager classes that belong to "
            "apps.common.models. A local copy shadows the canonical one and can "
            "drift from it, producing two different definitions of what "
            "'archived' means:\n  " + "\n  ".join(offenders),
        )

    def test_common_app_has_no_separate_managers_module(self):
        """
        ``apps/common/managers.py`` was a dead duplicate of the classes in
        ``apps/common/models.py`` and was removed in cycle 2. Re-adding it would
        recreate the ambiguity about which module is authoritative.
        """
        self.assertFalse(
            (APPS_DIR / "common" / "managers.py").exists(),
            "apps/common/managers.py should not exist - the archive manager "
            "classes are defined in apps/common/models.py. If a managers module "
            "is genuinely needed, it must import from models.py rather than "
            "re-defining the classes.",
        )


class NoDuplicateMethodsWithinClassesTests(SimpleTestCase):
    """
    No class may define the same method twice.

    WHY THIS EXISTS (cycle 3)
    -------------------------
    The guards above check *top-level* definitions only. That was an incomplete
    guard, and cycle 3 found the gap the hard way:
    ``FailedLoginAttempt.is_currently_locked`` was defined **twice** inside the
    same class in ``apps/authentication/models.py``, and the class-level guard
    could not see it.

    Duplicate methods are the same hazard as duplicate classes - Python keeps
    only the last one - but they are harder to spot in review because a large
    model class can put the two definitions hundreds of lines apart.

    This matters most for security predicates. A duplicated ``is_currently_locked``
    is a method that decides whether an account lockout applies; two copies that
    later diverge would mean the lockout rule you read in review is not the rule
    that runs.
    """

    def test_no_class_defines_the_same_method_twice(self):
        offenders = []

        for module_path in iter_guarded_modules():
            tree = ast.parse(module_path.read_text(encoding="utf-8"))
            for node in tree.body:
                if not isinstance(node, ast.ClassDef):
                    continue
                method_names = [
                    child.name
                    for child in node.body
                    if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef)
                ]
                seen = set()
                duplicates = set()
                for name in method_names:
                    if name in seen:
                        duplicates.add(name)
                    seen.add(name)
                if duplicates:
                    relative = module_path.relative_to(APPS_DIR.parent)
                    for name in sorted(duplicates):
                        offenders.append(f"{relative}: {node.name}.{name}()")

        self.assertEqual(
            offenders,
            [],
            "Duplicate method definitions found. Python keeps only the LAST "
            "definition, so the earlier one never runs - and if the two ever "
            "diverge, the behaviour you read in review is not the behaviour that "
            "executes:\n  " + "\n  ".join(offenders),
        )


class NoDuplicateNestedClassesTests(SimpleTestCase):
    """
    No class may define the same nested class twice - most importantly ``Meta``.

    WHY THIS EXISTS (cycle 3)
    -------------------------
    The method-level guard above still could not see nested *classes*, and cycle 3
    found a case where that mattered a great deal:
    ``FailedLoginAttempt`` in ``apps/authentication/models.py`` defined
    ``class Meta`` **twice**.

    Two things followed from that, and the second is the reason this guard exists:

    1. The intended index on ``(email, ip_address)`` lived only in the shadowed
       Meta, so it was never created. A declared-but-absent index is invisible in
       review - the code reads as though the index exists.
    2. The shadowed Meta was itself **invalid**: it declared the same index name
       twice, which Django rejects (models.E012). The shadowing was the only
       reason the project booted. That makes it a trap for the obvious cleanup:
       deleting the surviving Meta would have turned a silent problem into a hard
       startup failure.

    A duplicate ``Meta`` can silently drop indexes, constraints, ordering,
    permissions and table names, so this is checked separately and explicitly.
    """

    def test_no_class_defines_the_same_nested_class_twice(self):
        offenders = []

        for module_path in iter_guarded_modules():
            tree = ast.parse(module_path.read_text(encoding="utf-8"))
            for node in tree.body:
                if not isinstance(node, ast.ClassDef):
                    continue
                nested_names = [
                    child.name for child in node.body if isinstance(child, ast.ClassDef)
                ]
                seen = set()
                duplicates = set()
                for name in nested_names:
                    if name in seen:
                        duplicates.add(name)
                    seen.add(name)
                if duplicates:
                    relative = module_path.relative_to(APPS_DIR.parent)
                    for name in sorted(duplicates):
                        offenders.append(f"{relative}: {node.name}.{name}")

        self.assertEqual(
            offenders,
            [],
            "Duplicate nested class definitions found. Python keeps only the LAST "
            "one, so indexes, constraints, ordering and other options declared in "
            "the earlier copy are silently dropped:\n  " + "\n  ".join(offenders),
        )

    def test_no_model_meta_declares_a_duplicate_index_name(self):
        """
        Django rejects duplicate index names (models.E012), but a shadowed Meta
        never reaches the system checks - which is how the invalid Meta described
        above survived. This asserts the property directly on the source so it is
        caught whether or not the Meta is the live one.
        """
        offenders = []

        for module_path in iter_guarded_modules():
            source = module_path.read_text(encoding="utf-8")
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef) or node.name != "Meta":
                    continue
                index_names = [
                    keyword.value.value
                    for sub in ast.walk(node)
                    if isinstance(sub, ast.Call)
                    for keyword in sub.keywords
                    if keyword.arg == "name"
                    and isinstance(keyword.value, ast.Constant)
                    and isinstance(keyword.value.value, str)
                ]
                seen = set()
                for name in index_names:
                    if name in seen:
                        relative = module_path.relative_to(APPS_DIR.parent)
                        offenders.append(f"{relative}: duplicate name '{name}'")
                    seen.add(name)

        self.assertEqual(
            offenders,
            [],
            "A model Meta declares the same index/constraint name more than "
            "once. Django rejects this (models.E012), but a shadowed Meta never "
            "reaches the system checks:\n  " + "\n  ".join(offenders),
        )
