"""Structural guard: no generate_reference() may reintroduce F-1/F-2 (Cycle
24, state/IMPLEMENTATION_PLAN.md Section 18).

WHY THIS EXISTS
---------------
Cycle 24 found twelve models generating references with
`Model.objects.filter(...).count() + 1`. This looks correct on a clean table
and is exactly what a new model would be copy-pasted from if a developer
copied an old (buggy) example instead of `Company.generate_reference`
(correct) or the shared `generate_sequential_reference` helper introduced in
the same cycle. `objects` is the active-only manager, but `reference` is
`unique=True` across *all* rows including archived ones, so a `count()`-based
or `objects`-scoped generator silently regresses the first time a row of that
type is archived, and the next create collides with a 500.

This test walks every concrete `ReferenceModel` subclass, reads the source of
its `generate_reference()`, and fails if that source calls `.count()` or
queries the `.objects` manager anywhere. New models inheriting
`ReferenceTrackedModel` are covered automatically from the moment they define
a `generate_reference`, without anyone remembering this history.

This mirrors the philosophy of `test_endpoint_protection_guard.py`: turn a
lesson learned once into a structural check instead of institutional memory.
"""

import inspect
import re

from django.apps import apps
from django.test import SimpleTestCase

from apps.common.models import ReferenceModel

# Models whose generate_reference is intentionally exempt from the
# sequential-counter shape entirely (e.g. UUID-based), so the .objects/.count()
# checks do not apply to them.
EXEMPT_MODELS = {
    "RefreshToken",  # apps/authentication/models.py: UUID-based, no counter.
}

COUNT_PATTERN = re.compile(r"\.count\(\)")
# Matches "<dot>objects" attribute access (e.g. "Model.objects",
# "self.objects"). Does NOT match "all_objects" because that name has an
# underscore, not a dot, immediately before "objects".
OBJECTS_MANAGER_PATTERN = re.compile(r"\.objects\b")


class ReferenceGenerationGuardTests(SimpleTestCase):
    def _concrete_reference_models(self):
        for model in apps.get_models():
            if model._meta.abstract:
                continue
            if not issubclass(model, ReferenceModel):
                continue
            if model.__name__ in EXEMPT_MODELS:
                continue
            yield model

    def _generate_reference_source(self, model):
        """Source of the model's OWN generate_reference, or None if it has none.

        `ReferenceModel` itself defines a `generate_reference` that only raises
        NotImplementedError. Walking the full MRO therefore always found *a*
        definition, so a model that forgot to override it looked compliant to
        this guard while 500-ing on its first insert at runtime. That is exactly
        how `transfers.CashTransfer` shipped unable to save a single row.
        Stopping the walk at `ReferenceModel` makes the missing-override case
        return None, which the caller asserts against.
        """
        for klass in model.__mro__:
            if klass is ReferenceModel:
                break
            if "generate_reference" in klass.__dict__:
                return inspect.getsource(klass.__dict__["generate_reference"])
        return None

    def test_no_reference_generator_uses_count_or_active_manager(self):
        models_checked = []
        violations = []

        for model in self._concrete_reference_models():
            source = self._generate_reference_source(model)
            self.assertIsNotNone(
                source,
                f"{model.__name__} has no generate_reference implementation "
                "anywhere in its MRO (would raise NotImplementedError at "
                "runtime).",
            )
            models_checked.append(model.__name__)

            if COUNT_PATTERN.search(source):
                violations.append(
                    f"{model.__name__}.generate_reference() calls .count() - "
                    "this regresses after any soft delete because `reference` "
                    "is unique across all rows including archived ones. Use "
                    "apps.common.models.generate_sequential_reference() "
                    "instead."
                )
            if OBJECTS_MANAGER_PATTERN.search(source):
                violations.append(
                    f"{model.__name__}.generate_reference() queries the "
                    "active-only `.objects` manager - it must query "
                    "`.all_objects` (directly or via "
                    "apps.common.models.generate_sequential_reference()) so "
                    "archived rows are still seen as taken references."
                )

        # Sanity: this guard is only meaningful if it actually walked a
        # non-trivial number of real models. An empty list would mean the
        # discovery logic silently broke.
        self.assertGreaterEqual(
            len(models_checked),
            15,
            f"Expected to check at least 15 ReferenceModel subclasses, only "
            f"found {len(models_checked)}: {models_checked}. The discovery "
            "logic in this guard may be broken.",
        )

        self.assertEqual(
            violations,
            [],
            "Found reference generators vulnerable to the Cycle 24 F-1/F-2 "
            "defect class:\n" + "\n".join(violations),
        )
