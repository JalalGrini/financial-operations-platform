# apps/configuration/permissions.py
"""
Configuration Permissions.

Custom permission classes for the Configuration domain.
"""
from django.utils.translation import gettext_lazy as _

from apps.common.permissions import RoleBasedAccessPermission


class CanManageConfiguration(RoleBasedAccessPermission):
    """Configuration catalogs follow the shared role matrix.

    Assistants may read and write payment methods, categories, record types,
    transaction types, report types and notification types. Directors remain
    read-only. Destruction stays Administrator-only. Document templates,
    users, and the audit log are gated separately and stay Administrator-only.
    """

    message = _("Insufficient permissions to manage configuration.")
