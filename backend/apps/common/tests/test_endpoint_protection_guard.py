"""Structural guard: no API endpoint may ship without a role check.

WHY THIS EXISTS
---------------
Cycle 8 drove the role matrix through real HTTP for one representative endpoint
per app. That approach only ever covers the endpoints someone remembered to
write a test for. The next viewset added to this codebase gets no such test by
default, and an unprotected endpoint is invisible until someone goes looking.

This guard inverts that. It walks the actual URL resolver, finds every DRF view
mounted under the API, and asserts each one either applies a role-aware
permission class or appears in EXEMPT_VIEWS with a written reason. A new viewset
is therefore protected by default: forget the permission class and this test
fails immediately, naming the view and its route.

This matters most for work that has not been written yet. Financial Records and
Treasury will add many viewsets handling money. Every one of them is covered by
this guard from the moment it is routed, without anyone remembering anything.

With company scoping deliberately rejected, roles are the only authorization
boundary in this platform. This test makes that boundary structural.

MATCHING BY INHERITANCE, NOT BY NAME
------------------------------------
Recognition is primarily `issubclass(..., RoleBasedAccessPermission)`. An
earlier draft of this guard matched permission class *names* against a list and
wrongly reported every Cycle 7 domain class as unprotected, because those are
thin subclasses with their own names. Name matching would also have silently
required every future subclass to be registered here by hand -- the exact
"someone must remember" failure this file exists to eliminate.
"""

import inspect

from django.test import SimpleTestCase
from django.urls import get_resolver
from django.urls.resolvers import URLPattern, URLResolver
from rest_framework.permissions import BasePermission

from apps.common.permissions import (
    IsAdministratorOrReadOnly,
    IsAuthenticatedOwnerOrReadOnly,
    RoleBasedAccessPermission,
)

# Any subclass of these is a genuine role-based authorization decision.
ROLE_AWARE_BASE_CLASSES = (
    RoleBasedAccessPermission,
    IsAdministratorOrReadOnly,
    IsAuthenticatedOwnerOrReadOnly,
)

# Personnel's permission family predates the Cycle 7 consolidation and derives
# straight from BasePermission, so it cannot be recognised by inheritance yet.
# Consolidating personnel onto RoleBasedAccessPermission should shrink this set
# to empty.
ROLE_AWARE_PERMISSION_NAMES = {
    "IsAdministrator",
    "IsAssistantOrAbove",
    "IsDirectorOrAbove",
    "CanManagePersonnel",
    "CanManagePayroll",
    "CanManageCNSS",
    "CanGenerateReports",
    "CanManagePayrollPayments",
}

# IsAuthenticated is deliberately absent from both: "is logged in" is not an
# authorization decision in a platform where every user can already see every
# company.

# Endpoints intentionally reachable without a role, each with the reason it is
# safe. Anything not listed here must carry a role check.
EXEMPT_VIEWS = {
    "HealthView": "Liveness probe. Returns no data and touches no database.",
    "ReleaseVersionView": "Public build identity only; returns no business or user data.",
    "DatabaseHealthView": (
        "Readiness probe for load balancers, which cannot authenticate. "
        "Rate limited in Cycle 6 so it cannot be used as a load amplifier."
    ),
    "LoginView": "Must be reachable by definition to obtain credentials.",
    "RefreshView": "Presents a refresh token as its own credential.",
    "LogoutView": "Clears the caller's own session.",
    "CSRFView": "Issues a CSRF cookie. Returns no business data.",
    "MeView": "Returns only the authenticated caller's own profile.",
    "ChangePasswordView": "Acts only on the caller's own credentials.",
    "APIRootView": (
        "DRF's router index. Lists route URLs only, no business data, and each "
        "listed route enforces its own permissions."
    ),
    "SpectacularAPIView": (
        "OpenAPI schema. Routed with IsAdminUser so anonymous clients cannot "
        "enumerate payroll/CNSS/auth operations."
    ),
    "SpectacularSwaggerView": (
        "Schema browser. Staff-only via IsAdminUser on the URL wiring."
    ),
    "SpectacularRedocView": (
        "Schema browser. Staff-only via IsAdminUser on the URL wiring."
    ),
    "HelpTicketCreateView": (
        "Public support ticket submission. Submitters do not hold a platform "
        "account; AllowAny is intentional and rate-limited at the server layer."
    ),
    "ClientTicketCreateView": (
        "Public inbound ticket from the landing page. No account required by "
        "design; the view stores contact info and notifies staff."
    ),
}


