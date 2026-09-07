# apps/companies/management/commands/seed_companies.py
"""
Django management command to seed 4 fictional Moroccan companies.
Usage: python manage.py seed_companies
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.companies.models import Company, CompanyPreference, CompanySettings, CompanyStatus

User = get_user_model()


class Command(BaseCommand):
    help = "Seed 4 fictional Moroccan companies for testing"

    def handle(self, *args, **options):
        self.stdout.write("Seeding 4 fictional Moroccan companies...")

        # Get or create a superuser for created_by
        admin_user = User.objects.filter(is_superuser=True).first()
        if not admin_user:
            self.stdout.write(
                self.style.WARNING("No superuser found. Creating companies without created_by.")
            )

        companies_data = [
            {
                "name": "Atlas Technologies SARL",
                "trade_name": "Atlas Tech",
                "registration_number": "RC CAS 456789",
                "tax_id": "45678912",
                "vat_number": "001234567890123",
                "address": "125 Boulevard Mohammed V, Casablanca 20000",
                "phone": "+212 5 22 45 67 89",
                "email": "contact@atlastech.ma",
                "website": "https://atlastech.ma",
                "default_currency": "MAD",
                "timezone": "Africa/Casablanca",
                "status": CompanyStatus.ACTIVE,
            },
            {
                "name": "Maroc Industries SA",
                "trade_name": "Maroc Industries",
                "registration_number": "RC RAB 123456",
                "tax_id": "12345678",
                "vat_number": "002345678901234",
                "address": "45 Avenue Hassan II, Rabat 10000",
                "phone": "+212 5 37 65 43 21",
                "email": "info@marocindustries.ma",
                "website": "https://marocindustries.ma",
                "default_currency": "MAD",
                "timezone": "Africa/Casablanca",
                "status": CompanyStatus.ACTIVE,
            },
            {
                "name": "Sahara Logistics SARL",
                "trade_name": "Sahara Logistics",
                "registration_number": "RC AGD 789012",
                "tax_id": "78901234",
                "vat_number": "003456789012345",
                "address": "Zone Industrielle, Agadir 80000",
                "phone": "+212 5 28 34 56 78",
                "email": "operations@saharalogistics.ma",
                "website": "https://saharalogistics.ma",
                "default_currency": "MAD",
                "timezone": "Africa/Casablanca",
                "status": CompanyStatus.ACTIVE,
            },
            {
                "name": "Rif Construction SA",
                "trade_name": "Rif Construction",
                "registration_number": "RC TNG 345678",
                "tax_id": "34567890",
                "vat_number": "004567890123456",
                "address": "Boulevard Mohammed VI, Tanger 90000",
                "phone": "+212 5 39 78 90 12",
                "email": "commercial@rifconstruction.ma",
                "website": "https://rifconstruction.ma",
                "default_currency": "MAD",
                "timezone": "Africa/Casablanca",
                "status": CompanyStatus.ACTIVE,
            },
        ]

        created_count = 0
        for company_data in companies_data:
            company, created = Company.objects.get_or_create(
                registration_number=company_data["registration_number"],
                defaults=company_data,
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Created: {company.name} ({company.reference})")
                )

                # Create default settings
                CompanySettings.objects.get_or_create(
                    company=company,
                    defaults={
                        "record_reference_prefix": "INV",
                        "transaction_reference_prefix": "TRX",
                        "default_record_type": "",
                        "auto_validate_records": False,
                        "auto_approve_records": False,
                        "require_payment_confirmation": True,
                        "allow_internal_transfers": True,
                        "require_transfer_approval": True,
                        "notify_on_payment": True,
                        "notify_on_transfer": True,
                        "notify_on_report_generated": True,
                        "assistants_can_manage_records": True,
                        "assistants_can_manage_parties": True,
                        "assistants_can_create_transfers": False,
                        "created_by": admin_user,
                    },
                )

                # Create some sample preferences
                CompanyPreference.objects.get_or_create(
                    company=company,
                    key="notification_email_enabled",
                    defaults={
                        "preference_type": "boolean",
                        "value": "true",
                        "description": "Enable email notifications",
                        "is_system": False,
                    },
                )
                CompanyPreference.objects.get_or_create(
                    company=company,
                    key="default_payment_method",
                    defaults={
                        "preference_type": "string",
                        "value": "bank_transfer",
                        "description": "Default payment method",
                        "is_system": False,
                    },
                )
                CompanyPreference.objects.get_or_create(
                    company=company,
                    key="fiscal_year_start_month",
                    defaults={
                        "preference_type": "integer",
                        "value": "1",
                        "description": "Fiscal year starts in January",
                        "is_system": False,
                    },
                )
            else:
                self.stdout.write(self.style.WARNING(f"Already exists: {company.name}"))

        self.stdout.write(self.style.SUCCESS(f"\nDone! Created {created_count} new companies."))
