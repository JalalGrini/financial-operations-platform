# apps/configuration/permissions.py
"""
Configuration Permissions.

Custom permission classes for the Configuration domain.
"""
from django.utils.translation import gettext_lazy as _

from apps.common.permissions import RoleBasedAccessPermission


class CanManageConfiguration(RoleBasedAccessPermission):
    """
    Permission to manage configuration records.

    - Administrator: Full CRUD
    - Assistant: Create, Read, Update (no permanent delete)
    - Director: Read only

    The matrix itself lives in `apps.common.permissions.RoleBasedAccessPermission`
    (Cycle 7). This class previously carried its own byte-identical copy of that
    logic; only the denial message is domain-specific.
    """

    message = _("Insufficient permissions to manage configuration.")
