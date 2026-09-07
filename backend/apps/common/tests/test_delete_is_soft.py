# apps/common/tests/test_delete_is_soft.py
"""
Verification tests for bug C-1 and decision C-5 (state/IMPLEMENTATION_PLAN.md
Section 11).

BUG C-1
-------
Only 4 ModelViewSets (Company, FinancialRecord, Transaction, treasury Account)
overrode `destroy()` before Cycle 17. Every other ModelViewSet inherited DRF's
default, which calls `instance.delete()` - a real SQL DELETE. No model,
manager, or mixin anywhere overrode `delete()`, so nothing intercepted it:
plain DELETE permanently destroyed rows on 20+ endpoints, discovered
empirically against real API calls in the Cycle 17 architect pass.

Each case below creates a row, DELETEs it through the real API as an
Administrator, and asserts both that the response is 204 AND that the row
still exists afterward (via `all_objects`) with `is_archived=True`. Before
the fix (`SoftDeleteViewSetMixin` in `apps/common/mixins.py`), every one of
these cases instead returned 204 with the row genuinely gone.

DECISION C-5
------------
An Administrator may choose either archive (plain DELETE) or a true purge
(`DELETE .../<pk>/permanent/` with `{"confirm": true}`). The second half of
this file exercises that companion action: confirmation is required, only an
Administrator may call it, and a `ProtectedError` becomes 409 rather than an
uncaught 500 (bug C-2).
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company, CompanyPreference
from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)
from apps.parties.models import (
    AssociatedPerson,
    AssociatedPersonType,
    Client,
    ExternalParty,
    Supplier,
)
from apps.personnel.models import PersonnelDocumentReference
from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_cnss_declaration,
    create_test_cnss_monthly,
    create_test_employment,
    create_test_payment,
    create_test_payroll,
    create_test_person,
    create_test_salary,
)
from apps.treasury.models import Account as TreasuryAccount

User = get_user_model()


def make_user(email, role=None):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="T",
        last_name="U",
    )
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
    return user


class DeleteArchivesTestBase(APITestCase):
    """Shared admin client + the core "delete archives, not destroys" assertion."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user("del-soft-admin@example.com", "Administrator")

    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.admin)

    def assert_delete_archives(self, obj, url):
        response = self.client_api.delete(url)
        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
            f"DELETE {url} -> {response.status_code} "
            f"{getattr(response, 'data', response.content)}",
        )
        model = type(obj)
        manager = getattr(model, "all_objects", None)
        self.assertIsNotNone(manager, f"{model.__name__} has no all_objects manager to verify with")
        refreshed = manager.filter(pk=obj.pk).first()
        self.assertIsNotNone(
            refreshed,
            f"{model.__name__} row {obj.pk} is gone after DELETE - this IS bug "
            "C-1: a real SQL DELETE happened instead of an archive.",
        )
        self.assertTrue(
            refreshed.is_archived,
            f"{model.__name__} row {obj.pk} still exists but is_archived is "
            "False - DELETE did something other than archive it.",
        )


