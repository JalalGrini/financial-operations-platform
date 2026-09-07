from apps.common.permissions import RoleBasedAccessPermission


class CanViewAuditLog(RoleBasedAccessPermission):
    READ_ROLES = ("Administrator",)
    WRITE_ROLES = ()
    DELETE_ROLES = ()
    message = "Only an Administrator may view the audit log."
