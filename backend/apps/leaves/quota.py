"""Annual leave entitlement vs chargeable leave days."""

from __future__ import annotations

from datetime import date, timedelta

from .models import Leave


ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]


def working_duration(start: date | None, end: date | None, weekdays=None) -> int:
    """Count days in [start, end) whose weekday is selected (Mon=0 … Sun=6)."""
    if not start or not end:
        return 0
    allowed = {int(day) for day in (weekdays or ALL_WEEKDAYS) if int(day) in range(7)}
    if not allowed:
        return 0
    days = 0
    cursor = start
    while cursor < end:
        if cursor.weekday() in allowed:
            days += 1
        cursor += timedelta(days=1)
    return days


def calendar_duration(start: date | None, end: date | None, weekdays=None) -> int:
    if weekdays is not None:
        return working_duration(start, end, weekdays)
    if not start or not end:
        return 0
    return max(0, (end - start).days)


def chargeable_days(duration: int, national: int = 0, international: int = 0) -> int:
    holidays = max(0, int(national or 0)) + max(0, int(international or 0))
    return max(0, int(duration or 0) - holidays)


def used_chargeable_days(employment, year: int, exclude_pk=None) -> int:
    qs = Leave.objects.filter(employment=employment, start_date__year=year).exclude(
        status=Leave.STATUS_CANCELLED
    )
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return sum(int(row.chargeable_days or 0) for row in qs)


def overlapping_chargeable(leave: Leave, period_start: date, period_end: date) -> int:
    if not leave.start_date or not leave.end_date:
        return 0
    overlap_start = max(leave.start_date, period_start)
    overlap_end = min(leave.end_date, period_end)
    weekdays = getattr(leave, "working_weekdays", None)
    overlap_cal = working_duration(overlap_start, overlap_end, weekdays)
    total_cal = calendar_duration(leave.start_date, leave.end_date, weekdays) or 1
    chargeable = int(leave.chargeable_days or total_cal)
    return int(round(chargeable * overlap_cal / total_cal))


def attendance_from_leaves(employment, period_start: date, period_end: date) -> dict[str, int]:
    leaves = Leave.objects.filter(
        employment=employment,
        status=Leave.STATUS_OFFICIAL,
        start_date__lte=period_end,
        end_date__gte=period_start,
    )
    authorized = unpaid = absence = 0
    for leave in leaves:
        days = overlapping_chargeable(leave, period_start, period_end)
        if leave.leave_type == "unpaid":
            unpaid += days
        elif leave.leave_type in ("annual", "exceptional", "sick", "maternity", "other"):
            authorized += days
        else:
            absence += days
    return {
        "authorized_leave_days": authorized,
        "unpaid_leave_days": unpaid,
        "absence_days": absence,
    }
