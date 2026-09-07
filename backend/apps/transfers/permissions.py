from apps.common.permissions import RoleBasedAccessPermission


class CanManageTransfers(RoleBasedAccessPermission):
    # Transfers are visible to every recognised role, including Director, so
    # the screen and its exports stay available to read-only staff.
    #
    # Writing is Administrator + Assistant only. Director used to hold write
    # and delete here, uniquely among the modules; that was removed on the
    # owner's instruction in v17.26. `role-gate-contract.test.ts` parses this
    # file, so the UI gate on /transfers is checked against these tuples and
    # will fail the build if the two ever drift apart again.
    READ_ROLES = ("Administrator", "Director", "Assistant")
    WRITE_ROLES = ("Administrator", "Assistant")
    DELETE_ROLES = ("Administrator",)
    message = "You do not have permission to manage transfers."
