# apps/common/tests/test_soft_delete_guard.py
"""Structural guard: every ModelViewSet archives instead of destroying.

WHY THIS EXISTS
----------------
Bug C-1 (state/IMPLEMENTATION_PLAN.md Section 11) existed because nothing
structurally prevented a ModelViewSet from inheriting DRF's default
`destroy()`, which issues a real SQL DELETE. Cycle 17 fixed the 20 known
instances by hand, mirroring exactly the gap `test_endpoint_protection_guard.
py` closed for permission classes in Cycle 9: a per-endpoint test only ever
covers the endpoints someone remembered to write one for. This guard walks
the real URL resolver, exactly like that file, and asserts every registered
ModelViewSet either mixes in `SoftDeleteViewSetMixin` or defines its own
`destroy()` (and is named in `EXEMPT_VIEWSETS` with a written reason).

It also tracks a second, narrower gap for honesty (decision C-3b, closed by
decision D-0 in Cycle 18): a ViewSet whose `destroy()` now archives but which
has no `archive`/`restore` actions leaves that archived row unreachable
through the API (only admin/shell can bring it back). That gap used to be
enumerated in `MISSING_ARCHIVE_ACTIONS` as a committed Cycle 18 backlog item
(state/IMPLEMENTATION_PLAN.md Section 5, Section 11.6, and Section 12.4/12.6);
Cycle 18 closed it by adding `archive`/`restore` actions to every ViewSet in
that set, so `MISSING_ARCHIVE_ACTIONS` is now intentionally empty. This guard
still fails if the set drifts in either direction, so a future ViewSet cannot
silently reintroduce this gap without the drift being caught here.
"""

import inspect

from django.test import SimpleTestCase
from django.urls import get_resolver
from django.urls.resolvers import URLPattern, URLResolver
from rest_framework import viewsets

from apps.common.mixins import SoftDeleteViewSetMixin

# ModelViewSets that genuinely have no destroy path to protect: either no
# DELETE method is routed to them at all, or they are not a ModelViewSet in
# the first place.
EXEMPT_VIEWSETS = {
    "ReconciliationViewSet": (
        "http_method_names = ['get', 'post', 'head', 'options'] excludes "
        "delete entirely - a signed-off reconciliation period is evidence "
        "and cannot be deleted through this API at all."
    ),
}
# Note: CompanySettingsViewSet (viewsets.GenericViewSet, not ModelViewSet -
# only retrieve/update/partial_update are mixed in, no delete route exists)
# and TransferViewSet (a plain viewsets.ViewSet, not a ModelViewSet at all)
# are not ModelViewSets, so the resolver walk below never surfaces them and
# they do not belong in EXEMPT_VIEWSETS - being a non-ModelViewSet with no
# delete route is a different, stronger guarantee than "exempted with a
# reason", and listing them here would only trip the stale-entry check.

# ModelViewSets with SoftDeleteViewSetMixin (so destroy() archives, not
# destroys) but with no archive/restore actions, so an archived row would
# not be reachable again through the API. Decision D-0 (Cycle 18) closed
# every previously-tracked instance of this gap by adding archive/restore
# actions to each one - see the module docstring. Enumerated exactly, not
# "at least these", so the set is asserted for equality below: this stays
# empty unless a new bare ModelViewSet is introduced.
MISSING_ARCHIVE_ACTIONS = set()

# ModelViewSets over money-holding, ledger-like models: once a row moves
# past DRAFT (posted, reconciled, or otherwise turned into evidence other
# rows depend on), both archiving and purging it can silently corrupt a
# balance or erase an audit trail - bugs E-1, E-2, E-3 (state/
# IMPLEMENTATION_PLAN.md Section 13.2-13.4), which were each a missing
# status guard on one specific ViewSet, not a structural property anything
# would have caught on its own. Every ViewSet in this set must define its
# own `get_archive_block_reason` (not just inherit the mixin's default,
# which always returns None and blocks nothing), so that a new ViewSet over
# a similar money-holding model cannot reintroduce this class of bug purely
# by being forgotten. Enumerated exactly (asserted for equality below), so
# this list itself must be updated - not silently satisfied - if a future
# ViewSet belongs here.
MONEY_HOLDING_VIEWSETS_REQUIRING_ARCHIVE_BLOCK = {
    "TransactionViewSet",
    "FinancialRecordViewSet",
    "MonthlyPayrollRecordViewSet",
    "PayrollAdjustmentViewSet",
    "PayrollPaymentViewSet",
    # Cycle 21 (Reports Engine, decision R-6): an Approved/Current
    # Official/Outdated report is a historical fact and must never be
    # archived or purged through the generic API - defined from the
    # first commit rather than retrofitted, per the R-6 decision.
    "GeneratedReportViewSet",
}

