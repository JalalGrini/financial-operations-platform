# apps/extensibility/tests/test_extensibility.py
"""
Tests for the two things that must work after deployment without a code release:
importing templates, and adding attributes to entities.

The emphasis is on refusal. An extensibility system that accepts anything is
worse than none at all, because it turns a typo in a JSON file into silently
wrong business configuration.
"""

import json
import tempfile
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import Category, FinancialRecordType
from apps.extensibility.models import CustomFieldDefinition, TemplateImportLog
from apps.extensibility.services import (
    export_template_bundle,
    import_template_bundle,
    set_custom_fields,
)

User = get_user_model()


class ExtensibilityTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="ext-tester@example.com",
            password="testpass123",
            first_name="Ext",
            last_name="Tester",
        )

    def bundle(self, **overrides):
        base = {
            "bundle": "Test chart",
            "version": "1.0",
            "templates": {
                "configuration.FinancialRecordType": [
                    {
                        "name": "Fuel Expense",
                        "description": "Vehicle fuel",
                        "nature": "expense",
                        "direction": "outbound",
                    }
                ]
            },
        }
        base.update(overrides)
        return base


class TemplateImportTests(ExtensibilityTestBase):
    """Importing business templates into a running deployment."""

    def test_a_bundle_creates_templates(self):
        summary = import_template_bundle(bundle=self.bundle(), user=self.user)

        self.assertEqual(summary["created"], 1)
        self.assertTrue(FinancialRecordType.objects.filter(name="Fuel Expense").exists())

    def test_reimporting_updates_instead_of_duplicating(self):
        """The realistic case is importing a corrected version of a bundle."""
        import_template_bundle(bundle=self.bundle(), user=self.user)

        revised = self.bundle()
        revised["templates"]["configuration.FinancialRecordType"][0][
            "description"
        ] = "Corrected description"
        summary = import_template_bundle(bundle=revised, user=self.user)

        self.assertEqual(summary["created"], 0)
        self.assertEqual(summary["updated"], 1)
        self.assertEqual(FinancialRecordType.objects.filter(name="Fuel Expense").count(), 1)
        self.assertEqual(
            FinancialRecordType.objects.get(name="Fuel Expense").description,
            "Corrected description",
        )

    def test_dry_run_changes_nothing(self):
        summary = import_template_bundle(bundle=self.bundle(), user=self.user, dry_run=True)

        self.assertEqual(summary["created"], 1)
        self.assertFalse(
            FinancialRecordType.objects.filter(name="Fuel Expense").exists(),
            "A dry run must leave the database exactly as it found it.",
        )

    def test_dry_run_leaves_no_log_row_either(self):
        import_template_bundle(bundle=self.bundle(), user=self.user, dry_run=True)
        self.assertEqual(TemplateImportLog.objects.count(), 0)

    def test_a_real_import_is_logged(self):
        import_template_bundle(bundle=self.bundle(), user=self.user, source="chart.json")
        log = TemplateImportLog.objects.get()

        self.assertEqual(log.bundle_name, "Test chart")
        self.assertEqual(log.created_count, 1)
        self.assertEqual(log.source, "chart.json")
        self.assertEqual(log.created_by, self.user)

    def test_a_failing_entry_rolls_back_the_whole_bundle(self):
        """Half-applied business configuration is a state nobody designed."""
        bundle = self.bundle()
        bundle["templates"]["configuration.FinancialRecordType"].append(
            {"name": "Broken", "nature": "not-a-valid-nature"}
        )

        with self.assertRaises(ValidationError):
            import_template_bundle(bundle=bundle, user=self.user)

        self.assertFalse(
            FinancialRecordType.objects.filter(name="Fuel Expense").exists(),
            "The valid entry must not survive a failed bundle.",
        )

    def test_unlisted_models_are_refused(self):
        """Import writes to the database, so it must not address any model."""
        bundle = self.bundle(
            templates={"accounts.User": [{"name": "attacker", "is_superuser": True}]}
        )

        with self.assertRaises(ValidationError) as caught:
            import_template_bundle(bundle=bundle, user=self.user)

        self.assertIn("not an importable template model", str(caught.exception))

    def test_protected_fields_cannot_be_set_by_a_bundle(self):
        """A file must not be able to forge audit trails or ids."""
        bundle = self.bundle()
        bundle["templates"]["configuration.FinancialRecordType"][0]["created_by"] = "someone-else"

        with self.assertRaises(ValidationError) as caught:
            import_template_bundle(bundle=bundle, user=self.user)

        self.assertIn("protected", str(caught.exception).lower())

    def test_unknown_fields_are_refused_not_ignored(self):
        bundle = self.bundle()
        bundle["templates"]["configuration.FinancialRecordType"][0]["colour"] = "blue"

        with self.assertRaises(ValidationError):
            import_template_bundle(bundle=bundle, user=self.user)

    def test_entries_must_have_a_name(self):
        bundle = self.bundle(templates={"configuration.Category": [{"description": "nameless"}]})
        with self.assertRaises(ValidationError):
            import_template_bundle(bundle=bundle, user=self.user)

    def test_an_empty_bundle_is_refused(self):
        with self.assertRaises(ValidationError):
            import_template_bundle(bundle={"bundle": "x"}, user=self.user)

    def test_multiple_model_types_in_one_bundle(self):
        bundle = self.bundle(
            templates={
                "configuration.Category": [
                    {"name": "Vehicles", "is_expense": True},
                ],
                "configuration.FinancialRecordType": [
                    {"name": "Toll Charge", "nature": "expense"},
                ],
            }
        )
        summary = import_template_bundle(bundle=bundle, user=self.user)
        self.assertEqual(summary["created"], 2)


