"""Verify required EFOP tables and release migrations without modifying data."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

REQUIRED_TABLES = {
    "accounts_user",
    "companies_company",
    "parties_client",
    "personnel_personnelperson",
    "financial_records_financialrecord",
    "financial_records_financialdocumenttemplate",
    "treasury_account",
    "reports_generatedreport",
}

REQUIRED_MIGRATIONS = {
    ("accounts", "0001_initial"),
    ("parties", "0002_client_kind"),
    ("financial_records", "0004_document_templates"),
}


class Command(BaseCommand):
    help = "Read-only verification of required EFOP database tables and migrations."

    def handle(self, *args, **options):
        tables = set(connection.introspection.table_names())
        applied = set(MigrationRecorder(connection).applied_migrations())
        missing_tables = sorted(REQUIRED_TABLES - tables)
        missing_migrations = sorted(REQUIRED_MIGRATIONS - applied)

        if missing_tables or missing_migrations:
            details = []
            if missing_tables:
                details.append("missing tables: " + ", ".join(missing_tables))
            if missing_migrations:
                details.append(
                    "missing migrations: "
                    + ", ".join(f"{app}.{name}" for app, name in missing_migrations)
                )
            raise CommandError(
                "EFOP schema verification failed (" + "; ".join(details) + "). "
                "Confirm the database target, then run manage.py migrate."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "EFOP schema verified: custom user table and Release 33 migrations are present."
            )
        )
