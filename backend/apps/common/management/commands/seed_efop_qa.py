"""Large deterministic, idempotent QA dataset for disposable local databases only."""

import os
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.audit_log.models import AuditEvent
from apps.collaboration.models import Notification
from apps.companies.models import Company, CompanySettings
from apps.configuration.models import Category, FinancialRecordType, PaymentMethod, TransactionType
from apps.financial_records.models import FinancialRecord, FinancialRecordLine
from apps.inventory.models import InventoryCategory, InventoryItem, InventoryMovement
from apps.parties.models import Client, Supplier
from apps.personnel.models import (
    CNSSDeclaration,
    CNSSMonthlyDeclaration,
    Employment,
    EmploymentSalary,
    MonthlyPayrollRecord,
    PayrollAdjustment,
    PayrollPayment,
    PersonnelPerson,
)
from apps.treasury.models import Account, Transaction
from apps.treasury.services import create_account

User = get_user_model()

CITIES = ("Casablanca", "Rabat", "Marrakech", "Tangier", "Agadir", "Fes")
DEPARTMENTS = ("Finance", "Operations", "Sales", "Human Resources", "Logistics", "Technology")
ARABIC_NOTE = "بيانات اختبار عربية طويلة للتحقق من اتجاه النص وتخطيط الهاتف المحمول."
FRENCH_NOTE = "Données de test françaises longues pour vérifier les formulaires, tableaux et retours à la ligne."


