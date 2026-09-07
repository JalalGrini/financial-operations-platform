"""Runtime integration tests for idempotent bootstrap and local demo seeding."""

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, PaymentMethod
from apps.financial_records.models import FinancialDocumentTemplate
from apps.parties.models import Client, Supplier
from apps.personnel.models import Employment, EmploymentSalary, PersonnelPerson
from apps.treasury.models import Account


class BootstrapCommandTests(TestCase):
    def test_bootstrap_is_idempotent_and_publishes_baseline_templates(self):
        call_command("bootstrap_efop", verbosity=0)
        first = {
            "groups": Group.objects.count(),
            "types": FinancialRecordType.all_objects.count(),
            "methods": PaymentMethod.all_objects.count(),
            "templates": FinancialDocumentTemplate.all_objects.count(),
        }
        call_command("bootstrap_efop", verbosity=0)
        second = {
            "groups": Group.objects.count(),
            "types": FinancialRecordType.all_objects.count(),
            "methods": PaymentMethod.all_objects.count(),
            "templates": FinancialDocumentTemplate.all_objects.count(),
        }
        self.assertEqual(first, second)
        self.assertTrue(
            {"Administrator", "Assistant", "Director"}.issubset(
                set(Group.objects.values_list("name", flat=True))
            )
        )
        for name in ("Sales Invoice", "Purchase Invoice", "General Expense"):
            record_type = FinancialRecordType.objects.get(name=name)
            self.assertTrue(
                FinancialDocumentTemplate.objects.filter(
                    record_type=record_type,
                    status="published",
                    is_default=True,
                ).exists()
            )

    def test_demo_seed_is_idempotent_and_complete_for_manual_tests(self):
        call_command("seed_efop_demo", verbosity=0)
        first = (
            Company.all_objects.count(),
            Client.all_objects.count(),
            Supplier.all_objects.count(),
            PersonnelPerson.all_objects.count(),
            Employment.all_objects.count(),
            EmploymentSalary.all_objects.count(),
            Account.all_objects.count(),
        )
        call_command("seed_efop_demo", verbosity=0)
        second = (
            Company.all_objects.count(),
            Client.all_objects.count(),
            Supplier.all_objects.count(),
            PersonnelPerson.all_objects.count(),
            Employment.all_objects.count(),
            EmploymentSalary.all_objects.count(),
            Account.all_objects.count(),
        )
        self.assertEqual(first, second)
        self.assertTrue(Company.objects.filter(registration_number="RC-DEMO-2026-001").exists())
        self.assertTrue(Client.objects.filter(national_id="DEMO-CIN-CLIENT-001").exists())
        self.assertTrue(PersonnelPerson.objects.filter(cin="DEMO-CIN-EMP-001").exists())
        self.assertEqual(
            Account.objects.filter(company__registration_number="RC-DEMO-2026-001").count(), 2
        )
