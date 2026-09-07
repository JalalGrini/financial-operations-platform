"""Regression coverage for the large deterministic QA seed workflow."""

from django.core.management import call_command
from django.test import TestCase

from apps.audit_log.models import AuditEvent
from apps.collaboration.models import Notification
from apps.companies.models import Company
from apps.financial_records.models import FinancialRecord
from apps.inventory.models import InventoryItem
from apps.parties.models import Client, Supplier
from apps.personnel.models import CNSSDeclaration, Employment, MonthlyPayrollRecord, PersonnelPerson
from apps.treasury.models import Account, Transaction


class QADataWorkflowTests(TestCase):
    def test_large_seed_is_idempotent_and_covers_business_modules(self):
        call_command("seed_efop_qa", scale=2, verbosity=0)
        first = self.snapshot()
        call_command("seed_efop_qa", scale=2, verbosity=0)
        self.assertEqual(first, self.snapshot())
        self.assertGreaterEqual(first["companies"], 2)
        self.assertGreaterEqual(first["clients"], 8)
        self.assertGreaterEqual(first["suppliers"], 4)
        self.assertGreaterEqual(first["personnel"], 10)
        self.assertGreaterEqual(first["employments"], 10)
        self.assertGreaterEqual(first["payroll"], 10)
        self.assertGreaterEqual(first["cnss"], 10)
        self.assertGreaterEqual(first["accounts"], 4)
        self.assertGreaterEqual(first["transactions"], 10)
        self.assertGreaterEqual(first["records"], 10)
        self.assertGreaterEqual(first["inventory"], 12)
        self.assertGreaterEqual(first["notifications"], 6)
        self.assertGreaterEqual(first["audit"], 2)
        self.assertTrue(Company.objects.filter(trade_name__contains="أطلس").exists())

    @staticmethod
    def snapshot():
        return {
            "companies": Company.all_objects.count(),
            "clients": Client.all_objects.count(),
            "suppliers": Supplier.all_objects.count(),
            "personnel": PersonnelPerson.all_objects.count(),
            "employments": Employment.all_objects.count(),
            "payroll": MonthlyPayrollRecord.all_objects.count(),
            "cnss": CNSSDeclaration.all_objects.count(),
            "accounts": Account.all_objects.count(),
            "transactions": Transaction.all_objects.count(),
            "records": FinancialRecord.all_objects.count(),
            "inventory": InventoryItem.all_objects.count(),
            "notifications": Notification.objects.count(),
            "audit": AuditEvent.objects.count(),
        }
