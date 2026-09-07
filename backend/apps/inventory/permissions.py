from apps.common.permissions import RoleBasedAccessPermission


class CanManageInventory(RoleBasedAccessPermission):
    message = "Insufficient permissions to manage inventory."
