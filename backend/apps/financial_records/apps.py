# apps/financial_records/apps.py
from django.apps import AppConfig


class FinancialRecordsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.financial_records"
    verbose_name = "Financial Records"

    def ready(self):
        # Import signals if any
        pass
