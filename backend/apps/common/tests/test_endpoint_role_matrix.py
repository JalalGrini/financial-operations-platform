"""The role matrix asserted through real HTTP endpoints.

WHY THIS EXISTS SEPARATELY FROM test_shared_role_matrix.py
----------------------------------------------------------
That file proves the permission *classes* decide correctly. It cannot prove the
viewsets actually attach them. A viewset that forgot `permission_classes`, or
listed only `IsAuthenticated`, would pass every test in that file while leaving
the endpoint open to any logged-in account.

This file closes that gap for companies, configuration and parties by driving
the matrix through the URL router, exactly as a client would. Personnel already
has equivalent coverage (`apps/personnel/tests/test_role_matrix.py`, Cycle 1).

With company scoping deliberately rejected, roles are the only authorization
boundary in this platform, so "the class is correct" is not the same assurance
as "the endpoint is protected".

ASSERTION STYLE
---------------
Denials assert exactly 403. Grants assert only that the response is NOT 401/403,
rather than a specific 2xx. That is deliberate: a create payload may be rejected
as 400 for unrelated serializer reasons, and pinning 201 here would make these
authorization tests fail for validation changes that have nothing to do with
authorization. What matters is whether the caller got past the permission layer.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company
from apps.configuration.models import Category, FinancialRecordType
from apps.financial_records.models import FinancialRecord
from apps.parties.models import Client as PartyClient
from apps.treasury.models import Account as TreasuryAccount

User = get_user_model()

ADMINISTRATOR = "Administrator"
ASSISTANT = "Assistant"
DIRECTOR = "Director"

FORBIDDEN = status.HTTP_403_FORBIDDEN
UNAUTHENTICATED = (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


def make_user(email, role=None):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Test",
        last_name="User",
    )
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
    return user


class EndpointRoleMatrixTests(APITestCase):
    """One matrix, driven through the router for three domains."""

    @classmethod
    def setUpTestData(cls):
        cls.administrator = make_user("ep-admin@example.com", ADMINISTRATOR)
        cls.assistant = make_user("ep-assistant@example.com", ASSISTANT)
        cls.director = make_user("ep-director@example.com", DIRECTOR)
        cls.no_role = make_user("ep-norole@example.com", None)

    def setUp(self):
        # Fresh objects per test so a destructive test cannot affect another.
        self.company = Company.objects.create(name="Matrix Test Co", created_by=self.administrator)
        self.category = Category.objects.create(
            name="Matrix Test Category", created_by=self.administrator
        )
        self.party = PartyClient.objects.create(
            name="Matrix Test Client",
            company=self.company,
            created_by=self.administrator,
        )
        self.record_type = FinancialRecordType.objects.create(
            name="Matrix Test Record Type", created_by=self.administrator
        )
        self.financial_record = FinancialRecord.objects.create(
            company=self.company,
            record_type=self.record_type,
            record_date="2026-08-06",
            description="Matrix Test Record",
            created_by=self.administrator,
        )
        self.account = TreasuryAccount.objects.create(
            company=self.company,
            name="Matrix Test Account",
            created_by=self.administrator,
        )

    def endpoints(self):
        """(label, list URL, detail URL, minimal create payload) per domain."""
        return [
            (
                "companies",
                "/api/v1/companies/",
                f"/api/v1/companies/{self.company.id}/",
                {"name": "Created By Matrix Test"},
            ),
            (
                "configuration categories",
                "/api/v1/configuration/categories/",
                f"/api/v1/configuration/categories/{self.category.id}/",
                {"name": "Created By Matrix Test"},
            ),
            (
                "parties clients",
                "/api/v1/parties/clients/",
                f"/api/v1/parties/clients/{self.party.id}/",
                {"name": "Created By Matrix Test", "company": str(self.company.id)},
            ),
            (
                "financial records",
                "/api/v1/financial-records/records/",
                f"/api/v1/financial-records/records/{self.financial_record.id}/",
                {
                    "company": str(self.company.id),
                    "record_type": str(self.record_type.id),
                    "record_date": "2026-08-06",
                    "description": "Created By Matrix Test",
                },
            ),
            # Treasury deliberately absent since v17.21. It is no longer part
            # of the shared three-role matrix: the owner withdrew it from
            # Assistant and Director, so it is Administrator-only and asserted
            # separately in test_admin_only_modules_contract.py. Adding it back
            # here would fail, which is the point.
        ]

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def assert_passed_permission_layer(self, response, context):
        self.assertNotIn(
            response.status_code,
            UNAUTHENTICATED,
            f"{context}: expected to pass the permission layer, got "
            f"{response.status_code}. Body: {getattr(response, 'data', None)}",
        )

    # -- Director: read yes, mutate never -----------------------------------

    def test_director_can_read_every_domain(self):
        client = self.as_user(self.director)
        for label, list_url, detail_url, _payload in self.endpoints():
            with self.subTest(domain=label):
                self.assert_passed_permission_layer(
                    client.get(list_url), f"Director GET {label} list"
                )
                self.assert_passed_permission_layer(
                    client.get(detail_url), f"Director GET {label} detail"
                )

    def test_director_cannot_create_update_or_delete(self):
        """Directors oversee everything and key nothing.

        Seniority and write access are separate axes in this platform, which is
        easy to get wrong precisely because it is counter-intuitive.
        """
        client = self.as_user(self.director)
        for label, list_url, detail_url, payload in self.endpoints():
            with self.subTest(domain=label):
                self.assertEqual(
                    client.post(list_url, payload, format="json").status_code,
                    FORBIDDEN,
                    f"Director must not create {label}.",
                )
                self.assertEqual(
                    client.patch(detail_url, {"name": "Renamed"}, format="json").status_code,
                    FORBIDDEN,
                    f"Director must not update {label}.",
                )
                self.assertEqual(
                    client.delete(detail_url).status_code,
                    FORBIDDEN,
                    f"Director must not delete {label}.",
                )

    # -- Assistant: create and update, never destroy ------------------------

    def test_assistant_can_read_create_and_update(self):
        client = self.as_user(self.assistant)
        for label, list_url, detail_url, payload in self.endpoints():
            with self.subTest(domain=label):
                self.assert_passed_permission_layer(client.get(list_url), f"Assistant GET {label}")
                if label == "configuration categories":
                    self.assertEqual(
                        client.post(list_url, payload, format="json").status_code,
                        FORBIDDEN,
                        "Assistant must not create configuration.",
                    )
                    self.assertEqual(
                        client.patch(detail_url, {"name": "Renamed"}, format="json").status_code,
                        FORBIDDEN,
                        "Assistant must not update configuration.",
                    )
                    continue
                self.assert_passed_permission_layer(
                    client.post(list_url, payload, format="json"),
                    f"Assistant POST {label}",
                )
                self.assert_passed_permission_layer(
                    client.patch(detail_url, {"name": "Renamed"}, format="json"),
                    f"Assistant PATCH {label}",
                )

    def test_assistant_cannot_delete(self):
        """The boundary that makes soft delete meaningful.

        Since Cycle 17 (state/IMPLEMENTATION_PLAN.md Section 11, decision
        C-5), plain DELETE archives rather than destroys for every domain
        below, and only Administrator may even reach that archiving DELETE
        or the separate, confirmation-gated `permanent_delete` true-purge
        route (`.../<pk>/permanent/`) - this test proves an Assistant is
        turned away by the permission layer before either one, the same
        403 either way. If this ever returns anything but 403, the
        Administrator-only boundary around both delete paths has a hole.
        """
        client = self.as_user(self.assistant)
        for label, _list_url, detail_url, _payload in self.endpoints():
            with self.subTest(domain=label):
                self.assertEqual(
                    client.delete(detail_url).status_code,
                    FORBIDDEN,
                    f"Assistant must not delete {label}.",
                )

    # -- Administrator: full CRUD -------------------------------------------

    def test_administrator_can_delete_every_domain(self):
        """Administrator's plain DELETE passes the permission layer and
        archives - it does not destroy the row (Cycle 17, C-1/C-5). Checking
        only the status code would pass just as well if DELETE still issued
        a real SQL DELETE, so this also confirms the row survives through
        each model's `all_objects` manager with `is_archived=True`; the
        one-time, confirmation-gated true purge is `permanent_delete`
        (`.../<pk>/permanent/`), covered separately in
        apps/common/tests/test_delete_is_soft.py, not this plain DELETE.
        """
        client = self.as_user(self.administrator)
        models_by_label = {
            "companies": (Company, self.company.id),
            "configuration categories": (Category, self.category.id),
            "parties clients": (PartyClient, self.party.id),
            "financial records": (FinancialRecord, self.financial_record.id),
            "treasury accounts": (TreasuryAccount, self.account.id),
        }
        for label, _list_url, detail_url, _payload in self.endpoints():
            with self.subTest(domain=label):
                self.assert_passed_permission_layer(
                    client.delete(detail_url), f"Administrator DELETE {label}"
                )
                model, pk = models_by_label[label]
                archived = model.all_objects.get(pk=pk)
                self.assertTrue(
                    archived.is_archived,
                    f"Administrator DELETE {label} must archive the row, not "
                    "destroy it - it was still found via all_objects but "
                    "is_archived is False.",
                )

    # -- No role, and anonymous ---------------------------------------------

    def test_authenticated_user_without_a_role_is_denied_everywhere(self):
        """Having an account is not having access.

        A newly provisioned user with no group assigned must not be able to read
        financial data merely by logging in.
        """
        client = self.as_user(self.no_role)
        for label, list_url, detail_url, payload in self.endpoints():
            with self.subTest(domain=label):
                self.assertEqual(
                    client.get(list_url).status_code,
                    FORBIDDEN,
                    f"Role-less user must not read {label}.",
                )
                self.assertEqual(
                    client.post(list_url, payload, format="json").status_code,
                    FORBIDDEN,
                    f"Role-less user must not create {label}.",
                )
                self.assertEqual(
                    client.delete(detail_url).status_code,
                    FORBIDDEN,
                    f"Role-less user must not delete {label}.",
                )

    def test_anonymous_callers_are_rejected_everywhere(self):
        client = APIClient()
        for label, list_url, detail_url, payload in self.endpoints():
            with self.subTest(domain=label):
                self.assertIn(
                    client.get(list_url).status_code,
                    UNAUTHENTICATED,
                    f"Anonymous caller must not read {label}.",
                )
                self.assertIn(
                    client.post(list_url, payload, format="json").status_code,
                    UNAUTHENTICATED,
                    f"Anonymous caller must not create {label}.",
                )
                self.assertIn(
                    client.delete(detail_url).status_code,
                    UNAUTHENTICATED,
                    f"Anonymous caller must not delete {label}.",
                )
