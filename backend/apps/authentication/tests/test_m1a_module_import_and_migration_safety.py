# apps/authentication/tests/test_m1a_module_import_and_migration_safety.py
"""
M1-A Task 3 (Engineering Log / Architect spec: "Canonical Cookie
Authentication and Runtime Unification", Entry M1A-3): regression tests
guarding the backend-duplication cleanup performed in this task.

These tests exist to catch two classes of regression that would NOT be
caught by the behavioral test suites in `test_m1a_cookie_lifecycle.py`
or `test_schema_and_behavior.py`:

1. Module-import regressions: every submodule of `apps.authentication`
   must import cleanly with no `ImportError`/`SyntaxError`/import-time
   `AttributeError`. This is the class of failure that duplicate class
   definitions, dangling imports of removed names, or leftover
   references to deleted code would produce.
2. Migration-safety regressions: removing dead code from `services.py`,
   `serializers.py`, and `managers.py` must not have touched any Django
   model field, so `makemigrations --check --dry-run` must still report
   no changes. Model state (the legacy `RefreshToken`/`UserSession`/
   `FailedLoginAttempt` tables) must remain byte-for-byte compatible
   with the existing migration history - this is the automated proof
   that the M1-A backend cleanup was non-destructive to the database
   schema.
"""
import importlib
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

AUTHENTICATION_SUBMODULES = [
    "apps.authentication",
    "apps.authentication.apps",
    "apps.authentication.models",
    "apps.authentication.managers",
    "apps.authentication.serializers",
    "apps.authentication.services",
    "apps.authentication.selectors",
    "apps.authentication.validators",
    "apps.authentication.views",
    "apps.authentication.authentication",
    "apps.authentication.cookies",
    "apps.authentication.schema",
    "apps.authentication.urls",
    "apps.authentication.admin",
]


class ModuleImportRegressionTests(SimpleTestCase):
    """Every `apps.authentication` submodule must import without error."""

    def test_every_authentication_submodule_imports_cleanly(self):
        failures = []
        for module_name in AUTHENTICATION_SUBMODULES:
            try:
                importlib.import_module(module_name)
            except Exception as exc:  # noqa: BLE001 - we want to report ANY import failure
                failures.append(f"{module_name}: {exc!r}")
        self.assertEqual(
            failures,
            [],
            f"The following apps.authentication submodules failed to import: {failures}",
        )

    def test_services_module_no_longer_exposes_removed_jwt_authority_methods(self):
        """
        M1A-3 removed `AuthenticationService.login()`, `_generate_tokens()`,
        `refresh_access_token()`, `logout()`, and `logout_all_sessions()`
        because they duplicated/conflicted with the SimpleJWT-only
        authority in `views.py`. This test pins that removal so a future
        change cannot silently reintroduce a second JWT authority into
        this class.
        """
        from apps.authentication.services import AuthenticationService

        removed_method_names = [
            "login",
            "_generate_tokens",
            "refresh_access_token",
            "logout",
            "logout_all_sessions",
        ]
        still_present = [
            name for name in removed_method_names if hasattr(AuthenticationService, name)
        ]
        self.assertEqual(
            still_present,
            [],
            f"AuthenticationService unexpectedly still defines removed JWT-authority "
            f"method(s): {still_present}",
        )

    def test_managers_module_has_exactly_one_definition_of_each_manager_class(self):
        """
        Pins the M1A-3 deduplication of `UserSessionQuerySet`/
        `UserSessionManager` (previously defined twice in the same
        module) and the removal of the unused, shadowing local
        `ActiveManager` class. Since Python only keeps the last class
        statement bound to a name, this test checks source text directly
        rather than runtime identity, so a reintroduced duplicate would
        be caught even though it would still "work" at runtime.
        """
        managers_path = Path(__file__).resolve().parent.parent / "managers.py"
        source = managers_path.read_text(encoding="utf-8")

        for class_name in (
            "UserSessionQuerySet",
            "UserSessionManager",
            "RefreshTokenQuerySet",
            "RefreshTokenManager",
            "FailedLoginAttemptQuerySet",
            "FailedLoginAttemptManager",
        ):
            occurrences = source.count(f"class {class_name}(")
            self.assertEqual(
                occurrences,
                1,
                f"Expected exactly one definition of {class_name} in managers.py, "
                f"found {occurrences}.",
            )

        self.assertNotIn(
            "class ActiveManager(",
            source,
            "managers.py should not define its own ActiveManager - that class "
            "belongs to apps.common.models and was an unused, shadowing duplicate.",
        )

    def test_serializers_module_has_exactly_one_definition_of_each_serializer_class(self):
        """
        Pins the M1A-3 deduplication of `LoginSerializer`/
        `LoginResponseSerializer` (previously each defined twice in the
        same module).
        """
        serializers_path = Path(__file__).resolve().parent.parent / "serializers.py"
        source = serializers_path.read_text(encoding="utf-8")

        for class_name in ("LoginSerializer", "LoginResponseSerializer"):
            occurrences = source.count(f"class {class_name}(")
            self.assertEqual(
                occurrences,
                1,
                f"Expected exactly one definition of {class_name} in serializers.py, "
                f"found {occurrences}.",
            )


class MigrationSafetyRegressionTests(SimpleTestCase):
    """
    Guards against the backend-duplication cleanup having silently
    altered any Django model field. `makemigrations --check --dry-run`
    exits non-zero and prints "No changes detected" only when the
    current model state is fully represented by existing migration
    files - this is the authoritative, tool-verified proof of
    migration safety (never asserted from memory).
    """

    def test_makemigrations_check_dry_run_detects_no_changes(self):
        backend_root = Path(__file__).resolve().parents[3]
        manage_py = backend_root / "manage.py"

        result = subprocess.run(
            [sys.executable, str(manage_py), "makemigrations", "--check", "--dry-run"],
            cwd=str(backend_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

        combined_output = (result.stdout or "") + (result.stderr or "")
        self.assertEqual(
            result.returncode,
            0,
            "makemigrations --check --dry-run reported pending model changes "
            f"after the M1-A backend cleanup (exit code {result.returncode}):\n"
            f"{combined_output}",
        )
