# apps/personnel/permissions.py
"""
Personnel Permissions.

Custom permission classes for the Personnel domain.
"""
from django.utils.translation import gettext_lazy as _
from rest_framework import permissions


class IsAdministrator(permissions.BasePermission):
    """
    Allow access only to Administrators.
    """

    message = _("Only administrators can perform this action.")

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or request.user.groups.filter(name="Administrator").exists()
            )
        )


class IsAssistantOrAbove(permissions.BasePermission):
    """
    Allow access to Assistants and Administrators.
    """

    message = _("Assistant or Administrator role required.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        return (
            request.user.is_superuser
            or request.user.groups.filter(name__in=["Administrator", "Assistant"]).exists()
        )


class IsDirectorOrAbove(permissions.BasePermission):
    """
    Allow access to Directors, Assistants, and Administrators.
    """

    message = _("Director, Assistant, or Administrator role required.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        return (
            request.user.is_superuser
            or request.user.groups.filter(
                name__in=["Administrator", "Assistant", "Director"]
            ).exists()
        )


class CanManagePersonnel(permissions.BasePermission):
    """
    Permission to manage personnel records.

    - Administrator: Full CRUD
    - Assistant: Create, Read, Update (no permanent delete)
    - Director: Read only
    """

    message = _("Insufficient permissions to manage personnel.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        user = request.user
        if user.is_superuser or user.groups.filter(name="Administrator").exists():
            return True

        # Check if method is safe (read-only)
        if request.method in permissions.SAFE_METHODS:
            return user.groups.filter(name__in=["Administrator", "Assistant", "Director"]).exists()

        # Write operations
        if request.method in ["POST", "PUT", "PATCH"]:
            return user.groups.filter(name__in=["Administrator", "Assistant"]).exists()

        # DELETE
        if request.method == "DELETE":
            return user.groups.filter(name="Administrator").exists()

        return False

    def has_object_permission(self, request, view, obj):
        # Additional object-level checks can be added here
        return self.has_permission(request, view)


class CanManagePayroll(permissions.BasePermission):
    """
    Permission to manage payroll records.

    - Administrator: Full CRUD, approve
    - Assistant: Create, calculate, record payments, view
    - Director: View, export reports
    """

    message = _("Insufficient permissions to manage payroll.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        user = request.user
        if user.is_superuser or user.groups.filter(name="Administrator").exists():
            return True

        # Safe methods
        if request.method in permissions.SAFE_METHODS:
            return user.groups.filter(name__in=["Administrator", "Assistant", "Director"]).exists()

        # Write operations
        if request.method in ["POST", "PUT", "PATCH"]:
            return user.groups.filter(name__in=["Administrator", "Assistant"]).exists()

        # DELETE
        if request.method == "DELETE":
            return user.groups.filter(name="Administrator").exists()

        return False

    def has_object_permission(self, request, view, obj):
        # EFOP intentionally has no per-company tenant boundary: Assistants and
        # Directors are responsible for every company at once. Object-level
        # access therefore follows exactly the same role matrix as
        # collection-level access.
        #
        # SECURITY/CORRECTNESS NOTE (audit finding H-4):
        # The previous implementation attempted a per-company membership check:
        #
        #     try:
        #         company = obj.employment.company
        #         return user.companies.filter(id=company.id).exists()
        #     except Exception:
        #         return False
        #
        # This was broken in two independent ways:
        #   1. ``user.companies`` has never existed on the User model, so the
        #      expression always raised AttributeError.
        #   2. ``obj.employment`` does not exist on PayrollAdjustment or
        #      PayrollPayment, which relate via ``payroll_record``.
        #
        # Because the bare ``except Exception`` swallowed both errors and
        # returned False, every Assistant and Director was silently denied
        # object-level access to payroll records, adjustments and payments -
        # breaking the Assistant role, the platform's primary operator. The
        # failure was invisible because it degraded to "403" rather than an
        # error. Broad exception handlers around authorization logic turn bugs
        # into silent policy changes, so the check is now explicit.
        return self.has_permission(request, view)


class CanManageCNSS(permissions.BasePermission):
    """
    Permission to manage CNSS declarations.

    - Administrator: Full CRUD
    - Assistant: Create, update, submit, view
    - Director: View, export reports
    """

    message = _("Insufficient permissions to manage CNSS declarations.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        user = request.user
        if user.is_superuser or user.groups.filter(name="Administrator").exists():
            return True

        if request.method in permissions.SAFE_METHODS:
            return user.groups.filter(name__in=["Administrator", "Assistant", "Director"]).exists()

        if request.method in ["POST", "PUT", "PATCH"]:
            return user.groups.filter(name__in=["Administrator", "Assistant"]).exists()

        return False


class CanGenerateReports(permissions.BasePermission):
    """
    Administrator only (owner decision, v17.21).

    Guards the personnel Reports module: CNSS monthly preview/export, payroll
    monthly preview/export, report types and the report dashboard.

    Previously any recognized role could generate these. The owner chose to
    withdraw the module from Assistant and Director rather than delete the API,
    so this now fails closed for everyone except Administrator (and Django
    superusers, which is how the platform's other permission classes behave).

    Note the old code's final line was already redundant - the branch above it
    returned True for Administrator - so the only roles this actually removes
    are Assistant and Director. That is the intended change.
    """

    message = _("Personnel reports are restricted to administrators.")

    ADMIN_GROUP = "Administrator"

    def has_permission(self, request, view):
        user = request.user

        # Fail closed: the only grants are the two branches below.
        if not (user and user.is_authenticated):
            return False

        if user.is_superuser:
            return True

        return user.groups.filter(name=self.ADMIN_GROUP).exists()


class CanManagePayrollPayments(permissions.BasePermission):
    """
    Permission specifically for recording payroll payments.

    - Administrator: Full
    - Assistant: Record payments and advances
    - Director: View only
    """

    message = _("Insufficient permissions to record payments.")

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        user = request.user
        if user.is_superuser or user.groups.filter(name="Administrator").exists():
            return True

        if request.method in permissions.SAFE_METHODS:
            return user.groups.filter(name__in=["Administrator", "Assistant", "Director"]).exists()

        # Payment recording
        if request.method in ["POST", "PUT", "PATCH"]:
            return user.groups.filter(name__in=["Administrator", "Assistant"]).exists()

        return False


class IsOwnerOrAdministrator(permissions.BasePermission):
    """
    Allow access if user is the owner of the object or an Administrator.
    """

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_superuser or request.user.groups.filter(name="Administrator").exists():
            return True

        # NOTE: there is currently no link from User to a personnel record, so
        # "is this user the subject of this record?" cannot be answered yet.
        # The previous code dereferenced ``request.user.personnel_profile``
        # directly; since that attribute does not exist, any call would have
        # raised an uncaught AttributeError and surfaced as HTTP 500. Use
        # getattr with a default so the branch is simply inert until a
        # User -> PersonnelPerson relation is introduced.
        personnel_profile = getattr(request.user, "personnel_profile", None)
        if personnel_profile is not None and getattr(obj, "person", None) == personnel_profile:
            return True

        # Check if user is the person
        if getattr(obj, "user", None) == request.user:
            return True

        return False


class CanViewPersonnelDetails(permissions.BasePermission):
    """
    Permission to view personnel details including sensitive info.

    - Administrator: All
    - Assistant: All (they manage personnel)
    - Director: Read-only
    - Person themselves: Their own record
    """

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        user = request.user
        if user.is_superuser or user.groups.filter(name="Administrator").exists():
            return True

        if user.groups.filter(name__in=["Administrator", "Assistant", "Director"]).exists():
            return True

        # Allow a person to view their own record.
        #
        # NOTE: this branch is currently unreachable by design - no User ->
        # PersonnelPerson relation exists, so ``personnel_profile`` is always
        # None. It is kept (rather than deleted) because self-service access is
        # a planned capability, but it is written to compare identifiers of the
        # same kind. The previous version compared ``obj.id`` (a PersonnelPerson
        # UUID) against ``personnel_profile`` (intended to be a profile object),
        # which could never be equal even once the relation exists.
        personnel_profile_id = getattr(request.user, "personnel_profile_id", None)
        if personnel_profile_id is not None:
            if getattr(obj, "id", None) == personnel_profile_id:
                return True
            if getattr(obj, "person_id", None) == personnel_profile_id:
                return True

        return False