class TemplateExportTests(ExtensibilityTestBase):
    def test_export_round_trips_through_import(self):
        """Export from one environment, import into another."""
        import_template_bundle(bundle=self.bundle(), user=self.user)

        exported = export_template_bundle(model_labels=["configuration.FinancialRecordType"])
        FinancialRecordType.all_objects.all().delete()

        summary = import_template_bundle(bundle=exported, user=self.user)
        self.assertGreaterEqual(summary["created"], 1)
        self.assertTrue(FinancialRecordType.objects.filter(name="Fuel Expense").exists())

    def test_export_is_json_serialisable(self):
        """An export nobody can write to a file is not an export."""
        import_template_bundle(bundle=self.bundle(), user=self.user)
        exported = export_template_bundle(model_labels=["configuration.FinancialRecordType"])
        json.dumps(exported, default=str)


class ManagementCommandTests(ExtensibilityTestBase):
    """The path an administrator actually uses on a deployed system."""

    def _write_bundle(self, bundle):
        handle = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(bundle, handle)
        handle.close()
        return Path(handle.name)

    def test_command_imports_a_file(self):
        path = self._write_bundle(self.bundle())
        call_command("import_templates", str(path))
        self.assertTrue(FinancialRecordType.objects.filter(name="Fuel Expense").exists())

    def test_command_dry_run_saves_nothing(self):
        path = self._write_bundle(self.bundle())
        call_command("import_templates", str(path), "--dry-run")
        self.assertFalse(FinancialRecordType.objects.filter(name="Fuel Expense").exists())

    def test_command_reports_a_missing_file_clearly(self):
        with self.assertRaises(CommandError):
            call_command("import_templates", "/tmp/does-not-exist-at-all.json")

    def test_command_rejects_malformed_json(self):
        handle = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        handle.write("{not json")
        handle.close()

        with self.assertRaises(CommandError):
            call_command("import_templates", handle.name)


class CustomFieldDefinitionTests(ExtensibilityTestBase):
    """Defining a new attribute on an entity at runtime."""

    def make_definition(self, **overrides):
        values = {
            "entity": "companies.Company",
            "key": "domains",
            "label": "Business domains",
            "data_type": CustomFieldDefinition.DataType.STRING,
            "created_by": self.user,
        }
        values.update(overrides)
        definition = CustomFieldDefinition(**values)
        definition.full_clean()
        definition.save()
        return definition

    def test_an_attribute_can_be_added_without_a_migration(self):
        """The whole point: this is an INSERT, not a schema change."""
        definition = self.make_definition()
        self.assertEqual(str(definition), "companies.Company.domains")

    def test_an_attribute_cannot_shadow_a_real_column(self):
        """A shadowing attribute would be written and never read back."""
        with self.assertRaises(ValidationError) as caught:
            self.make_definition(key="name")
        self.assertIn("key", caught.exception.message_dict)

    def test_unsupported_entities_are_refused(self):
        with self.assertRaises(ValidationError):
            self.make_definition(entity="accounts.User")

    def test_keys_must_be_valid_identifiers(self):
        with self.assertRaises(ValidationError):
            self.make_definition(key="business domains")

    def test_choice_attributes_must_define_choices(self):
        with self.assertRaises(ValidationError):
            self.make_definition(key="sector", data_type=CustomFieldDefinition.DataType.CHOICE)

    def test_the_same_key_cannot_be_defined_twice_for_one_entity(self):
        self.make_definition()
        # full_clean validates the unique constraint, so this surfaces as a
        # ValidationError rather than reaching the database.
        with self.assertRaises(ValidationError):
            self.make_definition()


