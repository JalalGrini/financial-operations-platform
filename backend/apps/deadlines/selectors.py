"""Deadline read helpers, including the period roll-forward sweep."""

from django.utils import timezone

from .models import Deadline


def roll_elapsed_deadlines(scope=None, now=None):
    """Advance every completed recurring period whose due date has passed.

    Completing a recurring deadline leaves ``due_at`` alone so the row keeps
    showing the date the user just satisfied (see ``Deadline`` docstring). That
    means something has to move it once the date is genuinely behind us, and
    this is that something.

    Written as one indexed query plus a save per row that actually moves, so it
    is cheap enough to call on the list/detail read path - the common case
    selects nothing at all. It is also exposed as the ``roll_deadlines``
    management command so the sweep still happens on a schedule when nobody is
    looking at the page.

    @param scope - optional queryset to restrict the sweep to rows a caller can
        already see; defaults to every deadline.
    @param now - injectable clock for tests.
    @returns the number of deadlines advanced.
    """
    now = now or timezone.now()
    base = Deadline.objects.all() if scope is None else scope
    candidates = base.filter(
        status=Deadline.Status.COMPLETED,
        due_at__lte=now,
    ).exclude(period_type=Deadline.PeriodType.ONE_TIME)

    rolled = 0
    # The filter above is only a cheap prefilter; roll_if_period_elapsed
    # re-checks every precondition and is itself atomic, so each row either
    # advances completely or not at all and one bad row cannot poison the sweep.
    for deadline in list(candidates):
        if deadline.roll_if_period_elapsed(now=now):
            rolled += 1
    return rolled
