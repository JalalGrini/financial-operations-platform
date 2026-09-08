from django.apps import apps
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Copy yesterday's daily budget onto today for companies that were not filled."

    def handle(self, *args, **options):
        DailyBudget = apps.get_model("treasury", "DailyBudget")
        Company = apps.get_model("companies", "Company")
        today = timezone.localdate()
        created = 0
        for company in Company.objects.filter(is_archived=False):
            if DailyBudget.objects.filter(company=company, date=today).exists():
                continue
            prior = (
                DailyBudget.objects.filter(company=company, date__lt=today)
                .order_by("-date")
                .first()
            )
            if prior is None:
                continue
            DailyBudget.objects.create(
                company=company,
                date=today,
                amount=prior.amount,
                note=prior.note,
                filled_by=prior.filled_by,
                is_carried_over=True,
            )
            created += 1
        self.stdout.write(self.style.SUCCESS(f"Carried over {created} daily budget(s)."))