class CustomFieldValueTests(ExtensibilityTestBase):
    """Storing and validating values for administrator-defined attributes."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.company = Company.objects.create(name="Extensible Co", created_by=cls.user)

    def define(self, **overrides):
        values = {
            "entity": "companies.Company",
            "key": "domains",
            "label": "Business domains",
            "data_type": CustomFieldDefinition.DataType.STRING,
            "created_by": self.user,
        }
        values.update(overrides)
        return CustomFieldDefinition.objects.create(**values)

    def test_a_value_can_be_stored_and_read_back(self):
        self.define()
        set_custom_fields(instance=self.company, values={"domains": "Transport"})

        self.company.refresh_from_db()
        self.assertEqual(self.company.get_custom("domains"), "Transport")

    def test_undefined_attributes_are_refused(self):
        """Silently dropping a typo would look like a successful save."""
        self.define()
        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"domians": "typo"})

    def test_partial_updates_do_not_erase_other_attributes(self):
        self.define()
        self.define(key="region", label="Region")

        set_custom_fields(instance=self.company, values={"domains": "Transport"})
        set_custom_fields(instance=self.company, values={"region": "Casablanca"})

        self.company.refresh_from_db()
        self.assertEqual(self.company.get_custom("domains"), "Transport")
        self.assertEqual(self.company.get_custom("region"), "Casablanca")

    def test_money_attributes_reject_json_floats(self):
        """A JSON number is a float, and floats lose money."""
        self.define(key="credit_limit", data_type=CustomFieldDefinition.DataType.DECIMAL)

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"credit_limit": 1500.10})

    def test_money_attributes_keep_full_precision_as_strings(self):
        self.define(key="credit_limit", data_type=CustomFieldDefinition.DataType.DECIMAL)
        set_custom_fields(instance=self.company, values={"credit_limit": "1500.1000"})

        self.company.refresh_from_db()
        stored = self.company.get_custom("credit_limit")
        self.assertIsInstance(stored, str)
        self.assertEqual(Decimal(stored), Decimal("1500.1000"))

    def test_integer_attributes_reject_booleans(self):
        """bool is a subclass of int; accepting True as 1 hides a form bug."""
        self.define(key="headcount", data_type=CustomFieldDefinition.DataType.INTEGER)

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"headcount": True})

    def test_choice_attributes_reject_values_outside_the_list(self):
        self.define(
            key="sector",
            data_type=CustomFieldDefinition.DataType.CHOICE,
            choices=["Transport", "Retail"],
        )

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"sector": "Mining"})

        set_custom_fields(instance=self.company, values={"sector": "Retail"})
        self.assertEqual(self.company.get_custom("sector"), "Retail")

    def test_multi_choice_attributes_accept_lists(self):
        self.define(
            key="sectors",
            data_type=CustomFieldDefinition.DataType.MULTI_CHOICE,
            choices=["Transport", "Retail", "Energy"],
        )
        set_custom_fields(instance=self.company, values={"sectors": ["Transport", "Energy"]})

        self.company.refresh_from_db()
        self.assertEqual(self.company.get_custom("sectors"), ["Transport", "Energy"])

    def test_required_attributes_are_enforced(self):
        self.define(key="tax_regime", is_required=True)

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={})

    def test_defaults_are_applied_when_absent(self):
        self.define(key="tax_regime", default_value="Standard")
        set_custom_fields(instance=self.company, values={})

        self.company.refresh_from_db()
        self.assertEqual(self.company.get_custom("tax_regime"), "Standard")

    def test_dates_must_be_iso_formatted(self):
        self.define(key="licensed_on", data_type=CustomFieldDefinition.DataType.DATE)

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"licensed_on": "06/08/2026"})

    def test_emails_and_urls_are_validated(self):
        self.define(key="contact", data_type=CustomFieldDefinition.DataType.EMAIL)
        self.define(key="site", data_type=CustomFieldDefinition.DataType.URL)

        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"contact": "not-an-email"})
        with self.assertRaises(ValidationError):
            set_custom_fields(instance=self.company, values={"site": "not a url"})

    def test_deactivated_attributes_stop_accepting_values_but_keep_data(self):
        """Deactivating must not destroy what was already recorded."""
        definition = self.define()
        set_custom_fields(instance=self.company, values={"domains": "Transport"})

        definition.is_active = False
        definition.save()

        self.company.refresh_from_db()
        self.assertEqual(
            self.company.custom_fields.get("domains"),
            "Transport",
            "Stored values must survive deactivation.",
        )


class CustomFieldsOnFinancialRecordsTests(ExtensibilityTestBase):
    """The mixin is shared, so it must work on more than one entity."""

    def test_financial_records_accept_custom_attributes(self):
        from datetime import date

        from apps.financial_records.services import create_record

        company = Company.objects.create(name="FR Custom Co", created_by=self.user)
        record_type = FinancialRecordType.objects.create(
            name="Custom Invoice", created_by=self.user
        )
        CustomFieldDefinition.objects.create(
            entity="financial_records.FinancialRecord",
            key="purchase_order",
            label="Purchase order",
            created_by=self.user,
        )

        record = create_record(
            company=company,
            record_type=record_type,
            record_date=date(2026, 8, 6),
            description="With PO",
            user=self.user,
        )
        set_custom_fields(instance=record, values={"purchase_order": "PO-4471"})

        record.refresh_from_db()
        self.assertEqual(record.get_custom("purchase_order"), "PO-4471")


class CategoryTemplateTests(ExtensibilityTestBase):
    def test_categories_import_as_templates(self):
        bundle = self.bundle(
            templates={
                "configuration.Category": [
                    {"name": "Fuel", "is_expense": True},
                    {"name": "Sales", "is_expense": False},
                ]
            }
        )
        import_template_bundle(bundle=bundle, user=self.user)
        self.assertEqual(Category.objects.filter(name__in=["Fuel", "Sales"]).count(), 2)