# ModelViewSets over the same money-holding models, but for the *update*
# path rather than archive/purge - bugs G-1/G-1b/G-2/G-3/G-3b (state/
# IMPLEMENTATION_PLAN.md Section 14). TransactionViewSet and
# FinancialRecordViewSet are deliberately NOT in this set: both already
# override `update()` themselves to route through their own service layer
# (`update_transaction`/`update_record`), so `SoftDeleteViewSetMixin.
# update()` never runs for them - a ViewSet's own `update()` always wins in
# MRO, exactly as documented for `destroy()`. Only the three personnel
# ViewSets that rely on the mixin's generic `update()` need to opt in with
# their own `get_update_block_reason`. Enumerated exactly (asserted for
# equality below).
MONEY_HOLDING_VIEWSETS_REQUIRING_UPDATE_BLOCK = {
    "MonthlyPayrollRecordViewSet",
    "PayrollAdjustmentViewSet",
    "PayrollPaymentViewSet",
    # Cycle 21 (Reports Engine, decision R-6): reports are only ever
    # changed through generate/regenerate/approve; the generic
    # update/partial_update path is closed from the first commit.
    "GeneratedReportViewSet",
}
# Membership test below checks only for a `restore` action, not `archive`.
# What makes an archived row a roach motel (C-3b) is the absence of any way
# back, i.e. no `restore` action; a bare DELETE already archives via
# SoftDeleteViewSetMixin.destroy() on every affected ViewSet, so a distinct
# `archive` POST action is a convenience for archiving without a body, not a
# reachability requirement. AccountViewSet and TransactionViewSet each ship
# only `restore` (no `archive` action) and are correctly absent from this
# set for exactly that reason - do not "fix" this by requiring `archive` too.


