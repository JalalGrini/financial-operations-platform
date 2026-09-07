"""ViewSet mixins shared across apps.

See state/IMPLEMENTATION_PLAN.md Section 10 for the full writeup of the bug
``ArchivableObjectMixin`` fixes (B-2) and the two things it must NOT regress
(B-1's crash mode, and object-level permission checks). See Section 11 for
``SoftDeleteViewSetMixin`` (bug C-1: plain DELETE was permanently destroying
rows on 20 endpoints) and its permanent-delete companion (decision C-5).
"""

from django.db.models import ProtectedError
from django.http import Http404
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response


class ArchivableObjectMixin:
    """Let ``archive``/``restore`` actions reach archived rows.

    Every affected ViewSet's default ``get_queryset()`` filters out archived
    rows (directly via ``is_archived=False``, or through a selector like
    ``active_records()``). DRF's default ``get_object()`` resolves through
    that filtered queryset, so a ``restore`` action built on the default
    ``get_object()`` can never find the archived row it is supposed to bring
    back - the lookup always 404s and the model-level ``restore()`` is never
    reached. This is bug B-2 in the Cycle 16 plan.

    Mix this in ahead of ``viewsets.ModelViewSet`` to fix that for the
    ``archive`` and ``restore`` actions specifically, while leaving every
    other action's queryset-based filtering untouched.

    Two things this intentionally preserves that a naive fix could drop:

    - It calls ``self.check_object_permissions(...)`` explicitly, because
      that is normally invoked inside DRF's default ``get_object()``. A
      version that bypassed ``get_object()`` entirely (as the pre-Cycle-16
      treasury implementation did) would silently skip any object-level
      permission rule a subclass defines - see Cycle 16 plan 10.1(a).
    - It looks the row up with ``.filter(pk=...).first()`` and raises
      ``Http404`` on ``None``, rather than ``Model.all_objects.get(pk=...)``
      (the pre-Cycle-16 companies pattern), which crashed with an uncaught
      ``DoesNotExist`` (HTTP 500) on a missing row - bug B-1.

    Requires the model to expose an ``all_objects`` manager that includes
    archived rows (provided by ``apps.common.models.ArchiveModel``, which
    every affected model inherits).
    """

    ARCHIVE_ACTIONS = ("archive", "restore")

    def get_object(self):
        if getattr(self, "action", None) not in self.ARCHIVE_ACTIONS:
            return super().get_object()

        model = self.get_queryset().model
        pk = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field or "pk")
        obj = model.all_objects.filter(pk=pk).first()
        if obj is None:
            raise Http404
        self.check_object_permissions(self.request, obj)
        return obj