def is_role_aware(permission):
    """True if this permission class makes a role-based decision."""
    if not inspect.isclass(permission):
        permission = type(permission)
    if issubclass(permission, ROLE_AWARE_BASE_CLASSES):
        return True
    return permission.__name__ in ROLE_AWARE_PERMISSION_NAMES


def iter_api_views(patterns, prefix=""):
    """Yield (route, view class) for every DRF view in the URL tree."""
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from iter_api_views(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            view_class = getattr(entry.callback, "cls", None)
            if view_class is not None and inspect.isclass(view_class):
                yield prefix + str(entry.pattern), view_class


class EveryEndpointDeclaresAnAuthorizationDecisionTests(SimpleTestCase):
    """Walks the real router. No hand-maintained list of views."""

    def collected_views(self):
        views = {}
        for route, view_class in iter_api_views(get_resolver().url_patterns):
            views.setdefault(view_class.__name__, (route, view_class))
        return views

    def test_the_resolver_walk_actually_finds_views(self):
        """Protects the guard from silently passing by finding nothing.

        A traversal bug yielding zero views would make every other assertion in
        this file vacuously true -- a guard that passes precisely because it is
        broken.
        """
        views = self.collected_views()
        self.assertGreater(
            len(views),
            20,
            "The URL walk found suspiciously few views; the traversal is broken "
            "and this guard is not actually checking anything.",
        )

    def test_every_api_view_has_a_role_check_or_a_documented_exemption(self):
        unprotected = []
        for name, (route, view_class) in sorted(self.collected_views().items()):
            if name in EXEMPT_VIEWS:
                continue
            declared = getattr(view_class, "permission_classes", [])
            if not any(is_role_aware(p) for p in declared):
                shown = sorted(getattr(p, "__name__", type(p).__name__) for p in declared)
                unprotected.append(f"{name} at '{route}' declares {shown}")

        self.assertEqual(
            unprotected,
            [],
            "These endpoints are reachable without any role-based authorization "
            "check. Either attach a role permission class, or add the view to "
            "EXEMPT_VIEWS with a written reason:\n  " + "\n  ".join(unprotected),
        )

    def test_exemption_list_has_no_stale_entries(self):
        """An exemption for a view that no longer exists is a trap.

        It reads like a considered decision about a live endpoint when it is
        dead text, and it would silently exempt any future view that reuses the
        name.
        """
        live = set(self.collected_views())
        stale = sorted(name for name in EXEMPT_VIEWS if name not in live)
        self.assertEqual(
            stale,
            [],
            f"EXEMPT_VIEWS names views that are no longer routed: {stale}. "
            "Remove them so the list keeps meaning what it says.",
        )

    def test_named_role_permissions_refer_to_real_classes(self):
        """A typo in ROLE_AWARE_PERMISSION_NAMES would weaken the guard silently.

        The misspelled entry would never match, so a genuinely protected
        personnel view would be reported as unprotected -- or a later rename
        could leave the set matching nothing at all.
        """
        from apps.common import permissions as common_permissions
        from apps.personnel import permissions as personnel_permissions

        available = set()
        for module in (common_permissions, personnel_permissions):
            for name, obj in vars(module).items():
                if inspect.isclass(obj) and issubclass(obj, BasePermission):
                    available.add(name)

        missing = sorted(ROLE_AWARE_PERMISSION_NAMES - available)
        self.assertEqual(
            missing,
            [],
            f"These names do not correspond to real permission classes: {missing}",
        )

    def test_cycle_seven_subclasses_are_recognised_without_registration(self):
        """Every domain subclass must satisfy the guard by inheritance alone.

        This is the property that keeps the guard maintenance-free: adding a
        Financial Records or Treasury permission class must require no edit to
        this file.

        The domain modules are imported explicitly rather than relying on
        __subclasses__ alone. Python only reports subclasses it has already
        imported, so without these imports this test passes vacuously or fails
        depending on which test happened to load the URL conf first.
        """
        from apps.companies.permissions import CanManageCompany
        from apps.configuration.permissions import CanManageConfiguration
        from apps.parties.permissions import CanManageParty

        expected = {CanManageCompany, CanManageConfiguration, CanManageParty}
        subclasses = RoleBasedAccessPermission.__subclasses__()
        self.assertTrue(
            expected.issubset(set(subclasses)),
            "Cycle 7 domain classes must subclass RoleBasedAccessPermission.",
        )
        for subclass in subclasses:
            with self.subTest(permission=subclass.__name__):
                self.assertTrue(
                    is_role_aware(subclass),
                    f"{subclass.__name__} subclasses RoleBasedAccessPermission but "
                    "is not recognised as role-aware.",
                )
