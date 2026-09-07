# apps/common/tests/test_permissions.py
"""
Tests for the shared permission classes in ``apps.common.permissions``.

WHY THIS FILE EXISTS
--------------------
Coverage measurement in cycle 2 showed ``apps/common/permissions.py`` at
**0.0% coverage - 34 statements, 34 missed**. The module had no importer
anywhere in the codebase: the only ``import`` was a dead one in
``apps/companies/views.py`` that was removed in cycle 1 (audit finding H-1).

That is a dangerous combination. The classes were hardened in cycle 1 to fail
closed, but nothing executed them, so the hardening was asserted rather than
demonstrated. These classes are the intended base for the ``financial_records``
and ``treasury`` modules, so they must be pinned by tests *before* they carry
real money endpoints - not after.

The tests exercise the permission classes directly with ``APIRequestFactory``
rather than through a viewset. That is deliberate: the whole point of the H-1
fix is that these classes are safe *independently* of how a view configures
``permission_classes``, so testing them through a view that also applies the
project-wide ``IsAuthenticated`` default would re-mask exactly the bug being
guarded against.

Ownership objects are lightweight stubs, not ORM instances, because the classes
read only the ``created_by_id`` / ``user_id`` attributes. Using stubs keeps the
tests honest about that contract and keeps them fast.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.common.permissions import (
    IsAdministratorOrReadOnly,
    IsAdminOrReadOnly,
    IsAuthenticatedOwnerOrReadOnly,
    IsOwnerOrReadOnly,
)

User = get_user_model()

ADMINISTRATOR = "Administrator"
ASSISTANT = "Assistant"

SAFE_METHODS = ("get", "head", "options")
UNSAFE_METHODS = ("post", "put", "patch", "delete")


class OwnedByCreator:
    """Stub exposing the ``created_by_id`` ownership shape."""

    def __init__(self, created_by_id):
        self.created_by_id = created_by_id


class OwnedByUser:
    """Stub exposing the ``user_id`` ownership shape."""

    def __init__(self, user_id):
        self.user_id = user_id


class UnknownOwnershipShape:
    """Stub exposing neither ownership attribute."""


def make_user(email, role=None, is_superuser=False):
    """Create a user, optionally in a role group, optionally a superuser."""
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Test",
        last_name="User",
        is_superuser=is_superuser,
    )
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
    return user


class IsAuthenticatedOwnerOrReadOnlyTests(TestCase):
    """Ownership-based permission: read for any authenticated user, write for the owner."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.permission = IsAuthenticatedOwnerOrReadOnly()
        self.owner = make_user("owner@example.com")
        self.other = make_user("other@example.com")

    def _request(self, method, user):
        request = getattr(self.factory, method)("/fake-endpoint/")
        request.user = user
        return request

    # --- has_permission: the fail-closed gate added by H-1 -------------------

    def test_anonymous_is_denied_on_safe_methods(self):
        """
        The core H-1 regression guard. The old implementation granted safe
        methods unconditionally and relied on the global IsAuthenticated
        default to stop anonymous callers.
        """
        for method in SAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, AnonymousUser())
                self.assertFalse(
                    self.permission.has_permission(request, view=None),
                    f"Anonymous {method.upper()} must be denied at has_permission",
                )

    def test_anonymous_is_denied_on_unsafe_methods(self):
        for method in UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, AnonymousUser())
                self.assertFalse(self.permission.has_permission(request, view=None))

    def test_authenticated_user_passes_has_permission(self):
        for method in SAFE_METHODS + UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.owner)
                self.assertTrue(self.permission.has_permission(request, view=None))

    def test_missing_user_attribute_is_denied(self):
        """A request with ``user = None`` must not crash and must deny."""
        request = self._request("get", None)
        self.assertFalse(self.permission.has_permission(request, view=None))

    # --- has_object_permission ----------------------------------------------

    def test_anonymous_is_denied_at_object_level(self):
        """
        has_object_permission must re-check authentication rather than trusting
        that has_permission already ran.
        """
        obj = OwnedByCreator(self.owner.id)
        request = self._request("get", AnonymousUser())
        self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_authenticated_non_owner_can_read(self):
        obj = OwnedByCreator(self.owner.id)
        for method in SAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.other)
                self.assertTrue(self.permission.has_object_permission(request, None, obj))

    def test_owner_can_write_via_created_by_id(self):
        obj = OwnedByCreator(self.owner.id)
        for method in UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.owner)
                self.assertTrue(self.permission.has_object_permission(request, None, obj))

    def test_non_owner_cannot_write_via_created_by_id(self):
        obj = OwnedByCreator(self.owner.id)
        for method in UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.other)
                self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_owner_can_write_via_user_id(self):
        obj = OwnedByUser(self.owner.id)
        request = self._request("patch", self.owner)
        self.assertTrue(self.permission.has_object_permission(request, None, obj))

    def test_non_owner_cannot_write_via_user_id(self):
        obj = OwnedByUser(self.owner.id)
        request = self._request("patch", self.other)
        self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_unknown_ownership_shape_is_denied_not_allowed(self):
        """
        An object with no recognised owner field must be denied. Guessing or
        defaulting to allow here would silently expose future models that do
        not follow the created_by/user convention.
        """
        obj = UnknownOwnershipShape()
        for method in UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.owner)
                self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_null_created_by_falls_through_to_deny(self):
        """
        An unowned object (created_by_id is None) must not be writable. This
        pins the ``is not None`` checks: a naive ``==`` comparison of two None
        values, or truthiness checks, could grant access here.
        """
        obj = OwnedByCreator(None)
        request = self._request("patch", self.owner)
        self.assertFalse(self.permission.has_object_permission(request, None, obj))

    def test_superuser_is_not_granted_an_ownership_bypass(self):
        """
        CHARACTERISATION TEST - documents current behaviour, flagged for review.

        This class deliberately has no superuser bypass, unlike
        IsAdministratorOrReadOnly. A superuser who does not own the object
        cannot write to it through this class. That is defensible for an
        ownership check, but it differs from the role matrix used elsewhere in
        the platform, where superusers bypass everything. Pinning it here means
        any future change to that decision is a visible, intentional edit
        rather than an accident.
        """
        superuser = make_user("root@example.com", is_superuser=True)
        obj = OwnedByCreator(self.owner.id)
        request = self._request("delete", superuser)
        self.assertFalse(self.permission.has_object_permission(request, None, obj))