def iter_viewset_classes(patterns, prefix=""):
    """Yield every DRF view class in the URL tree, mirroring the traversal in
    test_endpoint_protection_guard.py rather than inventing a new one."""
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from iter_viewset_classes(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            view_class = getattr(entry.callback, "cls", None)
            if view_class is not None and inspect.isclass(view_class):
                yield view_class


def collected_model_viewsets():
    seen = {}
    for view_class in iter_viewset_classes(get_resolver().url_patterns):
        if issubclass(view_class, viewsets.ModelViewSet):
            seen.setdefault(view_class.__name__, view_class)
    return seen


class EveryModelViewSetArchivesInsteadOfDeletingTests(SimpleTestCase):
    """Walks the real router. No hand-maintained list of ModelViewSets."""

    def test_the_resolver_walk_actually_finds_viewsets(self):
        """Protects the guard from silently passing by finding nothing, the
        same failure mode test_endpoint_protection_guard.py protects
        against for its own walk."""
        found = collected_model_viewsets()
        self.assertGreater(
            len(found),
            15,
            "The URL walk found suspiciously few ModelViewSets; the "
            "traversal is broken and this guard is not checking anything.",
        )

    def test_every_model_viewset_archives_or_is_documented_exempt(self):
        unprotected = []
        for name, view_class in sorted(collected_model_viewsets().items()):
            if name in EXEMPT_VIEWSETS:
                continue
            has_mixin = issubclass(view_class, SoftDeleteViewSetMixin)
            has_own_destroy = "destroy" in view_class.__dict__
            if not has_mixin and not has_own_destroy:
                unprotected.append(name)

        self.assertEqual(
            unprotected,
            [],
            "These ModelViewSets have neither SoftDeleteViewSetMixin nor "
            "their own destroy() override, so they inherit DRF's default "
            "destroy(), which issues a real SQL DELETE (bug C-1). Either mix "
            "in SoftDeleteViewSetMixin, or add the view to EXEMPT_VIEWSETS "
            "with a written reason:\n  " + "\n  ".join(unprotected),
        )

    def test_exempt_list_has_no_stale_entries(self):
        """An exemption for a view that no longer exists is a trap: it reads
        like a considered decision about a live endpoint when it is dead
        text, and would silently exempt any future view reusing the name."""
        live = set(collected_model_viewsets())
        stale = sorted(name for name in EXEMPT_VIEWSETS if name not in live)
        self.assertEqual(
            stale,
            [],
            f"EXEMPT_VIEWSETS names ModelViewSets that no longer exist: "
            f"{stale}. Remove them so the list keeps meaning what it says.",
        )

    def test_missing_archive_actions_matches_the_committed_backlog_exactly(self):
        """Fails if the tracked gap grows OR shrinks without this file being
        updated - either direction is a signal someone should look at this
        list rather than silently drift from what was decided."""
        actual_missing = set()
        for name, view_class in collected_model_viewsets().items():
            if name in EXEMPT_VIEWSETS:
                continue
            if not issubclass(view_class, SoftDeleteViewSetMixin):
                continue
            if not hasattr(view_class, "restore"):
                actual_missing.add(name)

        self.assertEqual(
            actual_missing,
            MISSING_ARCHIVE_ACTIONS,
            "The set of ModelViewSets with SoftDeleteViewSetMixin but no "
            "archive/restore actions has drifted from the tracked Cycle 18 "
            f"backlog. Expected {sorted(MISSING_ARCHIVE_ACTIONS)}, found "
            f"{sorted(actual_missing)}. If something in the expected set now "
            "has archive/restore actions, remove it here and update state/"
            "IMPLEMENTATION_PLAN.md Section 5/11.6 to say it was fixed. If "
            "something new appeared, either add archive/restore actions for "
            "it or add it here as a deliberate, documented decision.",
        )

    def test_missing_archive_actions_list_has_no_stale_entries(self):
        live = set(collected_model_viewsets())
        stale = sorted(name for name in MISSING_ARCHIVE_ACTIONS if name not in live)
        self.assertEqual(
            stale,
            [],
            f"MISSING_ARCHIVE_ACTIONS names ModelViewSets that no longer " f"exist: {stale}.",
        )

    def test_every_money_holding_viewset_defines_its_own_archive_block_reason(self):
        """Bugs E-1/E-2/E-3 (Cycle 19) were each one money-holding ViewSet
        with no status guard at all, not a structural gap - this test makes
        the presence of a guard structural for the known set, and forces a
        deliberate decision (update this set, and IMPLEMENTATION_PLAN.md
        Section 13) the next time a similar ViewSet is added."""
        live = collected_model_viewsets()
        missing = []
        for name in sorted(MONEY_HOLDING_VIEWSETS_REQUIRING_ARCHIVE_BLOCK):
            view_class = live.get(name)
            if view_class is None:
                missing.append(f"{name} (not found by the resolver walk at all)")
                continue
            if "get_archive_block_reason" not in view_class.__dict__:
                missing.append(name)

        self.assertEqual(
            missing,
            [],
            "These money-holding ViewSets do not define their own "
            "get_archive_block_reason, so they silently inherit the mixin's "
            "default (which blocks nothing) - the exact shape of bugs "
            "E-1/E-2/E-3:\n  " + "\n  ".join(missing),
        )

    def test_money_holding_viewsets_list_has_no_stale_entries(self):
        live = set(collected_model_viewsets())
        stale = sorted(
            name for name in MONEY_HOLDING_VIEWSETS_REQUIRING_ARCHIVE_BLOCK if name not in live
        )
        self.assertEqual(
            stale,
            [],
            "MONEY_HOLDING_VIEWSETS_REQUIRING_ARCHIVE_BLOCK names "
            f"ModelViewSets that no longer exist: {stale}.",
        )

    def test_every_money_holding_viewset_defines_its_own_update_block_reason(self):
        """Bugs G-1/G-1b/G-2/G-3/G-3b (Cycle 20) were each the same missing
        seam as E-1/E-2/E-3, but for update instead of archive/purge: no
        personnel ViewSet routed `update`/`partial_update` through the
        service layer, so a generic PATCH could edit a payment, adjustment,
        or payroll input after settlement while the service layer refused
        the equivalent domain call. This test makes the presence of an
        update guard structural for the known set, mirroring the
        archive-block test above."""
        live = collected_model_viewsets()
        missing = []
        for name in sorted(MONEY_HOLDING_VIEWSETS_REQUIRING_UPDATE_BLOCK):
            view_class = live.get(name)
            if view_class is None:
                missing.append(f"{name} (not found by the resolver walk at all)")
                continue
            if "get_update_block_reason" not in view_class.__dict__:
                missing.append(name)

        self.assertEqual(
            missing,
            [],
            "These money-holding ViewSets do not define their own "
            "get_update_block_reason, so they silently inherit the mixin's "
            "default (which blocks nothing) - the exact shape of bugs "
            "G-1/G-1b/G-2/G-3/G-3b:\n  " + "\n  ".join(missing),
        )

    def test_money_holding_update_block_viewsets_list_has_no_stale_entries(self):
        live = set(collected_model_viewsets())
        stale = sorted(
            name for name in MONEY_HOLDING_VIEWSETS_REQUIRING_UPDATE_BLOCK if name not in live
        )
        self.assertEqual(
            stale,
            [],
            "MONEY_HOLDING_VIEWSETS_REQUIRING_UPDATE_BLOCK names "
            f"ModelViewSets that no longer exist: {stale}.",
        )
