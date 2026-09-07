# apps/dashboard/permissions.py
"""Authorization for the Executive Dashboard.

Subclasses RoleBasedAccessPermission deliberately, matching
apps.treasury.permissions.CanManageTreasury and apps.reports.permissions.
CanManageReports: the Cycle 9 endpoint-protection guard recognises role
classes by inheritance, so every dashboard endpoint is automatically
covered with no edit to that guard's own list.

blueprint 03_Actors_and_Permissions.md's "Dashboard / View" row grants
Administrator, Assistant, and Director - exactly the platform's standard
READ_ROLES, with no divergence (decision ED-8). "Dashboard / Configure" is
out of scope: 06_Configuration_Module.md Section 4.7 marks configurable
dashboard widgets "(Future)", and every endpoint here is read-only anyway,
so the WRITE_ROLES/DELETE_ROLES split never engages.
"""
from apps.common.permissions import RoleBasedAccessPermission


class CanViewDashboard(RoleBasedAccessPermission):
    """Read for Administrator/Assistant/Director. Every dashboard endpoint
    is a GET, so only the READ_ROLES branch of the inherited matrix ever
    matters here - inherited wholesale; nothing is relaxed or narrowed.
    """

    message = "Insufficient permissions to view the dashboard."
