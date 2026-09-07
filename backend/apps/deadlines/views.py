from django.db.models import Prefetch, Q
from django.http import Http404
from django.utils import timezone
from rest_framework import status, viewsets

from apps.common.export_mixin import ExportableListMixin
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.collaboration.permissions import IsRecognizedEFOPUser
from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from .models import Deadline, DeadlineOccurrence
from .selectors import roll_elapsed_deadlines
from .serializers import DeadlineSerializer
from apps.common.querying import apply_date_range
class DeadlineViewSet(
    ExportableListMixin,
    SoftDeleteViewSetMixin,ArchivableObjectMixin,viewsets.ModelViewSet):
 """Deadlines with recurrence.

 Uses the shared soft-delete mixins rather than a local ``perform_destroy``:
 the previous hand-rolled ``perform_destroy`` did archive correctly, but it
 left this ViewSet with no way back for an archived row (the C-3b/D-0 gap
 ``apps/common/tests/test_soft_delete_guard.py`` guards) and outside the
 structural guarantee that guard enforces, which looks for the mixin or an
 own ``destroy()``. The mixins supply ``destroy()`` (archive), the
 confirmation-gated ``permanent_delete``, and the archived-row-reachable
 ``get_object()`` the ``restore`` action below needs.
 """

 # Export wiring (v17.19). The mixin adds `export` and `export-options`
 # actions and exports filter_queryset(get_queryset()), which matters more
 # here than anywhere else: this ViewSet is the one that actually declares
 # filterset_fields and search_fields, so get_queryset() alone would ignore
 # the company/owner/status/priority filters and the search box.
 export_columns = [
  ("title", "Title"),
  ("company__name", "Company"),
  ("owner__email", "Owner"),
  ("due_at", "Due at"),
  ("status", "Status"),
  ("priority", "Priority"),
  ("period_type", "Period type"),
  ("recurrence_days", "Recurrence (days)"),
  ("completed_at", "Completed at"),
  ("description", "Description"),
 ]
 export_sheet_name = "Deadlines"
 export_filename_stem = "deadlines_export"
 serializer_class=DeadlineSerializer;permission_classes=[IsRecognizedEFOPUser];filterset_fields=("company","owner","status","priority","channel");search_fields=("title","description","company__name","owner__email");ordering_fields=("due_at","created_at","priority","status")
 @staticmethod
 def _is_administrator(u):
  return bool(u.is_superuser or u.groups.filter(name="Administrator").exists())
 def _visible(self):
  """Rows this caller may see, before any query-param narrowing."""
  u=self.request.user;q=Deadline.objects.all()
  if not self._is_administrator(u):q=q.filter(Q(owner=u)|Q(created_by=u))
  return q
 def get_queryset(self):
  u=self.request.user
  q=self._visible().select_related("company","owner","created_by","completed_by").prefetch_related(
   # The serializer renders the period history for every row, so prefetch it
   # rather than issuing one query per deadline.
   Prefetch("occurrences",queryset=DeadlineOccurrence.objects.select_related("completed_by"))
  )
  if self.request.query_params.get("scope")=="mine":q=q.filter(owner=u)
  if self.request.query_params.get("active") in("1","true","yes"):q=q.filter(status="upcoming")
  q=apply_date_range(q,self.request,"due_at")
  return q.distinct()
 def list(self,request,*args,**kwargs):
  # Bring any period whose completed due date has passed onto its next
  # occurrence before rendering, so the dates and the "Completed" tile are
  # never stale just because no scheduler ran.
  roll_elapsed_deadlines(scope=self._visible())
  return super().list(request,*args,**kwargs)
 def retrieve(self,request,*args,**kwargs):
  roll_elapsed_deadlines(scope=self._visible())
  return super().retrieve(request,*args,**kwargs)
 def get_object(self):
  obj=super().get_object()
  # ArchivableObjectMixin resolves archive/restore through ``all_objects`` so
  # they can reach archived rows, which deliberately bypasses get_queryset() -
  # and get_queryset() is where this ViewSet's ownership scoping lives. Since
  # IsRecognizedEFOPUser carries no object-level rule, re-apply that scoping
  # here, or archiving/restoring by id would reach deadlines the caller cannot
  # even list.
  if getattr(self,"action",None) in self.ARCHIVE_ACTIONS and not self._is_administrator(self.request.user):
   if obj.owner_id!=self.request.user.id and obj.created_by_id!=self.request.user.id:raise Http404
  return obj
 def perform_create(self,s):s.save(created_by=self.request.user,updated_by=self.request.user)
 def perform_update(self,s):s.save(updated_by=self.request.user)
 def _respond(self,o):
  """Serialize after a mutation, dropping the stale prefetch cache.

  ``get_object()`` resolves through ``get_queryset()``, which prefetches
  ``occurrences``. Completing a period creates or updates occurrence rows, so
  serializing the same instance afterwards rendered the pre-mutation list and
  under-reported ``completed_periods_count``. ``refresh_from_db()`` with no
  field list is the documented way to clear that cache.
  """
  o.refresh_from_db()
  return Response(self.get_serializer(o).data)
 def state(self,o,status):
  o.status=status;o.updated_by=self.request.user;o.completed_at=timezone.now() if status=="completed" else None;o.completed_by=self.request.user if status=="completed" else None;o.save();return Response(self.get_serializer(o).data)
 @action(detail=True,methods=["post"])
 def complete(self,r,pk=None):
  """Mark the current period complete.

  ``due_at`` deliberately stays put: the row reads as completed against the
  date the user just satisfied, and only moves to the next period once that
  date has passed (``roll_elapsed_deadlines`` on the read path, or the
  ``roll_deadlines`` command). One-time deadlines simply close.

  The exception is a period already past its due date - a late completion -
  where there is nothing to wait for, so it rolls immediately and the next
  period surfaces straight away instead of hiding until the next request.
  """
  o=self.get_object()
  o.mark_current_period_completed(user=r.user)
  if o.is_recurring:o.roll_if_period_elapsed()
  return self._respond(o)
 @action(detail=True,methods=["post"])
 def reopen(self,r,pk=None):
  """Undo the current period's completion, including its occurrence row."""
  o=self.get_object()
  o.reopen_current_period(user=r.user)
  return self._respond(o)
 @action(detail=True,methods=["post"])
 def cancel(self,r,pk=None):return self.state(self.get_object(),"cancelled")
 @action(detail=True,methods=["post"])
 def archive(self,r,pk=None):
  """Archive without a DELETE body; the plain DELETE verb archives too."""
  o=self.get_object()
  if not o.is_archived:o.archive(user=r.user)
  return Response(self.get_serializer(o).data)
 @action(detail=True,methods=["post"])
 def restore(self,r,pk=None):
  """Bring an archived deadline back, so DELETE is not a one-way door."""
  o=self.get_object()
  if not o.is_archived:return Response({"detail":"Deadline is not archived."},status=status.HTTP_400_BAD_REQUEST)
  o.restore();return Response(self.get_serializer(o).data)
