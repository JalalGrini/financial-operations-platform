"""Idempotent, non-destructive EFOP reference-data/bootstrap command."""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)
from apps.financial_records.models import FinancialDocumentTemplate
from apps.financial_records.services import create_template, publish_template
from apps.parties.models import AssociatedPersonType

User = get_user_model()
ROLE_NAMES = ("Administrator", "Assistant", "Director")


class Command(BaseCommand):
    help = (
        "Idempotently create EFOP roles and baseline reference data. "
        "Safe for existing databases; never deletes rows."
    )

    def add_arguments(self, parser):
        parser.add_argument("--admin-email", default="")
        parser.add_argument("--admin-first-name", default="EFOP")
        parser.add_argument("--admin-last-name", default="Administrator")
        parser.add_argument(
            "--password-env",
            default="EFOP_BOOTSTRAP_ADMIN_PASSWORD",
            help="Environment variable containing the password; never pass passwords on the command line.",
        )
        parser.add_argument("--make-superuser", action="store_true")
        parser.add_argument("--update-password", action="store_true")

    @staticmethod
    def _ensure(model, *, lookup, defaults, audit_user=None):
        manager = getattr(model, "all_objects", model._default_manager)
        instance = manager.filter(**lookup).first()
        created = False
        if instance is None:
            values = dict(defaults)
            if audit_user is not None and hasattr(model, "created_by"):
                values.setdefault("created_by", audit_user)
                values.setdefault("updated_by", audit_user)
            instance = model.objects.create(**lookup, **values)
            created = True
        elif getattr(instance, "is_archived", False):
            instance.restore()
        return instance, created

    @transaction.atomic
    def _bootstrap_admin(self, options, admin_group):
        email = options["admin_email"].strip().lower()
        if not email:
            return User.objects.filter(is_superuser=True).first()
        password = os.environ.get(options["password_env"], "")
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            if not password:
                raise CommandError(
                    f"{options['password_env']} must be set to create {email}. "
                    "Do not put the password in shell history."
                )
            creator = (
                User.objects.create_superuser
                if options["make_superuser"]
                else User.objects.create_user
            )
            user = creator(
                email=email,
                password=password,
                first_name=options["admin_first_name"],
                last_name=options["admin_last_name"],
            )
            self.stdout.write(self.style.SUCCESS(f"Created administrator account {email}"))
        else:
            changed = []
            if options["make_superuser"]:
                if not user.is_staff:
                    user.is_staff = True
                    changed.append("is_staff")
                if not user.is_superuser:
                    user.is_superuser = True
                    changed.append("is_superuser")
            if options["update_password"]:
                if not password:
                    raise CommandError(
                        f"{options['password_env']} must be set with --update-password."
                    )
                user.set_password(password)
                changed.append("password")
            if changed:
                user.save()
                self.stdout.write(self.style.WARNING(f"Updated {email}: {', '.join(changed)}"))
        user.groups.add(admin_group)
        return user

    @transaction.atomic
    def handle(self, *args, **options):
        groups = {}
        created_count = 0
        for name in ROLE_NAMES:
            groups[name], created = Group.objects.get_or_create(name=name)
            created_count += int(created)

        audit_user = self._bootstrap_admin(options, groups["Administrator"])

        categories = {}
        for name, defaults in {
            "Income": {
                "description": "Incoming financial activity",
                "is_income": True,
                "color": "#16A34A",
                "display_order": 10,
            },
            "Expenses": {
                "description": "Operating and other expenses",
                "is_expense": True,
                "color": "#DC2626",
                "display_order": 20,
            },
            "Transfers": {
                "description": "Internal money transfers",
                "is_transfer": True,
                "color": "#2563EB",
                "display_order": 30,
            },
        }.items():
            categories[name], created = self._ensure(
                Category,
                lookup={"name": name, "parent": None},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        payment_methods = {}
        for name, defaults in {
            "Cash": {"kind": "cash", "requires_reference": False, "display_order": 10},
            "Bank Transfer": {
                "kind": "bank_transfer",
                "is_electronic": True,
                "requires_bank_details": True,
                "requires_reference": True,
                "display_order": 20,
            },
            "Cheque": {"kind": "cheque", "requires_reference": True, "display_order": 30},
            "Card": {
                "kind": "card",
                "is_electronic": True,
                "requires_reference": True,
                "display_order": 40,
            },
        }.items():
            payment_methods[name], created = self._ensure(
                PaymentMethod,
                lookup={"name": name},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        record_types = {}
        record_type_data = {
            "Sales Invoice": {
                "nature": "income",
                "direction": "inbound",
                "default_category": categories["Income"],
                "reference_prefix": "SI",
                "display_order": 10,
            },
            "Purchase Invoice": {
                "nature": "expense",
                "direction": "outbound",
                "default_category": categories["Expenses"],
                "reference_prefix": "PI",
                "display_order": 20,
            },
            "General Expense": {
                "nature": "expense",
                "direction": "outbound",
                "default_category": categories["Expenses"],
                "reference_prefix": "EXP",
                "display_order": 30,
            },
            "Credit Note": {
                "nature": "adjustment",
                "direction": "inbound",
                "reference_prefix": "CN",
                "display_order": 40,
            },
        }
        for name, defaults in record_type_data.items():
            record_types[name], created = self._ensure(
                FinancialRecordType,
                lookup={"name": name},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        transaction_data = {
            "Deposit": {
                "nature": "credit",
                "direction": "inbound",
                "requires_payment_method": True,
                "display_order": 10,
            },
            "Payment": {
                "nature": "debit",
                "direction": "outbound",
                "requires_payment_method": True,
                "display_order": 20,
            },
            "Internal Transfer": {
                "nature": "both",
                "direction": "internal",
                "is_transfer": True,
                "requires_payment_method": False,
                "display_order": 30,
            },
            "Opening Balance": {
                "nature": "both",
                "direction": "internal",
                "is_opening_balance": True,
                "requires_payment_method": False,
                "is_system": True,
                "display_order": 40,
            },
        }
        for name, defaults in transaction_data.items():
            _obj, created = self._ensure(
                TransactionType,
                lookup={"name": name},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        for name, defaults in {
            "Income Statement": {
                "frequency": "monthly",
                "export_formats": ["pdf", "excel", "csv"],
                "display_order": 10,
            },
            "Cash Flow": {
                "frequency": "monthly",
                "export_formats": ["pdf", "excel", "csv"],
                "display_order": 20,
            },
            "Expense Report": {
                "frequency": "on_demand",
                "export_formats": ["pdf", "excel", "csv"],
                "display_order": 30,
            },
        }.items():
            _obj, created = self._ensure(
                ReportType,
                lookup={"name": name},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        for name, defaults in {
            "Financial Record Posted": {
                "default_channels": ["in_app"],
                "available_channels": ["in_app", "email"],
                "default_recipient_roles": ["Administrator", "Director"],
                "display_order": 10,
            },
            "Treasury Transfer Completed": {
                "default_channels": ["in_app"],
                "available_channels": ["in_app", "email"],
                "default_recipient_roles": ["Administrator"],
                "display_order": 20,
            },
            "Report Generated": {
                "default_channels": ["in_app"],
                "available_channels": ["in_app", "email"],
                "default_recipient_roles": ["Administrator", "Director"],
                "display_order": 30,
            },
        }.items():
            _obj, created = self._ensure(
                NotificationType,
                lookup={"name": name},
                defaults=defaults,
                audit_user=audit_user,
            )
            created_count += int(created)

        employee_type, created = self._ensure(
            AssociatedPersonType,
            lookup={"name": "Employee"},
            defaults={"description": "Employee or worker", "is_default": True},
            audit_user=audit_user,
        )
        created_count += int(created)
        if not AssociatedPersonType.objects.filter(is_default=True).exists():
            employee_type.is_default = True
            employee_type.save(update_fields=["is_default"])

        template_definitions = {
            "Sales Invoice": [
                {
                    "key": "invoice_number",
                    "label": "Invoice number",
                    "data_type": "string",
                    "is_required": True,
                },
                {
                    "key": "customer_reference",
                    "label": "Customer reference",
                    "data_type": "string",
                    "is_required": False,
                },
                {"key": "due_date", "label": "Due date", "data_type": "date", "is_required": False},
            ],
            "Purchase Invoice": [
                {
                    "key": "supplier_invoice_number",
                    "label": "Supplier invoice number",
                    "data_type": "string",
                    "is_required": True,
                },
                {
                    "key": "purchase_order",
                    "label": "Purchase order",
                    "data_type": "string",
                    "is_required": False,
                },
                {"key": "due_date", "label": "Due date", "data_type": "date", "is_required": False},
            ],
            "General Expense": [
                {
                    "key": "expense_purpose",
                    "label": "Expense purpose",
                    "data_type": "text",
                    "is_required": True,
                },
                {
                    "key": "receipt_number",
                    "label": "Receipt number",
                    "data_type": "string",
                    "is_required": False,
                },
            ],
        }
        for type_name, fields in template_definitions.items():
            record_type = record_types[type_name]
            has_active = FinancialDocumentTemplate.objects.filter(
                record_type=record_type,
                status=FinancialDocumentTemplate.Status.PUBLISHED,
                is_default=True,
            ).exists()
            if not has_active:
                template = create_template(
                    record_type=record_type,
                    name=f"{type_name} Standard",
                    description="EFOP baseline published template",
                    fields=[
                        {**field, "display_order": index} for index, field in enumerate(fields)
                    ],
                    user=audit_user,
                )
                publish_template(template=template, user=audit_user, is_default=True)
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"EFOP bootstrap complete: {created_count} rows/versions created; existing data preserved."
            )
        )
