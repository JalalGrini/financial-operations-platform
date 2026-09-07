"""Advance recurring deadlines whose completed period has passed its due date.

The API already sweeps on the list/detail read path, so the UI is never stale
for someone looking at it. This command exists for the case nobody is: run it
from cron or Celery beat (daily is plenty) so a completed month still rolls onto
the next one even if the page goes unopened.

Safe to run repeatedly - it only touches rows whose preconditions still hold.
"""

from django.core.management.base import BaseCommand

from apps.deadlines.selectors import roll_elapsed_deadlines


class Command(BaseCommand):
    help = "Roll completed recurring deadlines onto their next period."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many deadlines would roll without changing anything.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            from django.utils import timezone

            from apps.deadlines.models import Deadline

            pending = (
                Deadline.objects.filter(
                    status=Deadline.Status.COMPLETED, due_at__lte=timezone.now()
                )
                .exclude(period_type=Deadline.PeriodType.ONE_TIME)
                .count()
            )
            self.stdout.write(f"{pending} deadline(s) would roll forward.")
            return

        rolled = roll_elapsed_deadlines()
        self.stdout.write(self.style.SUCCESS(f"Rolled {rolled} deadline(s) forward."))
