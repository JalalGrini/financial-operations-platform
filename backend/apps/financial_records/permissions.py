# apps/financial_records/permissions.py
"""
Authorization for the Financial Records domain.

A thin subclass of the shared role matrix consolidated in Cycle 7. The matrix
itself lives in apps/common/permissions.py and is tested once there, so this
file exists only to give refusals a message that names the domain.

Because recognition in the Cycle 9 endpoint guard is by inheritance rather than
by name, subclassing here is also what makes every Financial Records viewset
protected by default.
"""

from django.utils.translation import gettext_lazy as _

from apps.common.permissions import RoleBasedAccessPermission


class CanManageFinancialRecord(RoleBasedAccessPermission):
    """Administrators and Assistants write, Directors read, only Admins delete."""

    message = _("Insufficient permissions to manage financial records.")


class CanRemoveOwnAttachment(CanManageFinancialRecord):
    """The one place an Assistant may remove something themselves.

    WHY THIS EXISTS
    ---------------
    The shared matrix sets ``DELETE_ROLES = ("Administrator",)``, and that split
    is deliberate: an Assistant archives, only an Administrator destroys. It is
    what gives the soft-delete policy its teeth, and it should not be widened.

    But an attachment is not a business record. It is a file the uploader chose
    to attach, and the person who attached the wrong PDF is the person who should
    be able to take it back off. Requiring an Administrator for that turns a
    ten-second correction into a support request, and the owner asked for exactly
    this one exception.

    THE SHAPE OF THE EXCEPTION
    --------------------------
    ``has_permission`` widens DELETE to the write roles, because DRF checks it
    before the object exists and a blanket 403 there would make the object-level
    check unreachable. ``has_object_permission`` is what actually enforces the
    rule, and it is where the narrowing happens:

    - Administrator (or superuser): may remove any attachment.
    - Assistant: may remove an attachment **only if they created it**.
    - Anyone else, including Director: refused.

    So the widening in ``has_permission`` is never the final word. This is the
    same two-stage pattern ``RoleBasedAccessPermission`` already uses, which is
    why the two halves cannot desynchronise.

    NOTE ON SCOPE: ``remove_attachment`` archives the row, it does not purge the
    object from storage. So even this exception is a soft delete and stays
    auditable and reversible by an Administrator.
    """

    message = _("You may only remove attachments that you uploaded yourself.")

    def has_permission(self, request, view):
        if request.method == "DELETE":
            user = request.user
            if not user or not user.is_authenticated:
                return False
            if user.is_superuser:
                return True
            # Object-level check below decides whether it is really allowed.
            return user.groups.filter(name__in=self.WRITE_ROLES).exists()
        return super().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        if request.method != "DELETE":
            return super().has_object_permission(request, view, obj)

        user = request.user
        if user.is_superuser:
            return True
        if user.groups.filter(name__in=self.DELETE_ROLES).exists():
            return True
        if not user.groups.filter(name__in=self.WRITE_ROLES).exists():
            return False

        # `obj` is the FinancialRecord, because the action is detail=True on the
        # record viewset and get_object() returns the record. The attachment is
        # resolved from the URL, so ownership is checked in the view where the
        # attachment is in hand. Returning True here only means "you are an
        # Assistant and may proceed to that check".
        return True
