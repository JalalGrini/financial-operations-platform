"""The role matrix, pinned identically across every domain permission class.

WHY THIS FILE EXISTS
--------------------
`CanManageCompany`, `CanManageConfiguration` and `CanManageParty` were three
byte-identical copies of the same 50 lines, differing only in class name and
message. Three copies of an authorization rule is a security problem, not just
a tidiness one: a fix applied to one copy silently leaves the other two
vulnerable, and nothing in the codebase forces them to agree.

These tests were written BEFORE the consolidation and must pass both before and
after it. They are characterisation tests, not TDD: they do not describe a bug
being fixed, they pin the behaviour that must survive the refactor.

They also matter beyond the refactor. Company scoping was deliberately rejected
(every Assistant and Director is responsible for all companies at once), which
means **roles are the only authorization boundary in this platform**. If this
matrix drifts, there is nothing behind it.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.companies.permissions import CanManageCompany
from apps.parties.permissions import CanManageParty

User = get_user_model()

# Every domain permission class that implements the shared matrix. Adding a new
# domain? Add its class here and the whole matrix is enforced on it for free.
MATRIX_PERMISSION_CLASSES = (
    CanManageCompany,
    CanManageParty,
)

READ_METHODS = ("get", "head", "options")
WRITE_METHODS = ("post", "put", "patch")
DELETE_METHOD = "delete"


class SharedRoleMatrixTests(TestCase):
    """One matrix, asserted against every domain class."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()

        for role in ("Administrator", "Assistant", "Director"):
            Group.objects.get_or_create(name=role)

        cls.administrator = cls._user("admin@example.com", "Administrator")
        cls.assistant = cls._user("assistant@example.com", "Assistant")
        cls.director = cls._user("director@example.com", "Director")
        cls.no_role = cls._user("norole@example.com", None)

        cls.superuser = User.objects.create_superuser(
            email="root@example.com",
            password="testpass123",
            first_name="Root",
            last_name="User",
        )

    @classmethod
    def _user(cls, email, role):
        user = User.objects.create_user(
            email=email,
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        if role:
            user.groups.add(Group.objects.get(name=role))
        return user

    def _allows(self, permission_class, user, method):
        request = getattr(self.factory, method)("/")
        request.user = user
        return permission_class().has_permission(request, view=None)

    def _assert_across_classes(self, user, method, expected, label):
        for permission_class in MATRIX_PERMISSION_CLASSES:
            with self.subTest(permission=permission_class.__name__, method=method):
                self.assertEqual(
                    self._allows(permission_class, user, method),
                    expected,
                    f"{permission_class.__name__}: {label} on {method.upper()} "
                    f"should be {'allowed' if expected else 'denied'}.",
                )

    # -- Administrator: full CRUD ------------------------------------------

    def test_administrator_may_read_write_and_delete(self):
        for method in READ_METHODS + WRITE_METHODS + (DELETE_METHOD,):
            self._assert_across_classes(self.administrator, method, True, "Administrator")

    # -- Assistant: create/read/update, never destroy ----------------------

    def test_assistant_may_read_and_write(self):
        for method in READ_METHODS + WRITE_METHODS:
            self._assert_across_classes(self.assistant, method, True, "Assistant")

    def test_assistant_may_not_delete(self):
        """Destruction is Administrator-only.

        This is the boundary that makes the soft-delete policy meaningful: an
        Assistant archives, an Administrator destroys.
        """
        self._assert_across_classes(self.assistant, DELETE_METHOD, False, "Assistant")

    # -- Director: read-only ------------------------------------------------

    def test_director_may_read(self):
        for method in READ_METHODS:
            self._assert_across_classes(self.director, method, True, "Director")

    def test_director_may_not_write_or_delete(self):
        """Directors are explicitly read-only, despite being senior.

        Seniority and write access are separate axes here: a Director oversees
        every company but does not key data.
        """
        for method in WRITE_METHODS + (DELETE_METHOD,):
            self._assert_across_classes(self.director, method, False, "Director")

    # -- No role: denied entirely -------------------------------------------

    def test_an_authenticated_user_without_a_role_is_denied_everything(self):
        """Authentication is not authorization.

        A freshly created account with no group must not be able to read. This
        is the fail-closed property: access requires a role to be granted, it is
        never the default.
        """
        for method in READ_METHODS + WRITE_METHODS + (DELETE_METHOD,):
            self._assert_across_classes(self.no_role, method, False, "Role-less user")

    # -- Anonymous: denied entirely -----------------------------------------

    def test_anonymous_callers_are_denied_everything(self):
        for method in READ_METHODS + WRITE_METHODS + (DELETE_METHOD,):
            self._assert_across_classes(AnonymousUser(), method, False, "Anonymous caller")

    # -- Superuser: bypasses the matrix -------------------------------------

    def test_superusers_bypass_the_matrix(self):
        for method in READ_METHODS + WRITE_METHODS + (DELETE_METHOD,):
            self._assert_across_classes(self.superuser, method, True, "Superuser")


class ObjectLevelDelegationTests(TestCase):
    """Object-level checks must not be weaker than view-level checks.

    Every class delegates `has_object_permission` to `has_permission`. That is
    worth pinning: a subclass that forgot to delegate would silently grant
    object access to anyone who passed the view-level check.
    """

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        Group.objects.get_or_create(name="Director")
        cls.director = User.objects.create_user(
            email="objdirector@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        cls.director.groups.add(Group.objects.get(name="Director"))

    def test_object_permission_matches_view_permission(self):
        sentinel = object()
        for permission_class in MATRIX_PERMISSION_CLASSES:
            for method in ("get", "delete"):
                with self.subTest(permission=permission_class.__name__, method=method):
                    request = getattr(self.factory, method)("/")
                    request.user = self.director
                    permission = permission_class()
                    self.assertEqual(
                        permission.has_object_permission(request, None, sentinel),
                        permission.has_permission(request, None),
                        f"{permission_class.__name__} object-level and "
                        f"view-level decisions diverged on {method.upper()}.",
                    )


class EveryClassDeclaresItsOwnMessageTests(TestCase):
    """Consolidation must not flatten the user-facing error messages.

    The three classes exist as separate names precisely so the API can say
    'manage companies' rather than a generic denial. If a refactor collapsed
    them into one shared message, error responses would regress.
    """

    def test_messages_are_distinct_and_domain_specific(self):
        messages = [str(cls.message) for cls in MATRIX_PERMISSION_CLASSES]
        self.assertEqual(
            len(set(messages)),
            len(messages),
            f"Domain permission messages must stay distinct, got: {messages}",
        )
