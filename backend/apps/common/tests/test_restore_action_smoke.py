"""Structural guard: every routed 'restore' action must not crash.

WHY THIS EXISTS
----------------
Cycle 15 found that the Treasury account restore endpoint had been broken
since it was written: it called the shared soft-delete base's restore()
with an argument that method does not accept, so every call raised a
TypeError and returned HTTP 500. It shipped inside a 'green' Cycle 14
package because no restore endpoint anywhere in the project had an
API-level test.

This guard walks the real URL resolver, finds every route whose name ends
in '-restore' (the DRF router convention for a detail @action named
'restore'), reverses each one with a syntactically valid but nonexistent
UUID, and calls it as an Administrator. It asserts the response is never a
5xx.

An earlier draft of this file hand-reconstructed URLs from the resolver's
regex pattern strings by string-replacement. That was wrong: nested
URLResolver prefixes each carry their own '^' anchor, so the concatenated
string is not a valid path and every request 404'd before reaching a view
at all -- the guard passed, but for the wrong reason, proving nothing. This
version uses reverse(name, kwargs=...) instead, which is the correct way to
turn a route name into a real, dispatchable URL.

HONEST LIMIT OF THIS GUARD
---------------------------
A nonexistent UUID means several of these views will return 404 before ever
reaching a broken restore() call, if the view looks the row up first and
only calls restore() on a hit. The Treasury bug this guard is named for
happens to crash before any such lookup could shield it (see the mutation
test in Cycle 15's report, which reintroduces the exact bug and confirms
this guard turns red). Do not oversell this as proof every restore action is
correct for a row that DOES exist; it only proves the action does not crash
outright on the common not-found path.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import get_resolver, reverse
from django.urls.resolvers import URLPattern, URLResolver
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.parties.models import Client

User = get_user_model()

NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000"

# Cycle 15 scoping decision: this guard exists to catch the Treasury-style
# restore crash, and it found a second, unrelated instance of the same bug
# class while walking every app. Per the Cycle 15 plan (state/
# IMPLEMENTATION_PLAN.md, Section 9.4/9.9), out-of-scope restore endpoints
# found by this guard are logged and backlogged, not fixed in this cycle.
# Keep this dict honest: see test_known_broken_restore_actions_have_not_
# been_silently_fixed below, which fails loudly the day this stops being
# true so the exemption cannot quietly outlive the bug.
#
# Cycle 16 update: "companies:company-restore" is REMOVED from this dict.
# apps/companies/views.py CompanyViewSet no longer has its own get_object()
# override; it now uses the shared apps.common.mixins.ArchivableObjectMixin
# (state/IMPLEMENTATION_PLAN.md Section 10), which raises Http404 instead of
# an uncaught Company.DoesNotExist for a missing pk. Verified fixed by
# apps/common/tests/test_restore_reachability.py::CompanyMissingRowTests.
KNOWN_BROKEN_RESTORE_ACTIONS = {}


def iter_restore_route_names(patterns, namespaces=(), converter_names=()):
    """Yield (fully-namespaced route name, required kwarg names) for every
    route ending in '-restore'.

    Mirrors the resolver walk in test_endpoint_protection_guard.py rather
    than inventing a new traversal. Each app is mounted with its own
    namespace (see config/api_urls.py), so reverse() needs the accumulated
    namespace prefix, not the bare action name.

    Cycle 17 addition: also accumulates the required URL kwarg names
    contributed by every ancestor URLResolver plus the final URLPattern
    itself. A nested route like a company-scoped preference's restore
    action needs both 'company_pk' and 'pk' to reverse() - passing only
    'pk' (the previous behaviour) raises NoReverseMatch for any such
    route, which is exactly what CompanyPreferenceViewSet's routing
    surfaced when its restore/archive actions gained a 'company_pk' URL
    kwarg in Cycle 17 (fix for bug B-3).

    Deliberately reads named groups off the compiled regex
    (``pattern.regex.groupindex``) rather than ``pattern.converters``:
    ``converters`` is only populated for ``path()``-style ``RoutePattern``
    patterns (like the hand-written company/preference nesting in
    ``apps/companies/urls.py``), and is empty for the ``re_path()``-style
    ``RegexPattern`` patterns DRF's router generates for every action -
    which is every other restore route in this project. Using
    ``converters`` alone silently returned zero required kwargs for those,
    breaking ``reverse()`` for plain single-'pk' routes like
    'companies:company-restore' the moment this file started passing an
    empty kwargs dict instead of the previous hardcoded {'pk': ...} for
    them. 'format' is excluded: it is an optional format-suffix group
    (see DRF's format_suffix_patterns), not a required path segment, and
    forcing a UUID into it would make the URL invalid instead of merely
    unmatched.
    """
    for entry in patterns:
        if isinstance(entry, URLResolver):
            next_namespaces = namespaces
            if entry.namespace:
                next_namespaces = namespaces + (entry.namespace,)
            next_required = converter_names + tuple(
                k for k in entry.pattern.regex.groupindex if k != "format"
            )
            yield from iter_restore_route_names(entry.url_patterns, next_namespaces, next_required)
        elif isinstance(entry, URLPattern):
            name = entry.name or ""
            if name.endswith("-restore"):
                own_required = tuple(k for k in entry.pattern.regex.groupindex if k != "format")
                yield (
                    ":".join((*namespaces, name)),
                    converter_names + own_required,
                )


class RestoreActionsDoNotCrashTests(APITestCase):
    """No hand-maintained list of restore endpoints: the resolver is the source
    of truth, exactly as Cycle 9's endpoint-protection guard treats views.
    """

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="restore-guard-admin@example.com",
            password="testpass123",
            first_name="Restore",
            last_name="Guard",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def collected_route_names(self):
        """Route names only, for callers that just need to check membership
        (e.g. the Cycle 16 cross-check below). Use collected_routes() when
        the required kwargs matter, i.e. anywhere reverse() is called."""
        return sorted({name for name, _kwargs in self.collected_routes()})

    def collected_routes(self):
        return sorted(set(iter_restore_route_names(get_resolver().url_patterns)))

    def reverse_kwargs(self, required_kwarg_names):
        """NONEXISTENT_UUID for every required kwarg. Every converter on
        every restore route in this project is a uuid converter (no restore
        route is nested under a non-UUID-keyed parent), so one constant
        value covers 'pk' and any ancestor '<name>_pk' kwargs alike."""
        return dict.fromkeys(required_kwarg_names, NONEXISTENT_UUID)

    def test_the_walk_actually_finds_restore_routes(self):
        """Guards against a traversal bug making every assertion below
        vacuously true, the same failure mode test_endpoint_protection_guard
        protects against for its own walk.
        """
        names = self.collected_route_names()
        self.assertGreater(
            len(names),
            5,
            "The URL walk found suspiciously few restore routes; the "
            "traversal is broken and this guard is not checking anything.",
        )

    def test_every_restore_route_actually_reverses_to_a_real_url(self):
        """Catches the exact mistake the previous draft of this file made:
        a route name that resolves to something reverse() cannot turn back
        into a dispatchable path.
        """
        failures = []
        for name, required_kwargs in self.collected_routes():
            kwargs = self.reverse_kwargs(required_kwargs)
            try:
                url = reverse(name, kwargs=kwargs)
            except Exception as exc:  # noqa: BLE001 - report every failure, not just the first
                failures.append(f"{name}: {exc}")
                continue
            if NONEXISTENT_UUID not in url:
                failures.append(f"{name}: reversed to '{url}', which drops the pk")

        self.assertEqual(failures, [], "\n  ".join(failures))

    def test_no_restore_action_returns_a_server_error(self):
        failures = []
        for name, required_kwargs in self.collected_routes():
            if name in KNOWN_BROKEN_RESTORE_ACTIONS:
                continue
            url = reverse(name, kwargs=self.reverse_kwargs(required_kwargs))
            try:
                response = self.client.post(url, {}, format="json")
            except Exception as exc:  # noqa: BLE001 - an uncaught exception IS the failure mode
                failures.append(f"{name} at '{url}' raised {exc!r} instead of returning a response")
                continue
            if response.status_code >= 500:
                failures.append(f"{name} at '{url}' returned {response.status_code}")

        self.assertEqual(
            failures,
            [],
            "These restore actions crash instead of returning a client error "
            "or a clean 404:\n  " + "\n  ".join(failures),
        )

    def test_known_broken_restore_actions_have_not_been_silently_fixed(self):
        """KNOWN_BROKEN_RESTORE_ACTIONS is a scoping decision, not amnesia.

        If one of these starts passing, remove it from the list so the
        exemption stops hiding a fix that already happened. If this test
        starts failing, that is good news: go update the list and the
        backlog entry in state/IMPLEMENTATION_PLAN.md together.
        """
        routes_by_name = dict(self.collected_routes())
        still_broken = []
        for name, _reason in KNOWN_BROKEN_RESTORE_ACTIONS.items():
            url = reverse(name, kwargs=self.reverse_kwargs(routes_by_name.get(name, ("pk",))))
            try:
                response = self.client.post(url, {}, format="json")
                broken = response.status_code >= 500
            except Exception:  # noqa: BLE001
                broken = True
            if not broken:
                still_broken.append(name)

        self.assertEqual(
            still_broken,
            [],
            f"{still_broken} no longer crash. Remove them from "
            "KNOWN_BROKEN_RESTORE_ACTIONS and update the Cycle 15 backlog "
            "entry, do not just leave the exemption in place.",
        )

    def test_a_real_archived_row_is_actually_reached_not_just_not_crashed(self):
        """Cycle 16 addition (bug B-2).

        Every assertion above only ever calls restore on a NONEXISTENT
        UUID. That proves the action does not 500 on a miss; it says
        nothing about whether restore actually reaches a row that is
        really archived. Before Cycle 16, 13 of these routes silently
        no-op'd on a real archived row (get_queryset() filtered it out,
        the action still returned HTTP 200, and the row stayed archived).

        This is a single concrete, resolver-driven case (parties:client-
        restore) proving that failure mode is closed for at least one
        real route in this file's own walk, without hand-listing a URL.
        The full per-model matrix (all 13 previously-broken endpoints plus
        companies and treasury) lives in
        apps/common/tests/test_restore_reachability.py -- this test is a
        light structural cross-check, not a replacement for that file.
        """
        name = "parties:client-restore"
        self.assertIn(
            name,
            self.collected_route_names(),
            "parties:client-restore is no longer a resolvable route name; "
            "update this test to point at a route that still exists.",
        )

        client = Client.objects.create(name="Smoke Guard Restore Client")
        client.archive(user=self.admin, reason="smoke guard reachability check")
        client.refresh_from_db()
        self.assertTrue(client.is_archived)

        url = reverse(name, kwargs={"pk": str(client.pk)})
        response = self.client.post(url, {}, format="json")
        self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))

        client.refresh_from_db()
        self.assertFalse(
            client.is_archived,
            "restore returned success but the archived row was never reached " "(bug B-2).",
        )
