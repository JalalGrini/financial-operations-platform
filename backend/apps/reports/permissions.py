# apps/reports/permissions.py
"""Authorization for the Reports Engine.

Subclasses RoleBasedAccessPermission deliberately, matching
apps.treasury.permissions.CanManageTreasury: the Cycle 9 endpoint protection
guard recognises role classes by inheritance, so every reports endpoint is
automatically covered with no edit to that guard's own list.
"""
from rest_framework.permissions import BasePermission

from apps.common.permissions import RoleBasedAccessPermission


class CanManageReports(RoleBasedAccessPermission):
    """Read for Administrator/Assistant/Director, write for the first two,
    delete for Administrator only. Inherited wholesale; nothing is relaxed.
    """

    message = "Insufficient permissions to manage reports."


class CanApproveReports(BasePermission):
    """Blueprint Section 7: approval is a reviewer act, narrower than the
    default WRITE_ROLES. An Assistant may generate and preview a report but
    may not approve one - approval is restricted to Administrator and
    Director, mirroring the reviewer/approver distinction the blueprint
    draws between whoever runs the generation and whoever signs off on it.
    """

    message = "Only an Administrator or Director may approve a report."

    APPROVE_ROLES = ("Administrator", "Director")

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        return user.groups.filter(name__in=self.APPROVE_ROLES).exists()

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
