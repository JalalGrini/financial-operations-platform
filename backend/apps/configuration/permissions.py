# apps/configuration/permissions.py
"""
Configuration Permissions.

Custom permission classes for the Configuration domain.
"""
from django.utils.translation import gettext_lazy as _

from apps.common.permissions import RoleBasedAccessPermission


class CanManageConfiguration(RoleBasedAccessPermission):
    """Configuration workspace is Administrator-only for writes.

    Assistants and Directors may still GET catalogs (record types, categories,
    payment methods) because operational forms — financial records, parties,
    employments — load those lists. Creating or editing configuration itself
    stays on the Administration screens, which are also URL-gated.
    """

    WRITE_ROLES = ("Administrator",)
    DELETE_ROLES = ("Administrator",)
    message = _("Insufficient permissions to manage configuration.")
