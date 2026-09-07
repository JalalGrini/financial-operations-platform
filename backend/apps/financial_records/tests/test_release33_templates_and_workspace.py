"""Release 33 regressions for templates, counterparties and detail workspace."""

import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.models import FinancialDocumentTemplate, FinancialRecord
from apps.financial_records.tests.test_api import RECORDS_URL, FinancialRecordAPITestBase
from apps.parties.models import Client, Supplier

TEMPLATES_URL = "/api/v1/financial-records/templates/"
CLIENTS_URL = "/api/v1/parties/clients/"


def error_payload(response):
    data = response.data
    return data.get("errors", data) if isinstance(data, dict) else data


class TemplateContractTests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def create_template(self, record_type, key="invoice_number", label="Invoice number"):
        response = self.client.post(
            TEMPLATES_URL,
            {
                "record_type": str(record_type.id),
                "name": f"{record_type.name} form",
                "description": "Release 33 test template",
                "fields": [
                    {
                        "key": key,
                        "label": label,
                        "data_type": "string",
                        "is_required": True,
                        "display_order": 0,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        template_id = response.data["id"]
        published = self.client.post(
            f"{TEMPLATES_URL}{template_id}/publish/",
            {"is_default": True},
            format="json",
        )
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        return published.data

    def test_record_types_receive_only_their_own_template_fields(self):
        other_type = FinancialRecordType.objects.create(
            name="Release 33 Sales Invoice", created_by=self.admin
        )
        self.create_template(self.record_type, "purchase_order", "Purchase order")
        self.create_template(other_type, "customer_order", "Customer order")

        purchase = self.client.get(
            f"{RECORDS_URL}custom-field-definitions/?record_type={self.record_type.id}"
        )
        sales = self.client.get(
            f"{RECORDS_URL}custom-field-definitions/?record_type={other_type.id}"
        )
        self.assertEqual(purchase.status_code, status.HTTP_200_OK)
        self.assertEqual(sales.status_code, status.HTTP_200_OK)
        purchase_keys = {item["key"] for item in purchase.data["definitions"]}
        sales_keys = {item["key"] for item in sales.data["definitions"]}
        self.assertIn("purchase_order", purchase_keys)
        self.assertNotIn("customer_order", purchase_keys)
        self.assertIn("customer_order", sales_keys)
        self.assertNotIn("purchase_order", sales_keys)

    def test_definitions_require_a_record_type(self):
        response = self.client.get(f"{RECORDS_URL}custom-field-definitions/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("record_type", error_payload(response))

    def test_published_template_cannot_be_patched(self):
        template = self.create_template(self.record_type)
        response = self.client.patch(
            f"{TEMPLATES_URL}{template['id']}/",
            {"name": "Rewriting a published version"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_archives_published_template_without_erasing_history(self):
        payload = self.create_template(self.record_type)
        response = self.client.delete(f"{TEMPLATES_URL}{payload['id']}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        template = FinancialDocumentTemplate.all_objects.get(pk=payload["id"])
        self.assertTrue(template.is_archived)
        self.assertEqual(template.status, "archived")

    def test_invalid_template_values_roll_back_the_whole_record(self):
        self.create_template(self.record_type)
        before = FinancialRecord.all_objects.count()
        response = self.client.post(
            RECORDS_URL,
            self.payload(custom_fields={}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(FinancialRecord.all_objects.count(), before)

    def test_record_retains_old_template_snapshot_after_a_new_version(self):
        template_v1 = self.create_template(self.record_type)
        created = self.client.post(
            RECORDS_URL,
            self.payload(
                template=template_v1["id"],
                custom_fields={"invoice_number": "INV-001"},
            ),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["template_version"], 1)

        cloned = self.client.post(
            f"{TEMPLATES_URL}{template_v1['id']}/new-version/", {}, format="json"
        )
        self.assertEqual(cloned.status_code, status.HTTP_201_CREATED, cloned.data)
        changed = self.client.patch(
            f"{TEMPLATES_URL}{cloned.data['id']}/",
            {
                "fields": [
                    {
                        "key": "new_invoice_number",
                        "label": "New invoice number",
                        "data_type": "string",
                        "is_required": True,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK, changed.data)
        published = self.client.post(
            f"{TEMPLATES_URL}{cloned.data['id']}/publish/", {}, format="json"
        )
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)

        old_record = self.client.get(f"{RECORDS_URL}{created.data['id']}/")
        self.assertEqual(old_record.data["template_version"], 1)
        snapshot_keys = {item["key"] for item in old_record.data["template_snapshot"]["fields"]}
        self.assertIn("invoice_number", snapshot_keys)
        self.assertNotIn("new_invoice_number", snapshot_keys)


class CounterpartyContractTests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_individual_and_organization_clients_can_be_created(self):
        individual = self.client.post(
            CLIENTS_URL,
            {
                "company": str(self.company.id),
                "client_kind": "individual",
                "first_name": "Sara",
                "last_name": "Benali",
                "email": "sara@example.com",
            },
            format="json",
        )
        self.assertEqual(individual.status_code, status.HTTP_201_CREATED, individual.data)
        self.assertEqual(individual.data["name"], "Sara Benali")
        self.assertEqual(individual.data["client_kind"], "individual")

        organization = self.client.post(
            CLIENTS_URL,
            {
                "company": str(self.company.id),
                "client_kind": "organization",
                "name": "Atlas Services SARL",
                "registration_number": "RC-R33-001",
            },
            format="json",
        )
        self.assertEqual(organization.status_code, status.HTTP_201_CREATED, organization.data)
        self.assertEqual(organization.data["client_kind"], "organization")

    def test_missing_kind_specific_identity_is_a_field_error(self):
        response = self.client.post(
            CLIENTS_URL,
            {"company": str(self.company.id), "client_kind": "individual"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("first_name", error_payload(response))
        self.assertIn("last_name", error_payload(response))

    def test_record_accepts_client_and_supplier_arguments_without_500(self):
        client = Client.objects.create(
            company=self.company,
            client_kind="organization",
            name="Release 33 Customer",
            created_by=self.admin,
        )
        supplier = Supplier.objects.create(
            company=self.company,
            name="Release 33 Supplier",
            created_by=self.admin,
        )
        response = self.client.post(
            RECORDS_URL,
            self.payload(client=str(client.id), supplier=str(supplier.id)),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["client"], str(client.id))
        self.assertEqual(response.data["supplier"], str(supplier.id))

    def test_counterparty_from_another_company_is_rejected_with_400(self):
        other_company = Company.objects.create(name="Other Release 33 Co", created_by=self.admin)
        foreign_client = Client.objects.create(
            company=other_company,
            client_kind="organization",
            name="Foreign Client",
            created_by=self.admin,
        )
        response = self.client.post(
            RECORDS_URL,
            self.payload(client=str(foreign_client.id)),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("client", error_payload(response))


class DetailWorkspaceLifecycleTests(FinancialRecordAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_line_update_delete_and_post_readiness(self):
        record = self.make_draft()
        debit = self.client.post(
            f"{RECORDS_URL}{record.id}/lines/",
            {"description": "Expense", "debit": "100.0000", "credit": "0"},
            format="json",
        )
        credit = self.client.post(
            f"{RECORDS_URL}{record.id}/lines/",
            {"description": "Payable", "debit": "0", "credit": "90.0000"},
            format="json",
        )
        self.assertEqual(debit.status_code, status.HTTP_201_CREATED, debit.data)
        self.assertEqual(credit.status_code, status.HTTP_201_CREATED, credit.data)

        unbalanced = self.client.get(f"{RECORDS_URL}{record.id}/")
        self.assertFalse(unbalanced.data["can_post"])
        self.assertEqual(Decimal(unbalanced.data["balance"]), Decimal("10"))

        corrected = self.client.patch(
            f"{RECORDS_URL}{record.id}/lines/{credit.data['id']}/",
            {"credit": "100.0000", "debit": "0"},
            format="json",
        )
        self.assertEqual(corrected.status_code, status.HTTP_200_OK, corrected.data)
        balanced = self.client.get(f"{RECORDS_URL}{record.id}/")
        self.assertTrue(balanced.data["can_post"])
        self.assertEqual(balanced.data["line_count"], 2)

        deleted = self.client.delete(f"{RECORDS_URL}{record.id}/lines/{debit.data['id']}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        after_delete = self.client.get(f"{RECORDS_URL}{record.id}/")
        self.assertFalse(after_delete.data["can_post"])
        self.assertEqual(after_delete.data["line_count"], 1)

    def test_cancel_refuses_a_draft_even_with_a_reason(self):
        record = self.make_draft()
        response = self.client.post(
            f"{RECORDS_URL}{record.id}/cancel/",
            {"reason": "Not posted"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attachment_upload_download_metadata_and_remove(self):
        record = self.make_draft()
        media_root = tempfile.mkdtemp(prefix="efop-r33-media-")
        self.addCleanup(lambda: shutil.rmtree(media_root, ignore_errors=True))
        upload = SimpleUploadedFile(
            "proof.pdf", b"%PDF-1.4 release33", content_type="application/pdf"
        )
        with self.settings(MEDIA_ROOT=media_root):
            created = self.client.post(
                f"{RECORDS_URL}{record.id}/attachments/",
                {"file": upload},
                format="multipart",
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
            self.assertEqual(created.data["file_name"], "proof.pdf")
            self.assertIn("download_url", created.data)

            removed = self.client.delete(
                f"{RECORDS_URL}{record.id}/attachments/{created.data['id']}/"
            )
            self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
            detail = self.client.get(f"{RECORDS_URL}{record.id}/")
            self.assertEqual(detail.data["attachments"], [])