class Command(BaseCommand):
    help = "Create a large deterministic QA dataset in an explicitly disposable local database."

    def add_arguments(self, parser):
        parser.add_argument("--scale", type=int, default=20, help="Number of QA companies (1-100).")
        parser.add_argument("--create-login-users", action="store_true")
        parser.add_argument("--password-env", default="EFOP_QA_USER_PASSWORD")

    @staticmethod
    def ensure(model, lookup, defaults):
        manager = getattr(model, "all_objects", model._default_manager)
        obj = manager.filter(**lookup).first()
        if obj is None:
            obj = model.objects.create(**lookup, **defaults)
        elif getattr(obj, "is_archived", False):
            obj.restore()
        return obj

    def verify_environment(self):
        module = os.environ.get("DJANGO_SETTINGS_MODULE", "").lower()
        database = settings.DATABASES["default"]
        name = str(database.get("NAME", "")).lower()
        host = str(database.get("HOST", "")).lower()
        is_test_module = "test" in module
        if (not settings.DEBUG and not is_test_module) or not any(
            token in module for token in ("development", "test", "qa")
        ):
            raise CommandError(
                "QA seeding is refused outside DEBUG development/qa or explicit test settings."
            )
        if any(
            token in module or token in name
            for token in ("prod", "production", "stage", "staging", "live")
        ):
            raise CommandError("QA seeding is refused for production/staging/live targets.")
        if name != ":memory:" and not any(
            token in name for token in ("dev", "test", "qa", "local", "memorydb")
        ):
            raise CommandError("QA database name must contain dev, test, qa, or local.")
        if host not in ("", "localhost", "127.0.0.1", "::1", "postgres", "db"):
            raise CommandError("QA seeding is refused for remote databases.")

    @transaction.atomic
    def ensure_users(self, create_login_users, password_env):
        password = os.environ.get(password_env, "")
        if create_login_users and not password:
            raise CommandError(f"{password_env} must be set when --create-login-users is used.")
        users = []
        for index, role in enumerate(("Administrator", "Assistant", "Director"), start=1):
            email = f"qa.{role.lower()}@example.invalid"
            user = User.objects.filter(email__iexact=email).first()
            if user is None:
                user = User(email=email, first_name="QA", last_name=role, is_active=True)
                user.set_password(password) if create_login_users else user.set_unusable_password()
                user.save()
            elif create_login_users:
                user.set_password(password)
                user.save(update_fields=["password"])
            user.groups.add(Group.objects.get(name=role))
            users.append(user)
        return users

    @transaction.atomic
    def handle(self, *args, **options):
        self.verify_environment()
        scale = options["scale"]
        if not 1 <= scale <= 100:
            raise CommandError("--scale must be between 1 and 100.")
        call_command("bootstrap_efop", verbosity=0)
        users = self.ensure_users(options["create_login_users"], options["password_env"])
        actor = users[0]
        bank_transfer = PaymentMethod.objects.get(name="Bank Transfer")
        cash_method = PaymentMethod.objects.get(name="Cash")
        income_type = FinancialRecordType.objects.get(name="Sales Invoice")
        expense_type = FinancialRecordType.objects.get(name="General Expense")
        income_category = Category.objects.get(name="Income", parent=None)
        expense_category = Category.objects.get(name="Expenses", parent=None)
        deposit_type = TransactionType.objects.get(name="Deposit")
        payment_type = TransactionType.objects.get(name="Payment")

        for i in range(1, scale + 1):
            code = f"{i:03d}"
            company = self.ensure(
                Company,
                {"registration_number": f"RC-QA-{code}"},
                {
                    "name": f"QA Entreprise Atlas {code} SARL",
                    "trade_name": f"أطلس للاختبار {code}",
                    "tax_id": f"IF-QA-{code}",
                    "vat_number": f"ICE-QA-{code}",
                    "email": f"finance{code}@example.invalid",
                    "phone": f"+2126000{i:05d}",
                    "address": f"{i} Boulevard QA, {CITIES[(i-1)%len(CITIES)]}. {FRENCH_NOTE}",
                    "status": "active" if i % 7 else "inactive",
                    "observations": ARABIC_NOTE,
                    "created_by": actor,
                },
            )
            CompanySettings.objects.get_or_create(company=company, defaults={"created_by": actor})

            clients = []
            for j in range(1, 5):
                client = self.ensure(
                    Client,
                    {"registration_number": f"RC-QA-CLI-{code}-{j:02d}"},
                    {
                        "company": company,
                        "client_kind": "organization",
                        "name": f"Client QA {code}-{j:02d}",
                        "trade_name": f"عميل تجريبي {code}-{j:02d}",
                        "tax_id": f"IF-QA-CLI-{code}-{j:02d}",
                        "email": f"client{code}{j:02d}@example.invalid",
                        "phone": f"+212610{i:03d}{j:03d}",
                        "address": FRENCH_NOTE,
                        "credit_limit": Decimal(5000 + j * 2500),
                        "payment_terms": "30 days",
                        "status": "active",
                        "created_by": actor,
                    },
                )
                clients.append(client)
            suppliers = []
            for j in range(1, 3):
                supplier = self.ensure(
                    Supplier,
                    {"registration_number": f"RC-QA-SUP-{code}-{j:02d}"},
                    {
                        "company": company,
                        "name": f"Fournisseur QA {code}-{j:02d}",
                        "trade_name": f"مورد تجريبي {code}-{j:02d}",
                        "tax_id": f"IF-QA-SUP-{code}-{j:02d}",
                        "email": f"supplier{code}{j:02d}@example.invalid",
                        "phone": f"+212620{i:03d}{j:03d}",
                        "address": ARABIC_NOTE,
                        "payment_terms": "45 days",
                        "status": "active",
                        "created_by": actor,
                    },
                )
                suppliers.append(supplier)

            accounts = []
            for name, kind, balance in (
                (f"QA Bank {code}", "bank", Decimal("250000")),
                (f"QA Cash {code}", "cash", Decimal("15000")),
            ):
                account = Account.all_objects.filter(company=company, name=name).first()
                if account is None:
                    account = create_account(
                        company=company,
                        name=name,
                        user=actor,
                        kind=kind,
                        currency="MAD",
                        opening_balance=balance,
                        notes=FRENCH_NOTE,
                    )
                elif account.is_archived:
                    account.restore()
                accounts.append(account)

            people = []
            employments = []
            for j in range(1, 6):
                person = self.ensure(
                    PersonnelPerson,
                    {"cin": f"QA-CIN-{code}-{j:02d}"},
                    {
                        "first_name": ("Yasmine", "Omar", "Salma", "Amine", "Nadia")[j - 1],
                        "last_name": f"Employé QA {code}-{j:02d}",
                        "phone": f"+212630{i:03d}{j:03d}",
                        "email": f"employee{code}{j:02d}@example.invalid",
                        "address": ARABIC_NOTE,
                        "city": CITIES[(i + j) % len(CITIES)],
                        "nationality": "Moroccan",
                        "notes": FRENCH_NOTE,
                        "status": "active",
                        "created_by": actor,
                    },
                )
                people.append(person)
                employment = self.ensure(
                    Employment,
                    {"employee_reference": f"EMP-QA-{code}-{j:02d}"},
                    {
                        "person": person,
                        "company": company,
                        "job_title": f"QA {DEPARTMENTS[(j-1)%len(DEPARTMENTS)]} Specialist",
                        "department": DEPARTMENTS[(j - 1) % len(DEPARTMENTS)],
                        "work_city": CITIES[(i + j) % len(CITIES)],
                        "employment_status": "active",
                        "contract_type": "permanent" if j % 2 else "fixed_term",
                        "hire_date": date(2024 + i % 2, ((j - 1) % 12) + 1, min(j + 3, 28)),
                        "is_active": True,
                        "payment_method": bank_transfer,
                        "bank_name": "QA Banque",
                        "bank_account_holder": person.get_full_name(),
                        "default_monthly_working_days": 26,
                        "default_cnss_declared_days": 26,
                        "observations": ARABIC_NOTE,
                        "created_by": actor,
                    },
                )
                employments.append(employment)
                self.ensure(
                    EmploymentSalary,
                    {"employment": employment, "effective_from": date(2025, 1, 1)},
                    {
                        "fixed_monthly_gross_salary": Decimal(7000 + j * 1500 + i * 25),
                        "reason": "QA baseline salary",
                        "notes": FRENCH_NOTE,
                        "is_current": True,
                        "created_by": actor,
                    },
                )
                payroll = self.ensure(
                    MonthlyPayrollRecord,
                    {"reference": f"PAY-QA-{code}-{j:02d}-2026-07"},
                    {
                        "employment": employment,
                        "year": 2026,
                        "month": 7,
                        "period_start": date(2026, 7, 1),
                        "period_end": date(2026, 7, 31),
                        "scheduled_working_days": 26,
                        "worked_days": 25,
                        "absence_days": 1,
                        "declared_days": 26,
                        "gross_salary_snapshot": Decimal(7000 + j * 1500 + i * 25),
                        "daily_rate": Decimal("350"),
                        "absence_deduction": Decimal("350"),
                        "supplements_total": Decimal("500"),
                        "other_deductions_total": Decimal("100"),
                        "calculated_net_salary": Decimal(7050 + j * 1500 + i * 25),
                        "total_paid": Decimal("3000"),
                        "remaining_amount": Decimal(4050 + j * 1500 + i * 25),
                        "payment_status": "partially_paid",
                        "status": "calculated",
                        "notes": ARABIC_NOTE,
                        "created_by": actor,
                    },
                )
                self.ensure(
                    PayrollAdjustment,
                    {"payroll_record": payroll, "reference": f"ADJ-QA-{code}-{j:02d}"},
                    {
                        "adjustment_type": "bonus",
                        "direction": "addition",
                        "amount": Decimal("500"),
                        "description": "QA performance bonus",
                        "effective_date": date(2026, 7, 31),
                        "notes": FRENCH_NOTE,
                        "created_by": actor,
                    },
                )
                self.ensure(
                    PayrollPayment,
                    {"payroll_record": payroll, "reference": f"PP-QA-{code}-{j:02d}"},
                    {
                        "payment_date": date(2026, 7, 28),
                        "amount": Decimal("3000"),
                        "payment_method": bank_transfer,
                        "payment_kind": "partial_payment",
                        "notes": ARABIC_NOTE,
                        "status": "recorded",
                        "created_by": actor,
                    },
                )
                cnss = self.ensure(
                    CNSSDeclaration,
                    {"reference": f"CNSS-QA-{code}-{j:02d}"},
                    {
                        "person": person,
                        "company": company,
                        "employment": employment,
                        "cnss_registration_number": f"CNSS{code}{j:02d}",
                        "cin_snapshot": person.cin,
                        "situation": "declared_by_this_company",
                        "is_currently_declared": True,
                        "first_declaration_date": date(2025, 1, 1),
                        "declaration_start_date": date(2025, 1, 1),
                        "notes": FRENCH_NOTE,
                        "created_by": actor,
                    },
                )
                self.ensure(
                    CNSSMonthlyDeclaration,
                    {"cnss_declaration": cnss, "year": 2026, "month": 7},
                    {
                        "declared_days": 26,
                        "declared_salary": Decimal(7000 + j * 1500 + i * 25),
                        "situation": "active",
                        "status": "submitted",
                        "reference": f"CNSSM-QA-{code}-{j:02d}",
                        "notes": ARABIC_NOTE,
                        "created_by": actor,
                    },
                )

            inventory_categories = []
            for j, (name, item_type) in enumerate(
                (("IT Equipment", "fixed_asset"), ("Office Supplies", "consumable")), start=1
            ):
                inventory_categories.append(
                    self.ensure(
                        InventoryCategory,
                        {"company": company, "name": name},
                        {
                            "item_type": item_type,
                            "description": FRENCH_NOTE,
                            "created_by": actor,
                        },
                    )
                )
            for j in range(1, 7):
                item_type = "fixed_asset" if j <= 3 else "consumable"
                item = self.ensure(
                    InventoryItem,
                    {"company": company, "sku": f"SKU-QA-{code}-{j:03d}"},
                    {
                        "category": inventory_categories[0 if j <= 3 else 1],
                        "item_type": item_type,
                        "name": f"QA Inventory Item {code}-{j:03d}",
                        "asset_tag": f"ASSET-QA-{code}-{j:03d}" if j <= 3 else "",
                        "description": ARABIC_NOTE,
                        "quantity": Decimal(1 if j <= 3 else 50 + j),
                        "unit": "unit",
                        "purchase_date": date(2026, max(1, j), min(20, j + 5)),
                        "unit_cost": Decimal(3500 if j <= 3 else 35),
                        "supplier": suppliers[(j - 1) % 2],
                        "serial_number": f"SER-QA-{code}-{j:03d}" if j <= 3 else "",
                        "condition": "good",
                        "status": "assigned" if j == 1 else "available",
                        "location": f"QA Office {code}",
                        "responsible_person": people[0] if j == 1 else None,
                        "minimum_stock": Decimal(10) if j > 3 else None,
                        "notes": FRENCH_NOTE,
                        "created_by": actor,
                    },
                )
                self.ensure(
                    InventoryMovement,
                    {"reference": f"MOV-QA-{code}-{j:03d}"},
                    {
                        "item": item,
                        "movement_type": "receipt",
                        "quantity": item.quantity,
                        "quantity_before": Decimal("0"),
                        "quantity_after": item.quantity,
                        "unit_cost": item.unit_cost,
                        "occurred_on": date(2026, max(1, j), min(20, j + 5)),
                        "to_location": item.location,
                        "reason": "Initial QA receipt",
                        "notes": ARABIC_NOTE,
                        "created_by": actor,
                    },
                )

            for j in range(1, 6):
                record_type = income_type if j % 2 else expense_type
                category = income_category if j % 2 else expense_category
                client = clients[(j - 1) % 4] if j % 2 else None
                supplier = suppliers[(j - 1) % 2] if not j % 2 else None
                amount = Decimal(2500 + i * 100 + j * 375)
                record = self.ensure(
                    FinancialRecord,
                    {"reference": f"FR-QA-{code}-{j:03d}"},
                    {
                        "company": company,
                        "record_type": record_type,
                        "category": category,
                        "client": client,
                        "supplier": supplier,
                        "record_date": date(2026, 7, min(25, j * 3)),
                        "description": f"QA financial record {code}-{j:03d}",
                        "notes": FRENCH_NOTE,
                        "currency": "MAD",
                        "total_amount": amount,
                        "status": "posted" if j < 5 else "draft",
                        "created_by": actor,
                    },
                )
                FinancialRecordLine.objects.get_or_create(
                    record=record,
                    line_number=1,
                    defaults={
                        "description": record.description,
                        "category": category,
                        "debit": amount if not j % 2 else Decimal("0"),
                        "credit": amount if j % 2 else Decimal("0"),
                        "created_by": actor,
                    },
                )
                account = accounts[0 if j < 4 else 1]
                self.ensure(
                    Transaction,
                    {"reference": f"TRX-QA-{code}-{j:03d}"},
                    {
                        "account": account,
                        "transaction_type": deposit_type if j % 2 else payment_type,
                        "payment_method": bank_transfer if j < 4 else cash_method,
                        "financial_record": record,
                        "direction": "inbound" if j % 2 else "outbound",
                        "amount": amount,
                        "transaction_date": record.record_date,
                        "description": record.description,
                        "notes": ARABIC_NOTE,
                        "external_reference": f"EXT-QA-{code}-{j:03d}",
                        "status": "posted",
                        "created_by": actor,
                    },
                )

            for recipient in users:
                Notification.objects.get_or_create(
                    recipient=recipient,
                    title=f"QA notification {code} for {recipient.groups.first().name}",
                    defaults={
                        "actor": actor,
                        "company": company,
                        "category": "system",
                        "message": ARABIC_NOTE,
                        "destination": f"/companies/{company.pk}",
                        "metadata": {"qa": True, "company": code},
                    },
                )
            AuditEvent.objects.get_or_create(
                entity_type="company",
                entity_id=str(company.pk),
                action="qa_seed",
                defaults={
                    "actor": actor,
                    "actor_email": actor.email,
                    "actor_role": "Administrator",
                    "company": company,
                    "entity_reference": company.registration_number,
                    "summary": f"Generated deterministic QA company {code}",
                    "after": {"qa": True, "locale_samples": [FRENCH_NOTE, ARABIC_NOTE]},
                    "result": "success",
                },
            )

        # Representative archive/error states without deleting any history.
        if scale >= 2:
            client = (
                Client.objects.filter(registration_number__startswith="RC-QA-CLI-")
                .order_by("registration_number")
                .last()
            )
            if client and not client.is_archived:
                client.archive(user=actor)
        self.stdout.write(
            self.style.SUCCESS(
                f"EFOP QA seed complete for {scale} companies: {scale*4} clients, {scale*2} suppliers, "
                f"{scale*5} personnel/payroll/CNSS chains, {scale*6} inventory items and {scale*5} financial records."
            )
        )
