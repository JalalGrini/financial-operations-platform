# apps/treasury/tests/test_cycle19_fixes.py
"""Regression tests for the Cycle 19 fixes (state/IMPLEMENTATION_PLAN.md
Section 13): E-2 and E-3, both closed by the same
``TransactionViewSet.get_archive_block_reason`` hook.

Each class is named after the bug it guards against a return.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.configuration.models import TransactionType
from apps.treasury.models import Transaction
from apps.treasury.selectors import reconciliation_computed_balance
from apps.treasury.services import (
    attach_transaction_to_reconciliation,
    cancel_transaction,
    complete_reconciliation,
    create_account,
    create_transaction,
    open_reconciliation,
    post_transaction,
)

User = get_user_model()
D = Decimal

TXN_URL = "/api/v1/treasury/transactions/"


class Cycle19TreasuryTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="c19-trs-admin@example.com",
            password="testpass123",
            first_name="Cycle19",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(group)
        cls.company = Company.objects.create(name="C19 Trs Co", created_by=cls.admin)
        cls.txn_type = TransactionType.objects.create(name="C19 Trs Payment", created_by=cls.admin)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def make_account(self, name="C19 Trs Account"):
        return create_account(
            company=self.company,
            name=name,
            user=self.admin,
            opening_balance=D("500.0000"),
        )

    def make_posted_transaction(self, account=None, amount="100.0000"):
        account = account or self.make_account()
        txn = create_transaction(
            account=account,
            transaction_type=self.txn_type,
            direction=Transaction.Direction.INBOUND,
            amount=D(amount),
            transaction_date=date(2026, 8, 6),
            description="Cycle 19 posted txn",
            user=self.admin,
        )
        return account, post_transaction(transaction=txn, user=self.admin)


class PostedTransactionCannotBePurgedTests(Cycle19TreasuryTestBase):
    """Bug E-2: destroy() refused a posted transaction but permanent_delete
    purged it anyway, leaving the account balance unexplained."""

    def test_destroy_still_refuses_a_posted_transaction(self):
        _account, txn = self.make_posted_transaction()
        response = self.client.delete(f"{TXN_URL}{txn.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Transaction.objects.filter(pk=txn.id).exists())

    def test_permanent_delete_now_refuses_a_posted_transaction(self):
        account, txn = self.make_posted_transaction()
        account.refresh_from_db()
        balance_after_post = account.current_balance

        response = self.client.delete(
            f"{TXN_URL}{txn.id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Transaction.all_objects.filter(pk=txn.id).exists())
        account.refresh_from_db()
        self.assertEqual(account.current_balance, balance_after_post)

    def test_permanent_delete_refuses_a_cancelled_transaction(self):
        """A cancelled transaction's balance effect is already reversed, but
        purging it would erase the audit trail of the reversal itself."""
        _account, txn = self.make_posted_transaction()
        txn = cancel_transaction(transaction=txn, user=self.admin, reason="Wrong amount")

        response = self.client.delete(
            f"{TXN_URL}{txn.id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Transaction.all_objects.filter(pk=txn.id).exists())

    def test_permanent_delete_still_allows_a_draft_transaction(self):
        """Sanity check: the new guard must not over-refuse. A DRAFT
        transaction (never posted, never reconciled) is still purgeable."""
        account = self.make_account()
        txn = create_transaction(
            account=account,
            transaction_type=self.txn_type,
            direction=Transaction.Direction.INBOUND,
            amount=D("50.0000"),
            transaction_date=date(2026, 8, 6),
            description="Still a draft",
            user=self.admin,
        )

        response = self.client.delete(
            f"{TXN_URL}{txn.id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Transaction.all_objects.filter(pk=txn.id).exists())


class ReconciledTransactionCannotBePurgedTests(Cycle19TreasuryTestBase):
    """Bug E-3: a transaction frozen inside a COMPLETED reconciliation could
    still be purged, leaving the signed-off period's computed_balance
    referencing evidence that no longer exists."""

    def test_permanent_delete_refuses_a_reconciled_transaction(self):
        account, txn = self.make_posted_transaction()

        rec = open_reconciliation(
            account=account,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
            statement_balance=D("0.0000"),
            user=self.admin,
        )
        attach_transaction_to_reconciliation(reconciliation=rec, transaction=txn, user=self.admin)
        computed = reconciliation_computed_balance(rec)
        rec.statement_balance = computed
        rec.save(update_fields=["statement_balance"])
        rec = complete_reconciliation(reconciliation=rec, user=self.admin)

        response = self.client.delete(
            f"{TXN_URL}{txn.id}/permanent/", {"confirm": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Transaction.all_objects.filter(pk=txn.id).exists())
        rec.refresh_from_db()
        self.assertEqual(rec.transactions.count(), 1)
