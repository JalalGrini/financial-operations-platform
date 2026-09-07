# apps/extensibility/apps.py
from django.apps import AppConfig


class ExtensibilityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.extensibility"
    verbose_name = "Extensibility"