class SoftDeleteViewSetMixin:
    """Fix bug C-1 and implement decision C-5 (state/IMPLEMENTATION_PLAN.md
    Section 11).

    BUG C-1 THIS FIXES
    -------------------
    Only 4 ModelViewSets in this project override ``destroy()``. Every other
    one inherits DRF's default, which calls ``instance.delete()`` - a real
    SQL DELETE. No model, manager, or mixin anywhere overrides ``delete()``,
    so nothing intercepted it: 20+ endpoints permanently destroyed rows on a
    plain ``DELETE``, discovered empirically (HTTP 204, row gone from
    ``all_objects``) against real API calls in the Cycle 17 architect pass.

    DECISION C-5 THIS IMPLEMENTS (answered by the user 2026-08-06 21:37)
    ----------------------------------------------------------------------
    An Administrator may choose either action, so this mixin exposes both,
    deliberately as two different routes rather than one DELETE with a flag:
    a mistyped query parameter must never be able to purge financial data.

    - Plain ``DELETE`` (``destroy()``) now archives. Every permission class
      in this project already restricts the DELETE method to Administrator
      (``RoleBasedAccessPermission.DELETE_ROLES``, and the equivalent
      hand-written checks in ``apps.personnel.permissions``), so this does
      not change who may call it - only what happens when they do.
    - ``DELETE .../<pk>/permanent/`` (the ``permanent_delete`` action) does a
      genuine purge. It reuses the same permission classes and therefore the
      same Administrator-only gate as plain DELETE - no new permission class
      was introduced. It additionally requires ``{"confirm": true}`` in the
      request body (never a query parameter, mirroring
      ``CompanyService.permanent_delete_company(confirmation=True)``),
      archives first if the row is not already archived (so the audit trail
      records the archive even for a purge), and translates ``ProtectedError``
      into HTTP 409 instead of letting it crash as a 500 (bug C-2). Looks the
      target up through ``all_objects`` so a row already archived by a prior
      plain DELETE can still be found - the same reachability problem
      ``ArchivableObjectMixin`` solves for ``archive``/``restore``, solved
      here independently so this mixin has no hard dependency on that one.

    WHAT THIS MIXIN DELIBERATELY DOES NOT DO
    -----------------------------------------
    - It does not touch ``CompanyViewSet``, ``FinancialRecordViewSet``, or
      ``TransactionViewSet``'s own ``destroy()`` overrides - those already
      route through services (``archive_record``, ``archive_transaction``) or
      are pure simplifications migrated onto this mixin's ``destroy()``
      directly (``CompanyViewSet``, ``AccountViewSet``). A ViewSet's own
      ``destroy()`` always wins over this mixin's in MRO regardless of base
      order, so mixing this in to add ``permanent_delete`` never disturbs an
      existing, already-correct ``destroy()``.
    - It does not add ``permanent_delete`` to ``ReconciliationViewSet``. A
      signed-off reconciliation period is evidence and DELETE is already
      blocked there (405); permanently purging it is out of scope.
    - It does not decide whether an object *should* be archived before
      being purged for domain reasons beyond ``ProtectedError`` (e.g. an
      approved payroll) - that is exactly the kind of check
      ``CompanyService.permanent_delete_company`` centralises for companies,
      which is why ``CompanyViewSet`` overrides ``permanent_delete`` to call
      that service instead of relying on this mixin's generic version.
    """

    def get_object(self):
        if getattr(self, "action", None) != "permanent_delete":
            return super().get_object()

        model = self.get_queryset().model
        pk = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field or "pk")
        obj = model.all_objects.filter(pk=pk).first()
        if obj is None:
            raise Http404
        self.check_object_permissions(self.request, obj)
        return obj

    def get_archive_block_reason(self, instance):
        """Return a translated message if archiving/purging ``instance`` is
        refused for a domain reason, or ``None`` if there is no such block
        (decision D-2, Cycle 18 - state/IMPLEMENTATION_PLAN.md Section 12).

        BUG D-2 THIS FIXES
        -------------------
        Before Cycle 18, this mixin's ``destroy()`` and ``permanent_delete``
        only ever refused a purge because of ``ProtectedError`` (a *foreign
        key* reason). Neither one asked whether the object itself was in a
        state that should never be archived or purged in the first place -
        e.g. a payroll that is already ``approved``/``paid``. Empirically, a
        ``paid`` ``MonthlyPayrollRecord`` could be archived (204) and then
        permanently purged (204, row gone) through the generic API even
        though the service layer (``calculate_payroll``, ``add_adjustment``,
        etc.) already refuses to mutate that same record.

        This base implementation has no domain knowledge and always returns
        ``None``, matching every ViewSet's pre-Cycle-18 behavior unless a
        subclass opts in by overriding this method.
        """
        return None

    def get_update_block_reason(self, instance):
        """Return a translated message if updating ``instance`` through the
        generic ``update``/``partial_update`` actions is refused for a
        domain reason, or ``None`` if there is no such block (Cycle 20,
        state/IMPLEMENTATION_PLAN.md Section 14).

        BUG G-1/G-1b/G-2/G-3/G-3b THIS FIXES
        -------------------------------------
        Cycles 17-19 closed "the generic DELETE path ignores the service
        layer's rules" for delete. This closes the same gap for update.
        Personnel's service layer (``MonthlyPayrollService``) refuses to
        mutate an approved/paid payroll or its adjustments/payments, but no
        personnel ViewSet routed ``update``/``partial_update`` through that
        service layer - every one used DRF's default, at most stamping
        ``updated_by``. Empirically, a fully-paid payroll's own payment
        amount could be edited from 10000.0000 down to 1.0000 through a
        plain PATCH while the payroll kept reporting ``total_paid=50000,
        status=paid`` - the platform's own record of what was paid became
        false with a single authorized, 200-OK request.

        This base implementation has no domain knowledge and always returns
        ``None``, matching every ViewSet's pre-Cycle-20 behavior unless a
        subclass opts in by overriding this method. Financial Records and
        Treasury do not need to opt in: both already override ``update()``
        themselves to route through their own service layer
        (``update_record``/``update_transaction``), so this mixin's
        ``update()`` below never runs for them (a ViewSet's own ``update()``
        always wins in MRO, exactly like ``destroy()`` above).
        """
        return None

    def update(self, request, *args, **kwargs):
        """Refuse the edit with 409 if ``get_update_block_reason`` reports a
        domain reason (Cycle 20), otherwise defer to DRF's default update.

        Only takes effect for ViewSets that do not define their own
        ``update()`` - see the note on ``get_update_block_reason`` above.
        DRF's own ``partial_update()`` calls ``self.update(..., partial=
        True)``, so overriding only ``update()`` here covers both PUT and
        PATCH without needing a separate override.
        """
        instance = self.get_object()
        block_reason = self.get_update_block_reason(instance)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Archive instead of destroy. Nothing is permanently lost through
        the ordinary REST verb; see ``permanent_delete`` for the deliberate
        purge path."""
        instance = self.get_object()
        block_reason = self.get_archive_block_reason(instance)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)
        instance.archive(user=request.user, reason="Deleted via API")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["delete"], url_path="permanent")
    def permanent_delete(self, request, *args, **kwargs):
        """Administrator-only, confirmation-gated true purge (decision C-5).

        Body must include ``{"confirm": true}``. Archives first if the row
        is not already archived. Translates ``ProtectedError`` into 409
        rather than letting it surface as an uncaught 500 (bug C-2). Also
        refused with 409 when ``get_archive_block_reason`` reports a domain
        reason (decision D-2, Cycle 18) - checked before the confirmation
        gate has any effect, so a settled payroll cannot be purged no matter
        what the request body contains.
        """
        instance = self.get_object()

        block_reason = self.get_archive_block_reason(instance)
        if block_reason is not None:
            return Response({"detail": block_reason}, status=status.HTTP_409_CONFLICT)

        if request.data.get("confirm") is not True:
            return Response(
                {"detail": _("Permanent deletion requires confirm: true in the " "request body.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not instance.is_archived:
            instance.archive(user=request.user, reason="Archived before permanent deletion")

        try:
            instance.delete()
        except ProtectedError as exc:
            blocking = list(getattr(exc, "protected_objects", []) or [])[:10]
            return Response(
                {
                    "detail": _(
                        "Cannot permanently delete: other records still " "reference this one."
                    ),
                    "blocking_references": [str(obj) for obj in blocking],
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