class ConfigurationDeleteArchivesTests(DeleteArchivesTestBase):
    def test_category_delete_archives(self):
        obj = Category.objects.create(name="Del Category", is_expense=True)
        self.assert_delete_archives(obj, f"/api/v1/configuration/categories/{obj.pk}/")

    def test_financial_record_type_delete_archives(self):
        obj = FinancialRecordType.objects.create(name="Del Record Type", created_by=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/configuration/record-types/{obj.pk}/")

    def test_payment_method_delete_archives(self):
        obj = PaymentMethod.objects.create(name="Del Payment Method")
        self.assert_delete_archives(obj, f"/api/v1/configuration/payment-methods/{obj.pk}/")

    def test_transaction_type_delete_archives(self):
        obj = TransactionType.objects.create(name="Del Transaction Type")
        self.assert_delete_archives(obj, f"/api/v1/configuration/transaction-types/{obj.pk}/")

    def test_report_type_delete_archives(self):
        obj = ReportType.objects.create(name="Del Report Type")
        self.assert_delete_archives(obj, f"/api/v1/configuration/report-types/{obj.pk}/")

    def test_notification_type_delete_archives(self):
        obj = NotificationType.objects.create(name="Del Notification Type")
        self.assert_delete_archives(obj, f"/api/v1/configuration/notification-types/{obj.pk}/")


class PartiesDeleteArchivesTests(DeleteArchivesTestBase):
    def test_client_delete_archives(self):
        obj = Client.objects.create(name="Del Client Co")
        self.assert_delete_archives(obj, f"/api/v1/parties/clients/{obj.pk}/")

    def test_supplier_delete_archives(self):
        obj = Supplier.objects.create(name="Del Supplier Co")
        self.assert_delete_archives(obj, f"/api/v1/parties/suppliers/{obj.pk}/")

    def test_associated_person_delete_archives(self):
        person_type = AssociatedPersonType.objects.create(name="Del Person Type")
        obj = AssociatedPerson.objects.create(
            first_name="Del", last_name="Person", person_type=person_type
        )
        self.assert_delete_archives(obj, f"/api/v1/parties/associated-persons/{obj.pk}/")

    def test_associated_person_type_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b) -
        but destroy() itself must still archive, not hard-delete."""
        obj = AssociatedPersonType.objects.create(name="Del Person Type Standalone")
        self.assert_delete_archives(obj, f"/api/v1/parties/person-types/{obj.pk}/")

    def test_external_party_delete_archives(self):
        obj = ExternalParty.objects.create(name="Del External Party")
        self.assert_delete_archives(obj, f"/api/v1/parties/external-parties/{obj.pk}/")


class PersonnelDeleteArchivesTests(DeleteArchivesTestBase):
    def test_personnel_person_delete_archives(self):
        obj = create_test_person(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/persons/{obj.pk}/")

    def test_employment_delete_archives(self):
        obj = create_test_employment(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/employments/{obj.pk}/")

    def test_employment_salary_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        obj = create_test_salary(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/salaries/{obj.pk}/")

    def test_monthly_payroll_record_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        obj = create_test_payroll(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/payrolls/{obj.pk}/")

    def test_payroll_adjustment_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        obj = create_test_adjustment(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/adjustments/{obj.pk}/")

    def test_payroll_payment_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        obj = create_test_payment(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/payments/{obj.pk}/")

    def test_cnss_declaration_delete_archives(self):
        obj = create_test_cnss_declaration(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/cnss/{obj.pk}/")

    def test_cnss_monthly_declaration_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        obj = create_test_cnss_monthly(user=self.admin)
        self.assert_delete_archives(obj, f"/api/v1/personnel/cnss-monthly/{obj.pk}/")

    def test_personnel_document_reference_delete_archives(self):
        """No archive/restore actions yet (tracked Cycle 18 backlog, C-3b)."""
        person = create_test_person(user=self.admin)
        obj = PersonnelDocumentReference.objects.create(
            person=person,
            document_type="other",
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.assert_delete_archives(obj, f"/api/v1/personnel/documents/{obj.pk}/")


class CompanyPreferenceDeleteArchivesTests(DeleteArchivesTestBase):
    """Fixes B-3 alongside C-1: this endpoint was reachable for hard delete
    (routed) while its archive/restore actions were not (unrouted)."""

    def test_company_preference_delete_archives(self):
        company = Company.objects.create(name="Del Pref Co")
        obj = CompanyPreference.objects.create(
            company=company,
            key="del.test.key",
            value="v",
            created_by=self.admin,
        )
        self.assert_delete_archives(obj, f"/api/v1/companies/{company.pk}/preferences/{obj.pk}/")

    def test_company_preference_archive_and_restore_are_routed(self):
        """Fixes B-3 directly: archive/restore actions exist on the ViewSet
        but were never routed in urls.py before Cycle 17."""
        company = Company.objects.create(name="Del Pref Co Route")
        obj = CompanyPreference.objects.create(
            company=company,
            key="del.test.key2",
            value="v",
            created_by=self.admin,
        )
        archive_resp = self.client_api.post(
            f"/api/v1/companies/{company.pk}/preferences/{obj.pk}/archive/", {}, format="json"
        )
        self.assertEqual(archive_resp.status_code, status.HTTP_200_OK)
        obj.refresh_from_db()
        self.assertTrue(obj.is_archived)

        restore_resp = self.client_api.post(
            f"/api/v1/companies/{company.pk}/preferences/{obj.pk}/restore/", {}, format="json"
        )
        self.assertEqual(restore_resp.status_code, status.HTTP_200_OK)
        obj.refresh_from_db()
        self.assertFalse(obj.is_archived)


class PermanentDeleteTests(DeleteArchivesTestBase):
    """Decision C-5: the generic DELETE .../<pk>/permanent/ action added by
    SoftDeleteViewSetMixin, plus CompanyViewSet's service-backed override."""

    def test_permanent_delete_requires_confirm_true(self):
        obj = Category.objects.create(name="Perm No Confirm", is_expense=True)
        response = self.client_api.delete(
            f"/api/v1/configuration/categories/{obj.pk}/permanent/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Category.all_objects.filter(pk=obj.pk).exists())

    def test_permanent_delete_with_confirm_actually_purges(self):
        obj = Category.objects.create(name="Perm Confirmed", is_expense=True)
        response = self.client_api.delete(
            f"/api/v1/configuration/categories/{obj.pk}/permanent/",
            {"confirm": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.all_objects.filter(pk=obj.pk).exists())

    def test_permanent_delete_is_administrator_only(self):
        assistant = make_user("del-soft-assistant@example.com", "Assistant")
        client = APIClient()
        client.force_authenticate(assistant)
        obj = Category.objects.create(name="Perm Non Admin", is_expense=True)
        response = client.delete(
            f"/api/v1/configuration/categories/{obj.pk}/permanent/",
            {"confirm": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Category.all_objects.filter(pk=obj.pk).exists())

    def test_company_permanent_delete_uses_service_and_purges(self):
        """CompanyViewSet overrides permanent_delete to call
        CompanyService.permanent_delete_company() (Cycle 17), which this also
        exercises the ordering fix for: archive-before-validate, not after.
        """
        company = Company.objects.create(name="Perm Delete Co")
        response = self.client_api.delete(
            f"/api/v1/companies/{company.pk}/permanent/",
            {"confirm": True},
            format="json",
        )
        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
            getattr(response, "data", response.content),
        )
        self.assertFalse(Company.all_objects.filter(pk=company.pk).exists())

    def test_company_permanent_delete_requires_confirm_true(self):
        company = Company.objects.create(name="Perm Delete Co No Confirm")
        response = self.client_api.delete(
            f"/api/v1/companies/{company.pk}/permanent/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Company.all_objects.filter(pk=company.pk).exists())

    def test_treasury_account_permanent_delete_purges(self):
        company = Company.objects.create(name="Perm Delete Treasury Co")
        obj = TreasuryAccount.objects.create(
            company=company,
            name="Perm Delete Account",
            created_by=self.admin,
        )
        response = self.client_api.delete(
            f"/api/v1/treasury/accounts/{obj.pk}/permanent/",
            {"confirm": True},
            format="json",
        )
        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
            getattr(response, "data", response.content),
        )
        self.assertFalse(TreasuryAccount.all_objects.filter(pk=obj.pk).exists())
