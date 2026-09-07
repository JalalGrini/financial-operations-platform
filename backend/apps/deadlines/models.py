from datetime import timedelta

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from apps.common.models import BaseModel, TrackedModel


class Deadline(TrackedModel):
    """A recurring or one-off obligation.

    RECURRENCE MODEL
    ----------------
    ``due_at`` is always the due date of the *current* period, and completing a
    recurring deadline deliberately does **not** move it. The row shows as
    ``completed`` while keeping the date the user is looking at, and only rolls
    onto the next period once that date has actually passed (see
    ``roll_if_period_elapsed``). An earlier version advanced ``due_at`` the
    instant you pressed Complete, which meant a monthly deadline completed on
    the 3rd immediately displayed next month's date - it looked like nothing had
    been done, and the "Completed" tile never reflected the current month.

    Each period is recorded as a :class:`DeadlineOccurrence`, which is what
    makes "completed this month" answerable and gives the running count of
    periods honoured.

    Periods are never skipped. If several elapse without anyone completing
    them, each one rolls forward individually and becomes overdue rather than
    being silently jumped over - a missed filing must stay visible.
    """

    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class PeriodType(models.TextChoices):
        ONE_TIME = "one_time", "One-time (archive on complete)"
        MONTHLY = "monthly", "Monthly (advance 1 month)"
        QUARTERLY = "quarterly", "Quarterly (advance 3 months)"
        YEARLY = "yearly", "Yearly (advance 12 months)"
        CUSTOM = "custom", "Custom (advance N days)"

    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    company = models.ForeignKey(
        "companies.Company",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deadlines",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deadlines_assigned",
    )
    due_at = models.DateTimeField(db_index=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UPCOMING, db_index=True
    )
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.MEDIUM, db_index=True
    )
    period_type = models.CharField(
        max_length=20,
        choices=PeriodType.choices,
        default=PeriodType.ONE_TIME,
        db_index=True,
        help_text="Recurrence pattern applied when the deadline is marked complete.",
    )
    recurrence_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Only used when period_type="custom". Number of days to advance due_at.',
    )
    channel = models.CharField(max_length=80, blank=True)
    destination = models.CharField(max_length=500, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deadlines_completed",
    )

    class Meta:
        ordering = ["status", "due_at", "-created_at"]
        indexes = [
            models.Index(fields=["status", "due_at"], name="deadline_status_due_idx"),
            models.Index(fields=["owner", "status", "due_at"], name="deadline_owner_queue_idx"),
        ]

    def __str__(self):
        return self.title

    # ------------------------------------------------------------------
    # Period arithmetic
    # ------------------------------------------------------------------

    def _period_delta(self):
        """The step between two consecutive periods, or ``None`` if not recurring.

        ``None`` covers ``one_time`` and a ``custom`` deadline with no usable
        ``recurrence_days`` - a zero interval would otherwise roll the deadline
        onto the same instant forever, which is worse than simply closing it.
        """
        if self.period_type == self.PeriodType.MONTHLY:
            return relativedelta(months=1)
        if self.period_type == self.PeriodType.QUARTERLY:
            return relativedelta(months=3)
        if self.period_type == self.PeriodType.YEARLY:
            return relativedelta(years=1)
        if self.period_type == self.PeriodType.CUSTOM:
            days = self.recurrence_days or 0
            return timedelta(days=days) if days > 0 else None
        return None

    def _next_due_at(self):
        """The due date this deadline will move to when the current period ends."""
        delta = self._period_delta()
        if delta is None or self.due_at is None:
            return None
        return self.due_at + delta

    @property
    def next_due_at(self):
        """Exposed so the UI can show what is coming without implying it is current."""
        return self._next_due_at()

    @property
    def is_recurring(self):
        """True when this deadline repeats rather than closing on completion."""
        return self._period_delta() is not None

    def period_label_for(self, due_at):
        """Human label for the period a given due date belongs to.

        Monthly reads as ``2026-08``, quarterly as ``2026-Q3``, yearly as the
        year, and everything else falls back to the date itself.
        """
        if due_at is None:
            return ""
        if self.period_type == self.PeriodType.MONTHLY:
            return f"{due_at.year}-{due_at.month:02d}"
        if self.period_type == self.PeriodType.QUARTERLY:
            return f"{due_at.year}-Q{(due_at.month - 1) // 3 + 1}"
        if self.period_type == self.PeriodType.YEARLY:
            return str(due_at.year)
        return due_at.date().isoformat()

    @property
    def current_period_label(self):
        return self.period_label_for(self.due_at)

    @property
    def computed_status(self):
        if self.status in (self.Status.COMPLETED, self.Status.CANCELLED):
            return self.status
        seconds = (self.due_at - timezone.now()).total_seconds()
        return "overdue" if seconds < 0 else "due_soon" if seconds <= 259200 else "upcoming"

    # ------------------------------------------------------------------
    # Occurrences
    # ------------------------------------------------------------------

    def current_occurrence(self):
        """The occurrence row for the period currently on ``due_at``.

        Created on demand rather than backfilled by a migration, so deadlines
        that existed before occurrence tracking gain their history the first
        time they are touched.
        """
        existing = self.occurrences.filter(due_at=self.due_at).first()
        if existing is not None:
            return existing
        highest = self.occurrences.aggregate(models.Max("sequence"))["sequence__max"] or 0
        return self.occurrences.create(
            sequence=highest + 1,
            due_at=self.due_at,
            period_label=self.period_label_for(self.due_at),
            completed_at=self.completed_at if self.status == self.Status.COMPLETED else None,
            completed_by=self.completed_by if self.status == self.Status.COMPLETED else None,
        )

    @property
    def completed_periods_count(self):
        """How many periods have been honoured - the running "counted up" total."""
        return self.occurrences.filter(completed_at__isnull=False).count()

    @property
    def is_current_period_completed(self):
        return self.status == self.Status.COMPLETED

    @transaction.atomic
    def mark_current_period_completed(self, user=None):
        """Record the current period as done, keeping ``due_at`` where it is.

        Atomic because the occurrence row and the parent's status are two halves
        of one fact: a partial write would leave a period recorded as completed
        while the deadline still reads as open, or the reverse.
        """
        now = timezone.now()
        occurrence = self.current_occurrence()
        if occurrence.completed_at is None:
            occurrence.completed_at = now
            occurrence.completed_by = user
            occurrence.save(update_fields=["completed_at", "completed_by"])
        self.status = self.Status.COMPLETED
        self.completed_at = now
        self.completed_by = user
        if user is not None:
            self.updated_by = user
        self.save()
        return occurrence

    @transaction.atomic
    def reopen_current_period(self, user=None):
        """Undo completion of the current period (occurrence and parent together)."""
        occurrence = self.occurrences.filter(due_at=self.due_at).first()
        if occurrence is not None and occurrence.completed_at is not None:
            occurrence.completed_at = None
            occurrence.completed_by = None
            occurrence.save(update_fields=["completed_at", "completed_by"])
        self.status = self.Status.UPCOMING
        self.completed_at = None
        self.completed_by = None
        if user is not None:
            self.updated_by = user
        self.save()

    @transaction.atomic
    def roll_if_period_elapsed(self, now=None):
        """Move onto the next period once a completed period's date has passed.

        Advances by exactly one period per call. Deliberately does not fast
        forward to today: every skipped period would be an obligation nobody
        recorded, so each one must surface as its own overdue row instead.
        Returns True when the deadline moved.

        Atomic so opening the next occurrence and moving ``due_at`` onto it
        cannot come apart - a half-applied roll would either lose the new period
        or point the deadline at a period with no row.
        """
        delta = self._period_delta()
        if delta is None:
            return False
        if self.status != self.Status.COMPLETED:
            return False
        if self.due_at is None or self.due_at > (now or timezone.now()):
            return False

        # Make sure the period we are leaving is on record as completed before
        # the pointer moves off it.
        self.current_occurrence()

        next_due = self.due_at + delta
        highest = self.occurrences.aggregate(models.Max("sequence"))["sequence__max"] or 0
        self.occurrences.get_or_create(
            due_at=next_due,
            defaults={
                "sequence": highest + 1,
                "period_label": self.period_label_for(next_due),
            },
        )
        self.due_at = next_due
        self.status = self.Status.UPCOMING
        self.completed_at = None
        self.completed_by = None
        self.save()
        return True


