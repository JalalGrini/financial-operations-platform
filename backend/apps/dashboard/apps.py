from django.apps import AppConfig


class DashboardConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.dashboard"
    verbose_name = "Executive Dashboard"

    # No ready() signal wiring: unlike apps.reports (which must invalidate a
    # persisted snapshot when a source record changes), this module stores
    # nothing, so there is nothing to invalidate. Computing on every read is
    # what makes BR-022 ("dashboards update automatically") true for free -
    # see state/IMPLEMENTATION_PLAN.md Section 16, decision ED-1.
