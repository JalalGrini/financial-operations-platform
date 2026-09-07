from apps.common.permissions import RoleBasedAccessPermission


class IsRecognizedEFOPUser(RoleBasedAccessPermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(
            u
            and u.is_authenticated
            and u.is_active
            and (
                u.is_superuser
                or u.groups.filter(name__in=("Administrator", "Assistant", "Director")).exists()
            )
        )