class DeadlineOccurrence(BaseModel):
    """One period of a recurring deadline, and whether it was honoured.

    Exists so "was this month done?" and "how many periods have been completed?"
    are answerable facts rather than something inferred from a single mutable
    ``due_at`` on the parent.
    """

    deadline = models.ForeignKey(
        Deadline,
        on_delete=models.CASCADE,
        related_name="occurrences",
    )
    sequence = models.PositiveIntegerField(
        help_text="1-based position of this period in the deadline's history."
    )
    due_at = models.DateTimeField(db_index=True)
    period_label = models.CharField(
        max_length=40,
        blank=True,
        help_text='Human period key, e.g. "2026-08" monthly or "2026-Q3" quarterly.',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deadline_occurrences_completed",
    )

    class Meta:
        ordering = ["-due_at"]
        # `due_at` identifies a period within one deadline, so a roll-forward or
        # an on-demand backfill can never create the same period twice.
        constraints = [
            models.UniqueConstraint(
                fields=["deadline", "due_at"], name="deadline_occurrence_unique_period"
            )
        ]
        indexes = [
            models.Index(fields=["deadline", "-due_at"], name="deadline_occ_recent_idx"),
        ]

    def __str__(self):
        state = "completed" if self.completed_at else "pending"
        return f"{self.deadline_id} #{self.sequence} ({self.period_label}) {state}"

    @property
    def is_completed(self):
        return self.completed_at is not None
