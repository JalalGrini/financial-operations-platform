# apps/common/permissions.py
"""
Common Permissions.

Reusable permission classes for the EFOP platform.

SECURITY NOTE (audit finding H-1):
    The previous implementations returned ``True`` for any request using a safe
    method, with no authentication check::

        def has_object_permission(self, request, view, obj):
            if request.method in permissions.SAFE_METHODS:
                return True

    Because ``has_object_permission`` runs only after ``has_permission``, this
    was masked by the project-wide default
    ``DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]``. That protection was
    incidental rather than intentional: any view declaring its own
    ``permission_classes`` without ``IsAuthenticated`` would have exposed object
    data to anonymous callers.

    Both classes now fail closed - they require an authenticated user before
    granting anything, so they are safe regardless of how a view configures
    ``permission_classes``. Defence in depth, not defence by default.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import permissions


class IsAuthenticatedOwnerOrReadOnly(permissions.BasePermission):
    """
    Allow read access to authenticated users, write access only to the owner.

    The object must expose a ``created_by`` or ``user`` field identifying the
    owner. Anonymous requests are always rejected.

    NOTE: this class enforces *ownership* only. It does NOT enforce company
    scoping. For company-scoped resources it must be combined with the tenant
    scoping layer, never relied on alone.
    """

    message = _("You do not have permission to modify this object.")

    def has_permission(self, request, view):
        # Fail closed: no anonymous access, even for safe methods.
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        # Write access is restricted to the owner. Compare *_id attributes to
        # avoid an extra database fetch of the related user object.
        owner_id = getattr(obj, "created_by_id", None)
        if owner_id is not None:
            return owner_id == request.user.id

        user_id = getattr(obj, "user_id", None)
        if user_id is not None:
            return user_id == request.user.id

        # Unknown ownership shape: deny rather than guess.
        return False


class IsAdministratorOrReadOnly(permissions.BasePermission):
    """
    Allow read access to authenticated users, write access to Administrators.

    "Administrator" is the EFOP business role, resolved through the Django group
    of the same name - consistent with
    ``apps.companies.permissions.CanManageCompany`` and the other per-app
    permission classes. The previous version tested ``request.user.is_staff``,
    which conflated Django's admin-site flag with the EFOP Administrator role.
    """

    message = _("Only administrators can perform this action.")

    ADMIN_GROUP = "Administrator"

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if user.is_superuser:
            return True

        return user.groups.filter(name=self.ADMIN_GROUP).exists()

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


# Backwards-compatible aliases.
#
# The original names are retained so existing imports keep working, but they now
# resolve to the hardened, fail-closed implementations above.
IsOwnerOrReadOnly = IsAuthenticatedOwnerOrReadOnly
IsAdminOrReadOnly = IsAdministratorOrReadOnly


class RoleBasedAccessPermission(permissions.BasePermission):
    """The platform's standard role matrix, defined exactly once.

        Administrator  full CRUD
        Assistant      create / read / update, never destroy
        Director       read only
        any other      denied
        superuser      bypasses everything

    WHY THIS CLASS EXISTS (Cycle 7)
    -------------------------------
    `CanManageCompany`, `CanManageConfiguration` and `CanManageParty` were three
    byte-identical copies of these fifty lines, differing only in class name and
    message. Duplicating an authorization rule is a security defect rather than
    an aesthetic one: a fix applied to one copy leaves the others quietly
    vulnerable, and nothing forces the copies to agree. Any future change to the
    matrix now happens in one place and applies everywhere at once.

    This matters more here than in most codebases. Company scoping was
    deliberately rejected - every Assistant and Director is responsible for all
    companies simultaneously - so **roles are the only authorization boundary in
    this platform**. There is no second layer behind this one.

    Subclasses should override `message` (so denials name the domain the caller
    was refused) and nothing else. Overriding the role tuples is supported for a
    genuinely different domain, but think hard first: divergence is exactly the
    problem this class was created to remove.
    """

    ADMIN_GROUP = "Administrator"

    #: Roles permitted to read. An authenticated user in none of these is
    #: denied even safe methods - authentication is not authorization.
    READ_ROLES = ("Administrator", "Assistant", "Director")

    #: Roles permitted to create and modify.
    WRITE_ROLES = ("Administrator", "Assistant")

    #: Roles permitted to permanently destroy. Kept separate from WRITE_ROLES
    #: because the split is what gives the soft-delete policy its teeth: an
    #: Assistant archives, only an Administrator destroys.
    DELETE_ROLES = ("Administrator",)

    WRITE_METHODS = ("POST", "PUT", "PATCH")

    message = _("Insufficient permissions to perform this action.")

    def has_permission(self, request, view):
        user = request.user

        # Fail closed. Every branch below grants; this is the only default.
        if not (user and user.is_authenticated):
            return False

        if user.is_superuser:
            return True

        if request.method in permissions.SAFE_METHODS:
            return user.groups.filter(name__in=self.READ_ROLES).exists()

        if request.method in self.WRITE_METHODS:
            return user.groups.filter(name__in=self.WRITE_ROLES).exists()

        if request.method == "DELETE":
            return user.groups.filter(name__in=self.DELETE_ROLES).exists()

        # Unrecognised verb: deny rather than guess.
        return False

    def has_object_permission(self, request, view, obj):
        """Object-level access is never weaker than view-level access.

        Delegating keeps the two decisions impossible to desynchronise. A
        subclass needing a genuine object-level rule should call `super()` and
        narrow the result - never widen it.
        """
        return self.has_permission(request, view)
