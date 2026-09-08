"""Annotate personnel / employment querysets with today's official leave."""

from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.leaves.models import Leave


def annotate_is_on_leave(queryset, *, leave_fk: str):
    today = timezone.now().date()
    active_leave = Leave.objects.filter(
        **{leave_fk: OuterRef("pk")},
        status=Leave.STATUS_OFFICIAL,
        start_date__lte=today,
        end_date__gte=today,
    )
    return queryset.annotate(is_on_leave=Exists(active_leave))
