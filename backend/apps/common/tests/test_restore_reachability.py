# apps/common/tests/test_restore_reachability.py
"""
Restore-reachability regression tests (Cycle 16, bug B-2 / B-1).

`test_restore_action_smoke.py` (Cycle 15) proves restore does not crash (5xx)
on a NONEXISTENT row. It says explicitly that it does not prove restore works
on a row that actually exists. This file proves the harder, more important
claim directly: archive a real row, call restore through the actual API
client, and assert both a success response and that the row is genuinely no
longer archived afterward.

Before the Cycle 16 fix (ArchivableObjectMixin in apps/common/mixins.py),
every one of the non-treasury/non-companies tests below failed with HTTP 404
and no state change, because each ViewSet's get_queryset() excludes archived
rows and none overrode get_object() for the restore action. Treasury already
worked (its restore bypasses get_object() entirely). Companies already found
the row but crashed 500 on a missing one (B-1) - covered by
CompanyRestoreMissingRowTests below.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company
from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)
from apps.financial_records.services import create_record
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ExternalParty,
    Supplier,
)
from apps.personnel.models import Employment, PersonnelPerson

User = get_user_model()


class RestoreReachabilityTestBase(APITestCase):
    """Shared admin user + authenticated client for every case below."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="restore-reach-admin@example.com",
            password="testpass123",
            first_name="Restore",
            last_name="Admin",
        )
        group, _ = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)

    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.admin)

    def assert_restore_works(self, obj, url):
        """Archive `obj`, restore it through the API, assert it worked."""
        obj.archive(user=self.admin, reason="restore reachability test")
        obj.refresh_from_db()
        self.assertTrue(obj.is_archived, "setup failed: object was not archived")

        response = self.client_api.post(url, {}, format="json")
        self.assertIn(
            response.status_code,
            (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT),
            f"restore call failed: HTTP {response.status_code} "
            f"{getattr(response, 'data', response.content)}",
        )
        obj.refresh_from_db()
        self.assertFalse(
            obj.is_archived,
            "restore endpoint returned success but the row is still archived "
            "(this is exactly bug B-2: the row was never actually reached)",
        )


class PartiesRestoreReachabilityTests(RestoreReachabilityTestBase):
    def test_client_restore_reaches_archived_row(self):
        obj = Client.objects.create(name="Reach Client Co")
        self.assert_restore_works(obj, f"/api/v1/parties/clients/{obj.pk}/restore/")

    def test_supplier_restore_reaches_archived_row(self):
        obj = Supplier.objects.create(name="Reach Supplier Co")
        self.assert_restore_works(obj, f"/api/v1/parties/suppliers/{obj.pk}/restore/")

    def test_associated_person_restore_reaches_archived_row(self):
        person_type = AssociatedPersonType.objects.create(name="Reach Person Type")
        obj = AssociatedPerson.objects.create(
            first_name="Reach", last_name="Person", person_type=person_type
        )
        self.assert_restore_works(obj, f"/api/v1/parties/associated-persons/{obj.pk}/restore/")

    def test_external_party_restore_reaches_archived_row(self):
        obj = ExternalParty.objects.create(name="Reach External Party")
        self.assert_restore_works(obj, f"/api/v1/parties/external-parties/{obj.pk}/restore/")


