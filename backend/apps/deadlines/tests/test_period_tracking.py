"""Period-tracking contract for recurring deadlines.

The rule these lock in: completing a recurring deadline records the period and
leaves ``due_at`` alone, so the row keeps showing the date that was just
satisfied. Only once that date has passed does the deadline move onto the next
period, one period at a time, never skipping.
"""

from datetime import timedelta

from dateutil.relativedelta import relativedelta
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.deadlines.models import Deadline
from apps.deadlines.selectors import roll_elapsed_deadlines


class RecurringPeriodTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="periods@example.com",
            password="StrongPass123!",
            first_name="P",
            last_name="Q",
        )
        Group.objects.get_or_create(name="Administrator")[0].user_set.add(self.user)
        self.client.force_authenticate(self.user)

    def _make(self, period_type, due_at, days=None):
        payload = {
            "title": f"D-{period_type}",
            "due_at": due_at.isoformat(),
            "owner": str(self.user.id),
            "period_type": period_type,
        }
        if days is not None:
            payload["recurrence_days"] = days
        response = self.client.post(
            reverse("deadlines:deadline-list"), payload, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        return Deadline.objects.get(pk=response.data["id"])

    def _complete(self, deadline):
        response = self.client.post(
            reverse("deadlines:deadline-complete", args=[deadline.id]), {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        deadline.refresh_from_db()
        return response.data

    # ---------------------------------------------------------------
    # The headline behaviour the user asked for
    # ---------------------------------------------------------------

    def test_completing_a_future_month_keeps_the_due_date(self):
        due = timezone.now() + timedelta(days=10)
        deadline = self._make("monthly", due)

        body = self._complete(deadline)

        self.assertEqual(deadline.status, "completed")
        self.assertEqual(deadline.due_at, due)
        self.assertTrue(body["is_current_period_completed"])
        self.assertEqual(body["completed_periods_count"], 1)
        # The next date is advertised separately so the UI never confuses it
        # for the current one.
        self.assertEqual(
            body["next_due_at"][:10], (due + relativedelta(months=1)).date().isoformat()
        )

    def test_completed_period_counts_towards_the_completed_tile(self):
        """The list must report the row as completed for the current period."""
        deadline = self._make("monthly", timezone.now() + timedelta(days=10))
        self._complete(deadline)

        response = self.client.get(reverse("deadlines:deadline-list"))
        row = next(r for r in response.data["results"] if r["id"] == str(deadline.id))

        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["computed_status"], "completed")

    def test_rolls_only_once_the_due_date_has_passed(self):
        due = timezone.now() + timedelta(days=2)
        deadline = self._make("monthly", due)
        self._complete(deadline)

        # Before the due date: still sitting on the completed period.
        self.assertEqual(roll_elapsed_deadlines(), 0)
        deadline.refresh_from_db()
        self.assertEqual(deadline.due_at, due)
        self.assertEqual(deadline.status, "completed")

        # After it: moves to the next period and is open again.
        moved = roll_elapsed_deadlines(now=due + timedelta(seconds=1))
        self.assertEqual(moved, 1)
        deadline.refresh_from_db()
        self.assertEqual(deadline.due_at, due + relativedelta(months=1))
        self.assertEqual(deadline.status, "upcoming")
        self.assertIsNone(deadline.completed_at)

    def test_an_incomplete_period_never_rolls(self):
        """A missed period must stay put and read as overdue, not disappear."""
        due = timezone.now() - timedelta(days=3)
        deadline = self._make("monthly", due)

        self.assertEqual(roll_elapsed_deadlines(), 0)
        deadline.refresh_from_db()
        self.assertEqual(deadline.due_at, due)
        self.assertEqual(deadline.computed_status, "overdue")

    def test_periods_are_not_skipped_when_several_elapse(self):
        """Three missed months must surface one at a time, not jump to today."""
        due = timezone.now() - relativedelta(months=3)
        deadline = self._make("monthly", due)

        # Completing a late period rolls immediately - there is nothing to wait
        # for - but only by one month, leaving the next one overdue.
        self._complete(deadline)
        self.assertEqual(deadline.due_at, due + relativedelta(months=1))
        self.assertEqual(deadline.status, "upcoming")
        self.assertEqual(deadline.computed_status, "overdue")

        self._complete(deadline)
        self.assertEqual(deadline.due_at, due + relativedelta(months=2))

    # ---------------------------------------------------------------
    # The counter
    # ---------------------------------------------------------------

    def test_counter_accumulates_one_entry_per_period(self):
        due = timezone.now() - relativedelta(months=1)
        deadline = self._make("monthly", due)

        self._complete(deadline)
        first = deadline.completed_periods_count
        self._complete(deadline)
        second = deadline.completed_periods_count

        self.assertEqual(first, 1)
        self.assertEqual(second, 2)

    def test_occurrence_history_labels_each_period(self):
        deadline = self._make("monthly", timezone.now() - relativedelta(months=1))
        self._complete(deadline)
        body = self._complete(deadline)

        labels = [o["period_label"] for o in body["occurrences"]]
        self.assertEqual(len(set(labels)), len(labels), "period labels must be unique")
        self.assertTrue(all("-" in label for label in labels), labels)
        # Two completed periods plus the newly opened one.
        self.assertEqual(sum(1 for o in body["occurrences"] if o["is_completed"]), 2)

    def test_quarterly_labels_use_quarters(self):
        deadline = self._make("quarterly", timezone.now() + timedelta(days=5))
        body = self._complete(deadline)
        self.assertIn("-Q", body["current_period_label"])

    def test_yearly_advances_by_a_year_after_the_date(self):
        due = timezone.now() - timedelta(days=1)
        deadline = self._make("yearly", due)
        self._complete(deadline)
        self.assertEqual(deadline.due_at, due + relativedelta(years=1))

    def test_custom_advances_by_recurrence_days(self):
        due = timezone.now() - timedelta(days=1)
        deadline = self._make("custom", due, days=15)
        self._complete(deadline)
        self.assertEqual(deadline.due_at, due + timedelta(days=15))

    # ---------------------------------------------------------------
    # One-time and reopen
    # ---------------------------------------------------------------

    def test_one_time_closes_and_never_rolls(self):
        due = timezone.now() - timedelta(days=1)
        deadline = self._make("one_time", due)
        body = self._complete(deadline)

        self.assertEqual(deadline.status, "completed")
        self.assertEqual(deadline.due_at, due)
        self.assertFalse(body["is_recurring"])
        self.assertEqual(roll_elapsed_deadlines(), 0)

    def test_reopen_clears_the_period_completion(self):
        deadline = self._make("monthly", timezone.now() + timedelta(days=10))
        self._complete(deadline)
        self.assertEqual(deadline.completed_periods_count, 1)

        response = self.client.post(
            reverse("deadlines:deadline-reopen", args=[deadline.id]), {}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        deadline.refresh_from_db()

        self.assertEqual(deadline.status, "upcoming")
        self.assertEqual(deadline.completed_periods_count, 0)
        self.assertFalse(response.data["is_current_period_completed"])

    def test_completing_twice_in_one_period_is_idempotent(self):
        deadline = self._make("monthly", timezone.now() + timedelta(days=10))
        self._complete(deadline)
        body = self._complete(deadline)
        self.assertEqual(body["completed_periods_count"], 1)
