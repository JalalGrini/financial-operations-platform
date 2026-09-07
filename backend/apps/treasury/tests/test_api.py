# apps/treasury/tests/test_api.py
"""
API-level tests for treasury.

The model/service-level invariants are already covered in test_treasury.py.
What matters here is different: that the HTTP layer cannot be used to go
around them, and that a refused business rule comes back as a 400 the client
can act on rather than a 500.
"""

import itertools
import uuid
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, TransactionType
from apps.financial_records.services import create_record
from apps.treasury.models import Account, Transaction
from apps.treasury.services import create_account, create_transaction, post_transaction

User = get_user_model()
D = Decimal

ACCOUNTS_URL = "/api/v1/treasury/accounts/"
TRANSACTIONS_URL = "/api/v1/treasury/transactions/"
TRANSFERS_URL = "/api/v1/treasury/transfers/"
RECONCILIATIONS_URL = "/api/v1/treasury/reconciliations/"


def _unwrap(data):
    return data["results"] if isinstance(data, dict) and "results" in data else data


_account_name_counter = itertools.count(1)


class TreasuryAPITestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = cls.make_user("trs-api-admin@example.com", "Administrator")
        cls.assistant = cls.make_user("trs-api-assistant@example.com", "Assistant")
        cls.director = cls.make_user("trs-api-director@example.com", "Director")
        cls.norole = cls.make_user("trs-api-norole@example.com", None)

        cls.company = Company.objects.create(name="API Treasury Co", created_by=cls.admin)
        cls.other_company = Company.objects.create(
            name="API Treasury Other Co", created_by=cls.admin
        )
        cls.txn_type = TransactionType.objects.create(
            name="API Treasury Payment", created_by=cls.admin
        )
        cls.record_type = FinancialRecordType.objects.create(
            name="API Treasury Invoice", created_by=cls.admin
        )

    @classmethod
    def make_user(cls, email, role):
        user = User.objects.create_user(
            email=email,
            password="testpass123",
            first_name="Api",
            last_name="Tester",
        )
        if role:
            group, _created = Group.objects.get_or_create(name=role)
            user.groups.add(group)
        return user

    def account_payload(self, **overrides):
        data = {
            "company": str(self.company.id),
            "name": "API Test Account",
            "opening_balance": "500.0000",
        }
        data.update(overrides)
        return data

    def make_account(self, opening=D("1000.0000"), company=None, name=None, **extra):
        """Each call gets a fresh name: trs_acc_unique_name_per_company is a
        real constraint, and a test creating two fixture accounts for one
        company must not collide with it by accident.
        """
        return create_account(
            company=company or self.company,
            name=name or f"Fixture Account {next(_account_name_counter)}",
            user=self.admin,
            opening_balance=opening,
            **extra,
        )

    def transaction_payload(self, account, **overrides):
        data = {
            "account": str(account.id),
            "transaction_type": str(self.txn_type.id),
            "direction": Transaction.Direction.INBOUND,
            "amount": "100.0000",
            "transaction_date": "2026-08-10",
            "description": "API test movement",
        }
        data.update(overrides)
        return data

    def make_txn(
        self,
        account,
        direction=Transaction.Direction.INBOUND,
        amount=D("100.0000"),
        day=10,
        **extra,
    ):
        return create_transaction(
            account=account,
            transaction_type=self.txn_type,
            direction=direction,
            amount=amount,
            transaction_date=date(2026, 8, day),
            description="Fixture movement",
            user=self.admin,
            **extra,
        )

    def make_posted_txn(self, account, **kwargs):
        txn = self.make_txn(account, **kwargs)
        return post_transaction(transaction=txn, user=self.admin)

    def make_record(self, company=None):
        return create_record(
            company=company or self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description="Fixture record",
            user=self.admin,
        )