class IsAdministratorOrReadOnlyTests(TestCase):
    """Role-based permission: read for any authenticated user, write for Administrators."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.permission = IsAdministratorOrReadOnly()
        self.administrator = make_user("admin@example.com", role=ADMINISTRATOR)
        self.assistant = make_user("assistant@example.com", role=ASSISTANT)
        self.no_role = make_user("norole@example.com")

    def _request(self, method, user):
        request = getattr(self.factory, method)("/fake-endpoint/")
        request.user = user
        return request

    def test_anonymous_is_denied_even_for_reads(self):
        for method in SAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, AnonymousUser())
                self.assertFalse(self.permission.has_permission(request, view=None))

    def test_any_authenticated_user_can_read(self):
        for user in (self.administrator, self.assistant, self.no_role):
            for method in SAFE_METHODS:
                with self.subTest(user=user.email, method=method):
                    request = self._request(method, user)
                    self.assertTrue(self.permission.has_permission(request, view=None))

    def test_administrator_group_member_can_write(self):
        for method in UNSAFE_METHODS:
            with self.subTest(method=method):
                request = self._request(method, self.administrator)
                self.assertTrue(self.permission.has_permission(request, view=None))

    def test_non_administrator_cannot_write(self):
        for user in (self.assistant, self.no_role):
            for method in UNSAFE_METHODS:
                with self.subTest(user=user.email, method=method):
                    request = self._request(method, user)
                    self.assertFalse(self.permission.has_permission(request, view=None))

    def test_superuser_can_write_without_the_group(self):
        superuser = make_user("root2@example.com", is_superuser=True)
        request = self._request("post", superuser)
        self.assertTrue(self.permission.has_permission(request, view=None))

    def test_is_staff_alone_does_not_grant_write(self):
        """
        Pins the cycle 1 change from ``is_staff`` to the Administrator group.
        Django's ``is_staff`` flag controls admin-site access and is not the
        EFOP Administrator business role; conflating them let anyone with a
        Django admin login mutate business data.
        """
        staff_user = User.objects.create_user(
            email="staff@example.com",
            password="testpass123",
            first_name="Staff",
            last_name="User",
            is_staff=True,
        )
        request = self._request("post", staff_user)
        self.assertFalse(self.permission.has_permission(request, view=None))

    def test_object_permission_delegates_to_has_permission(self):
        """Object-level checks must apply the same role rule, not fall open."""
        obj = UnknownOwnershipShape()

        request = self._request("delete", self.administrator)
        self.assertTrue(self.permission.has_object_permission(request, None, obj))

        request = self._request("delete", self.assistant)
        self.assertFalse(self.permission.has_object_permission(request, None, obj))

        request = self._request("get", self.assistant)
        self.assertTrue(self.permission.has_object_permission(request, None, obj))


class BackwardsCompatibleAliasTests(TestCase):
    """
    The legacy names are kept so existing imports keep working. These tests
    ensure they resolve to the hardened implementations and cannot silently
    drift back to a permissive class.
    """

    def test_is_owner_or_read_only_is_the_hardened_class(self):
        self.assertIs(IsOwnerOrReadOnly, IsAuthenticatedOwnerOrReadOnly)

    def test_is_admin_or_read_only_is_the_hardened_class(self):
        self.assertIs(IsAdminOrReadOnly, IsAdministratorOrReadOnly)

    def test_aliases_reject_anonymous_users(self):
        factory = APIRequestFactory()
        for permission_class in (IsOwnerOrReadOnly, IsAdminOrReadOnly):
            with self.subTest(permission=permission_class.__name__):
                request = factory.get("/fake-endpoint/")
                request.user = AnonymousUser()
                self.assertFalse(permission_class().has_permission(request, view=None))
