# apps/treasury/permissions.py
"""Authorization for the treasury module.

Subclasses RoleBasedAccessPermission deliberately. The Cycle 9 endpoint
protection guard recognises role classes by inheritance, so subclassing means
every treasury endpoint is automatically covered by that guard with no edit to
the guard's own list.
"""

from apps.common.permissions import RoleBasedAccessPermission


class CanManageTreasury(RoleBasedAccessPermission):
    """Administrator only, every verb (owner decision, v17.21).

    This module used to follow the platform matrix (read for all three roles,
    write for Administrator/Assistant). The owner chose to withdraw Treasury
    from Assistant and Director entirely rather than retire the API, so the
    role tuples are narrowed here to a single role.

    This is one of the two places where overriding the inherited tuples is
    correct rather than a divergence bug: the module is deliberately no longer
    part of the shared matrix. Because the tuples are still *tuples*, the
    Cycle 9 endpoint protection guard keeps covering these endpoints by
    inheritance, and safe methods are narrowed too - an unauthorized GET is a
    403, so a Director cannot read Treasury data even read-only.

    The sidebar entry is restricted to Administrator in
    frontend/src/lib/navigation.ts, but that is cosmetic; this class is the
    actual access boundary.
    """

    READ_ROLES = ("Administrator",)
    WRITE_ROLES = ("Administrator",)
    DELETE_ROLES = ("Administrator",)

    message = "Treasury is restricted to administrators."
