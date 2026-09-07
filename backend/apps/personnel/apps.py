# apps/personnel/apps.py
"""
Personnel App Configuration.
"""
from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    """Configuration for the Personnel app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.personnel"
    verbose_name = "Personnel"

    def ready(self):
        # Import signals when app is ready
        import apps.personnel.signals  # noqa: F401