class ConfigurationRestoreReachabilityTests(RestoreReachabilityTestBase):
    def test_category_restore_reaches_archived_row(self):
        obj = Category.objects.create(name="Reach Category", is_expense=True)
        self.assert_restore_works(obj, f"/api/v1/configuration/categories/{obj.pk}/restore/")

    def test_financial_record_type_restore_reaches_archived_row(self):
        obj = FinancialRecordType.objects.create(name="Reach Record Type", created_by=self.admin)
        self.assert_restore_works(obj, f"/api/v1/configuration/record-types/{obj.pk}/restore/")

    def test_payment_method_restore_reaches_archived_row(self):
        obj = PaymentMethod.objects.create(name="Reach Payment Method")
        self.assert_restore_works(obj, f"/api/v1/configuration/payment-methods/{obj.pk}/restore/")

    def test_transaction_type_restore_reaches_archived_row(self):
        obj = TransactionType.objects.create(name="Reach Transaction Type")
        self.assert_restore_works(obj, f"/api/v1/configuration/transaction-types/{obj.pk}/restore/")

    def test_report_type_restore_reaches_archived_row(self):
        obj = ReportType.objects.create(name="Reach Report Type")
        self.assert_restore_works(obj, f"/api/v1/configuration/report-types/{obj.pk}/restore/")

    def test_notification_type_restore_reaches_archived_row(self):
        obj = NotificationType.objects.create(name="Reach Notification Type")
        self.assert_restore_works(
            obj, f"/api/v1/configuration/notification-types/{obj.pk}/restore/"
        )


class PersonnelRestoreReachabilityTests(RestoreReachabilityTestBase):
    def test_person_restore_reaches_archived_row(self):
        obj = PersonnelPerson.objects.create(first_name="Reach", last_name="Person")
        self.assert_restore_works(obj, f"/api/v1/personnel/persons/{obj.pk}/restore/")

    def test_employment_restore_reaches_archived_row(self):
        company = Company.objects.create(
            name="Reach Employment Co",
            registration_number="REACH-EMP-1",
            tax_id="REACH-EMP-TAX-1",
        )
        person = PersonnelPerson.objects.create(first_name="Reach", last_name="Employee")
        obj = Employment.objects.create(person=person, company=company)
        self.assert_restore_works(obj, f"/api/v1/personnel/employments/{obj.pk}/restore/")


class FinancialRecordsRestoreReachabilityTests(RestoreReachabilityTestBase):
    def test_financial_record_restore_reaches_archived_row(self):
        company = Company.objects.create(
            name="Reach FR Co",
            registration_number="REACH-FR-1",
            tax_id="REACH-FR-TAX-1",
        )
        record_type = FinancialRecordType.objects.create(
            name="Reach FR Type", created_by=self.admin
        )
        obj = create_record(
            company=company,
            record_type=record_type,
            record_date=date(2026, 8, 6),
            description="Reach financial record",
            user=self.admin,
        )
        self.assert_restore_works(obj, f"/api/v1/financial-records/records/{obj.pk}/restore/")


class CompanyRestoreReachabilityTests(RestoreReachabilityTestBase):
    """Companies already reached archived rows before Cycle 16 (it used
    Company.all_objects.get(...) in its own get_object override). This class
    is a regression guard that the shared mixin preserves that behavior once
    the bespoke override is removed.
    """

    def test_company_restore_reaches_archived_row(self):
        obj = Company.objects.create(
            name="Reach Restore Co",
            registration_number="REACH-CO-1",
            tax_id="REACH-CO-TAX-1",
        )
        self.assert_restore_works(obj, f"/api/v1/companies/{obj.pk}/restore/")


class CompanyMissingRowTests(RestoreReachabilityTestBase):
    """Bug B-1: archive/restore on a nonexistent company must 404, not 500."""

    NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000"

    def test_restore_missing_company_returns_404_not_500(self):
        response = self.client_api.post(
            f"/api/v1/companies/{self.NONEXISTENT_UUID}/restore/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_archive_missing_company_returns_404_not_500(self):
        response = self.client_api.post(
            f"/api/v1/companies/{self.NONEXISTENT_UUID}/archive/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class NotArchivedRestoreGuardTests(RestoreReachabilityTestBase):
    """Restoring a row that was never archived should 400, not silently
    report success (matches the treasury reference behavior from Cycle 15).
    """

    def test_restoring_a_non_archived_client_is_rejected(self):
        obj = Client.objects.create(name="Never Archived Client")
        self.assertFalse(obj.is_archived)
        response = self.client_api.post(
            f"/api/v1/parties/clients/{obj.pk}/restore/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        obj.refresh_from_db()
        self.assertFalse(obj.is_archived)
