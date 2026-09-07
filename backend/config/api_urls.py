"""
API URL configuration for v1 endpoints.
"""

from django.urls import include, path

from apps.accounts.urls import urlpatterns as accounts_urls
from apps.audit_log.urls import urlpatterns as audit_log_urls
from apps.authentication.urls import urlpatterns as authentication_urls
from apps.collaboration.urls import urlpatterns as collaboration_urls
from apps.companies.urls import urlpatterns as companies_urls
from apps.configuration.urls import urlpatterns as configuration_urls
from apps.dashboard.urls import urlpatterns as dashboard_urls
from apps.deadlines.urls import urlpatterns as deadlines_urls
from apps.transfers.urls import urlpatterns as transfers_urls
from apps.financial_records.urls import urlpatterns as financial_records_urls
from apps.inventory.urls import urlpatterns as inventory_urls
from apps.parties.urls import urlpatterns as parties_urls
from apps.personnel.urls import urlpatterns as personnel_urls
from apps.reports.urls import urlpatterns as reports_urls
from apps.treasury.urls import urlpatterns as treasury_urls
from apps.help_tickets.urls import urlpatterns as help_tickets_urls
from apps.leaves.urls import urlpatterns as leaves_urls
from config.views import DatabaseHealthView, HealthView, ReleaseVersionView

urlpatterns = [
    # Health checks
    path("health/", HealthView.as_view(), name="health"),
    path("health/database/", DatabaseHealthView.as_view(), name="health-database"),
    path("health/version/", ReleaseVersionView.as_view(), name="health-version"),
    path("system/version/", ReleaseVersionView.as_view(), name="system-version"),
    # Authentication
    path("auth/", include((authentication_urls, "authentication"), namespace="authentication")),
    # Accounts
    path("accounts/", include((accounts_urls, "accounts"), namespace="accounts")),
    # Personnel
    path("personnel/", include((personnel_urls, "personnel"), namespace="personnel")),
    # Companies
    path("companies/", include((companies_urls, "companies"), namespace="companies")),
    # Parties
    path("parties/", include((parties_urls, "parties"), namespace="parties")),
    # Configuration
    path(
        "configuration/", include((configuration_urls, "configuration"), namespace="configuration")
    ),
    # Financial Records
    path(
        "financial-records/",
        include((financial_records_urls, "financial_records"), namespace="financial_records"),
    ),
    # Treasury
    path("treasury/", include((treasury_urls, "treasury"), namespace="treasury")),
    # Reports
    path("reports/", include((reports_urls, "reports"), namespace="reports")),
    # Inventory
    path("inventory/", include((inventory_urls, "inventory"), namespace="inventory")),
    # Administrator audit trail
    path("audit-log/", include((audit_log_urls, "audit_log"), namespace="audit_log")),
    # Collaboration and notifications
    path(
        "collaboration/", include((collaboration_urls, "collaboration"), namespace="collaboration")
    ),
    path("deadlines/",include((deadlines_urls,"deadlines"),namespace="deadlines")),
    # Executive Dashboard
    path("dashboard/", include((dashboard_urls, "dashboard"), namespace="dashboard")),
    path("transfers/", include((transfers_urls, "transfers"), namespace="transfers")),
    path("help/", include((help_tickets_urls, "help_tickets"), namespace="help_tickets")),
    path("leaves/", include((leaves_urls, "leaves"), namespace="leaves")),
]
