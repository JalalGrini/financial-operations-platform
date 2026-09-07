"""Idempotent deterministic data for manual testing in local environments."""

import os
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.companies.models import Company, CompanySettings
from apps.configuration.models import PaymentMethod
from apps.parties.models import Client, Supplier
from apps.personnel.models import Employment, EmploymentSalary, PersonnelPerson
from apps.treasury.models import Account
from apps.treasury.services import create_account

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Idempotently add deterministic local demo company, people, parties, salary and accounts."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        module = os.environ.get("DJANGO_SETTINGS_MODULE", "").lower()
        if "test" not in module and (not settings.DEBUG or "development" not in module):
            raise CommandError(
                "Demo data is development/test-only and is refused by these settings."
            )

        call_command("bootstrap_efop", verbosity=0)
        audit_user = User.objects.filter(is_superuser=True).first()
        created = 0

        company = Company.all_objects.filter(registration_number="RC-DEMO-2026-001").first()
        if company is None:
            company = Company.objects.create(
                name="EFOP Demo Company SARL",
                trade_name="EFOP Demo",
                registration_number="RC-DEMO-2026-001",
                tax_id="IF-DEMO-2026-001",
                vat_number="ICE-DEMO-2026-001",
                email="finance.demo@example.com",
                phone="+212600000001",
                address="10 Avenue Mohammed V, Casablanca",
                status="active",
                created_by=audit_user,
            )
            created += 1
        elif company.is_archived:
            company.restore()
        CompanySettings.objects.get_or_create(company=company)

        organization = Client.all_objects.filter(registration_number="RC-CLIENT-DEMO-001").first()
        if organization is None:
            Client.objects.create(
                company=company,
                client_kind="organization",
                name="Atlas Demo Client SARL",
                registration_number="RC-CLIENT-DEMO-001",
                tax_id="IF-CLIENT-DEMO-001",
                email="billing@atlas-demo.example",
                phone="+212600000010",
                status="active",
                created_by=audit_user,
            )
            created += 1
        elif organization.is_archived:
            organization.restore()

        individual = Client.all_objects.filter(national_id="DEMO-CIN-CLIENT-001").first()
        if individual is None:
            Client.objects.create(
                company=company,
                client_kind="individual",
                first_name="Sara",
                last_name="Benali",
                name="Sara Benali",
                national_id="DEMO-CIN-CLIENT-001",
                email="sara.benali@example.com",
                status="active",
                created_by=audit_user,
            )
            created += 1
        elif individual.is_archived:
            individual.restore()

        supplier = Supplier.all_objects.filter(registration_number="RC-SUPPLIER-DEMO-001").first()
        if supplier is None:
            Supplier.objects.create(
                company=company,
                name="Rif Demo Supplies SARL",
                registration_number="RC-SUPPLIER-DEMO-001",
                email="accounts@rif-demo.example",
                phone="+212600000020",
                status="active",
                created_by=audit_user,
            )
            created += 1
        elif supplier.is_archived:
            supplier.restore()

        person = PersonnelPerson.all_objects.filter(cin="DEMO-CIN-EMP-001").first()
        if person is None:
            person = PersonnelPerson.objects.create(
                first_name="Yasmine",
                last_name="Alaoui",
                cin="DEMO-CIN-EMP-001",
                phone="+212600000030",
                email="yasmine.alaoui@example.com",
                city="Casablanca",
                nationality="Moroccan",
                status="active",
                created_by=audit_user,
            )
            created += 1
        elif person.is_archived:
            person.restore()

        employment = Employment.all_objects.filter(
            person=person, company=company, employee_reference="EMP-DEMO-001"
        ).first()
        if employment is None:
            employment = Employment.objects.create(
                person=person,
                company=company,
                employee_reference="EMP-DEMO-001",
                job_title="Operations Coordinator",
                department="Operations",
                work_city="Casablanca",
                employment_status="active",
                contract_type="permanent",
                hire_date=date(2026, 1, 2),
                is_active=True,
                payment_method=PaymentMethod.objects.filter(name="Bank Transfer").first(),
                bank_name="Demo Bank",
                bank_account_holder="Yasmine Alaoui",
                default_monthly_working_days=26,
                default_cnss_declared_days=26,
                created_by=audit_user,
            )
            created += 1
        elif employment.is_archived:
            employment.restore()

        salary = EmploymentSalary.all_objects.filter(
            employment=employment, effective_from=date(2026, 1, 2)
        ).first()
        if salary is None:
            EmploymentSalary.objects.create(
                employment=employment,
                fixed_monthly_gross_salary=Decimal("12000.0000"),
                effective_from=date(2026, 1, 2),
                reason="Deterministic manual-test salary",
                is_current=True,
                created_by=audit_user,
            )
            created += 1
        elif salary.is_archived:
            salary.restore()

        for name, kind, balance in (
            ("Demo Bank MAD", "bank", Decimal("50000.0000")),
            ("Demo Cash Box MAD", "cash", Decimal("5000.0000")),
        ):
            account = Account.all_objects.filter(company=company, name=name).first()
            if account is None:
                create_account(
                    company=company,
                    name=name,
                    user=audit_user,
                    kind=kind,
                    currency="MAD",
                    opening_balance=balance,
                    notes="Deterministic local manual-test account",
                )
                created += 1
            elif account.is_archived:
                account.restore()

        self.stdout.write(
            self.style.SUCCESS(
                f"EFOP local demo seed complete: {created} rows created; existing demo rows preserved."
            )
        )
        self.stdout.write(
            "Demo values: company EFOP Demo Company SARL; employee DEMO-CIN-EMP-001; "
            "organization client RC-CLIENT-DEMO-001; opening balances MAD 50,000 and MAD 5,000."
        )