class AuthorizationTests(TreasuryAPITestBase):
    """Roles are the only authorization boundary in this platform."""

    def test_anonymous_callers_are_refused_on_all_list_endpoints(self):
        for url in (ACCOUNTS_URL, TRANSACTIONS_URL, RECONCILIATIONS_URL):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_an_authenticated_user_with_no_role_is_refused(self):
        self.client.force_authenticate(self.norole)
        for url in (ACCOUNTS_URL, TRANSACTIONS_URL, RECONCILIATIONS_URL):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_director_cannot_create_an_account(self):
        self.client.force_authenticate(self.director)
        response = self.client.post(ACCOUNTS_URL, self.account_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_director_cannot_create_a_transaction(self):
        account = self.make_account()
        self.client.force_authenticate(self.director)
        response = self.client.post(
            TRANSACTIONS_URL, self.transaction_payload(account), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_director_cannot_create_a_reconciliation(self):
        account = self.make_account()
        self.client.force_authenticate(self.director)
        response = self.client.post(
            RECONCILIATIONS_URL,
            {
                "account": str(account.id),
                "period_start": "2026-08-01",
                "period_end": "2026-08-31",
                "statement_balance": "1000.0000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_assistant_has_no_treasury_access_at_all(self):
        """v17.21: Treasury is Administrator-only by owner decision.

        This test previously asserted that an Assistant could create an account
        but not delete it. The owner withdrew the module from Assistant and
        Director entirely, so the expectation is inverted here rather than
        deleted - a reader can see the access rule changed on purpose.
        """
        self.client.force_authenticate(self.assistant)

        # Reads are refused too, not just writes.
        self.assertEqual(
            self.client.get(ACCOUNTS_URL).status_code, status.HTTP_403_FORBIDDEN
        )

        created = self.client.post(ACCOUNTS_URL, self.account_payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_administrator_can_do_all_of_it(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(ACCOUNTS_URL, self.account_payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        response = self.client.delete(f"{ACCOUNTS_URL}{created.data['id']}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class AccountAPITests(TreasuryAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_creating_an_account_returns_201_with_an_acc_reference(self):
        response = self.client.post(ACCOUNTS_URL, self.account_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["reference"].startswith("ACC-"))

    def test_current_balance_cannot_be_set_by_the_client(self):
        response = self.client.post(
            ACCOUNTS_URL,
            self.account_payload(opening_balance="500.0000", current_balance="999999.0000"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["current_balance"]), D("500.0000"))

    def test_opening_balance_cannot_be_changed_by_a_patch(self):
        created = self.client.post(
            ACCOUNTS_URL, self.account_payload(opening_balance="500.0000"), format="json"
        )
        response = self.client.patch(
            f"{ACCOUNTS_URL}{created.data['id']}/",
            {"opening_balance": "12345.0000"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        account = Account.objects.get(pk=created.data["id"])
        self.assertEqual(account.opening_balance, D("500.0000"))

    def test_delete_archives_rather_than_destroys(self):
        account = self.make_account()
        response = self.client.delete(f"{ACCOUNTS_URL}{account.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        archived = Account.all_objects.get(pk=account.id)
        self.assertTrue(archived.is_archived)

    def test_statement_returns_a_correctly_walked_running_balance(self):
        account = self.make_account(opening=D("1000.0000"))
        self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("200.0000"), day=5
        )
        self.make_posted_txn(
            account, direction=Transaction.Direction.OUTBOUND, amount=D("50.0000"), day=10
        )

        response = self.client.get(f"{ACCOUNTS_URL}{account.id}/statement/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data
        self.assertEqual(len(rows), 2)
        self.assertEqual(Decimal(rows[0]["balance_after"]), D("1200.0000"))
        self.assertEqual(Decimal(rows[1]["balance_after"]), D("1150.0000"))

    def test_balance_drift_is_empty_on_a_healthy_account(self):
        self.make_account()
        response = self.client.get(f"{ACCOUNTS_URL}balance-drift/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


class AccountRestoreTests(TreasuryAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_an_archived_account_can_be_restored(self):
        account = self.make_account()
        self.client.delete(f"{ACCOUNTS_URL}{account.id}/")
        account.refresh_from_db()
        self.assertTrue(account.is_archived)

        response = self.client.post(f"{ACCOUNTS_URL}{account.id}/restore/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        account.refresh_from_db()
        self.assertFalse(account.is_archived)

    def test_restoring_an_unknown_account_returns_404(self):
        response = self.client.post(f"{ACCOUNTS_URL}{uuid.uuid4()}/restore/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restoring_an_active_account_is_rejected(self):
        account = self.make_account()
        response = self.client.post(f"{ACCOUNTS_URL}{account.id}/restore/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_restored_account_is_listed_again(self):
        account = self.make_account()
        self.client.delete(f"{ACCOUNTS_URL}{account.id}/")
        listing = _unwrap(self.client.get(ACCOUNTS_URL).data)
        self.assertNotIn(str(account.id), [row["id"] for row in listing])

        self.client.post(f"{ACCOUNTS_URL}{account.id}/restore/")

        listing = _unwrap(self.client.get(ACCOUNTS_URL).data)
        self.assertIn(str(account.id), [row["id"] for row in listing])

    def test_a_director_cannot_restore_an_account(self):
        account = self.make_account()
        self.client.delete(f"{ACCOUNTS_URL}{account.id}/")

        self.client.force_authenticate(self.director)
        response = self.client.post(f"{ACCOUNTS_URL}{account.id}/restore/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class TransactionAPITests(TreasuryAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_created_transaction_is_always_draft(self):
        account = self.make_account()
        response = self.client.post(
            TRANSACTIONS_URL,
            self.transaction_payload(account, status="posted"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], Transaction.Status.DRAFT)

    def test_posting_via_the_action_moves_the_account_balance(self):
        account = self.make_account(opening=D("1000.0000"))
        txn = self.make_txn(account, direction=Transaction.Direction.INBOUND, amount=D("300.0000"))

        response = self.client.post(f"{TRANSACTIONS_URL}{txn.id}/post_to_ledger/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        account.refresh_from_db()
        self.assertEqual(account.current_balance, D("1300.0000"))

    def test_a_posted_transaction_cannot_be_edited_through_the_api(self):
        account = self.make_account()
        txn = self.make_posted_txn(account)

        response = self.client.patch(
            f"{TRANSACTIONS_URL}{txn.id}/", {"description": "Changed"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelling_without_a_reason_is_refused(self):
        account = self.make_account()
        txn = self.make_txn(account)

        response = self.client.post(f"{TRANSACTIONS_URL}{txn.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelling_a_posted_transaction_returns_the_money(self):
        account = self.make_account(opening=D("1000.0000"))
        txn = self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("400.0000")
        )

        response = self.client.post(
            f"{TRANSACTIONS_URL}{txn.id}/cancel/",
            {"reason": "Duplicate entry"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        account.refresh_from_db()
        self.assertEqual(account.current_balance, D("1000.0000"))

    def test_money_is_never_serialised_as_a_float(self):
        account = self.make_account()
        response = self.client.post(
            TRANSACTIONS_URL, self.transaction_payload(account), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsInstance(response.data["amount"], str)

    def test_a_zero_amount_is_refused(self):
        account = self.make_account()
        response = self.client.post(
            TRANSACTIONS_URL,
            self.transaction_payload(account, amount="0.0000"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_transaction_against_another_companys_record_is_refused(self):
        """Exercises the T-3 fix through HTTP."""
        account = self.make_account(company=self.company)
        foreign_record = self.make_record(company=self.other_company)

        response = self.client.post(
            TRANSACTIONS_URL,
            self.transaction_payload(account, financial_record=str(foreign_record.id)),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TransferAPITests(TreasuryAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def transfer_payload(self, source, destination, **overrides):
        data = {
            "source_account": str(source.id),
            "destination_account": str(destination.id),
            "amount": "250.0000",
            "transaction_date": "2026-08-12",
            "description": "API transfer",
            "transaction_type": str(self.txn_type.id),
        }
        data.update(overrides)
        return data

    def test_a_transfer_creates_two_legs_sharing_one_transfer_group(self):
        source = self.make_account(opening=D("1000.0000"))
        destination = self.make_account(opening=D("0.0000"))

        response = self.client.post(
            TRANSFERS_URL, self.transfer_payload(source, destination), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        outbound = response.data["outbound"]
        inbound = response.data["inbound"]
        self.assertIsNotNone(outbound["transfer_group"])
        self.assertEqual(outbound["transfer_group"], inbound["transfer_group"])

    def test_a_transfer_moves_both_balances_and_conserves_the_total(self):
        source = self.make_account(opening=D("1000.0000"))
        destination = self.make_account(opening=D("200.0000"))

        response = self.client.post(
            TRANSFERS_URL, self.transfer_payload(source, destination), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        source.refresh_from_db()
        destination.refresh_from_db()
        self.assertEqual(source.current_balance, D("750.0000"))
        self.assertEqual(destination.current_balance, D("450.0000"))
        self.assertEqual(source.current_balance + destination.current_balance, D("1200.0000"))

    def test_a_same_account_transfer_is_refused_with_400_not_500(self):
        account = self.make_account(opening=D("1000.0000"))
        response = self.client.post(
            TRANSFERS_URL, self.transfer_payload(account, account), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ReconciliationAPITests(TreasuryAPITestBase):
    def setUp(self):
        self.client.force_authenticate(self.admin)

    def reconciliation_payload(self, account, **overrides):
        data = {
            "account": str(account.id),
            "period_start": "2026-08-01",
            "period_end": "2026-08-31",
            "statement_balance": "1200.0000",
        }
        data.update(overrides)
        return data

    def test_opening_a_reconciliation_returns_201_with_a_rec_reference(self):
        account = self.make_account()
        response = self.client.post(
            RECONCILIATIONS_URL, self.reconciliation_payload(account), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["reference"].startswith("REC-"))

    def test_attaching_a_draft_transaction_is_refused(self):
        account = self.make_account(opening=D("1000.0000"))
        draft = self.make_txn(account, day=10)
        opened = self.client.post(
            RECONCILIATIONS_URL, self.reconciliation_payload(account), format="json"
        )

        response = self.client.post(
            f"{RECONCILIATIONS_URL}{opened.data['id']}/attach/",
            {"transaction": str(draft.id)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completing_an_unbalanced_period_is_refused_and_mentions_the_difference(self):
        account = self.make_account(opening=D("1000.0000"))
        self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("100.0000"), day=5
        )
        opened = self.client.post(
            RECONCILIATIONS_URL,
            self.reconciliation_payload(account, statement_balance="5000.0000"),
            format="json",
        )

        response = self.client.post(f"{RECONCILIATIONS_URL}{opened.data['id']}/complete/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("difference", str(response.data).lower())

    def test_completing_a_balanced_period_freezes_its_transactions(self):
        account = self.make_account(opening=D("1000.0000"))
        txn = self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("200.0000"), day=5
        )
        opened = self.client.post(
            RECONCILIATIONS_URL,
            self.reconciliation_payload(account, statement_balance="1200.0000"),
            format="json",
        )
        self.client.post(
            f"{RECONCILIATIONS_URL}{opened.data['id']}/attach/",
            {"transaction": str(txn.id)},
            format="json",
        )

        response = self.client.post(f"{RECONCILIATIONS_URL}{opened.data['id']}/complete/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        txn.refresh_from_db()
        self.assertTrue(txn.is_reconciled)

    def test_a_reconciled_transaction_cannot_be_cancelled_through_the_api(self):
        account = self.make_account(opening=D("1000.0000"))
        txn = self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("200.0000"), day=5
        )
        opened = self.client.post(
            RECONCILIATIONS_URL,
            self.reconciliation_payload(account, statement_balance="1200.0000"),
            format="json",
        )
        self.client.post(
            f"{RECONCILIATIONS_URL}{opened.data['id']}/attach/",
            {"transaction": str(txn.id)},
            format="json",
        )
        self.client.post(f"{RECONCILIATIONS_URL}{opened.data['id']}/complete/")

        response = self.client.post(
            f"{TRANSACTIONS_URL}{txn.id}/cancel/",
            {"reason": "Should not work"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reopening_without_a_reason_is_refused(self):
        account = self.make_account(opening=D("1000.0000"))
        txn = self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("200.0000"), day=5
        )
        opened = self.client.post(
            RECONCILIATIONS_URL,
            self.reconciliation_payload(account, statement_balance="1200.0000"),
            format="json",
        )
        self.client.post(
            f"{RECONCILIATIONS_URL}{opened.data['id']}/attach/",
            {"transaction": str(txn.id)},
            format="json",
        )
        self.client.post(f"{RECONCILIATIONS_URL}{opened.data['id']}/complete/")

        response = self.client.post(
            f"{RECONCILIATIONS_URL}{opened.data['id']}/reopen/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_suggestions_lists_unreconciled_posted_transactions(self):
        account = self.make_account(opening=D("1000.0000"))
        suggested = self.make_posted_txn(
            account, direction=Transaction.Direction.INBOUND, amount=D("75.0000"), day=5
        )
        opened = self.client.post(
            RECONCILIATIONS_URL, self.reconciliation_payload(account), format="json"
        )

        response = self.client.get(f"{RECONCILIATIONS_URL}{opened.data['id']}/suggestions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in _unwrap(response.data)]
        self.assertIn(str(suggested.id), ids)
