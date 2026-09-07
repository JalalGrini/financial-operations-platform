# apps/treasury/tests/test_treasury.py
"""Treasury model and service tests.

The rules being pinned here are the ones that cost real money when wrong:
balances move exactly once, transfers are atomic on both sides, reconciled
history is frozen, and nothing is ever stored as a float.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType, TransactionType
from apps.financial_records.models import FinancialRecord
from apps.treasury.models import Account, Reconciliation, Transaction
from apps.treasury.selectors import (
    account_totals,
    accounts_with_balance_drift,
    company_cash_position,
    ledger_balance,
    running_balance,
    transfer_legs,
    unreconciled_posted_transactions,
)
from apps.treasury.services import (
    archive_transaction,
    attach_transaction_to_reconciliation,
    cancel_transaction,
    complete_reconciliation,
    create_account,
    create_transaction,
    open_reconciliation,
    post_transaction,
    reopen_reconciliation,
    transfer_between_accounts,
    update_transaction,
)

User = get_user_model()

D = Decimal


class TreasuryTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = User.objects.create_user(
            email="treasury@example.com",
            password="testpass123",
            first_name="Tre",
            last_name="Asury",
        )
        cls.company = Company.objects.create(name="Treasury Test Co", created_by=cls.user)
        cls.txn_type = TransactionType.objects.create(
            name="Treasury Test Payment", created_by=cls.user
        )

    def make_account(self, name="Main Bank", opening=D("0.0000"), **extra):
        return create_account(
            company=self.company,
            name=name,
            user=self.user,
            opening_balance=opening,
            **extra,
        )

    def make_txn(self, account, direction, amount, day=15, **extra):
        return create_transaction(
            account=account,
            transaction_type=self.txn_type,
            direction=direction,
            amount=amount,
            transaction_date=date(2026, 8, day),
            description="Test movement",
            user=self.user,
            **extra,
        )


class AccountTests(TreasuryTestBase):
    def test_an_account_gets_a_readable_reference(self):
        account = self.make_account()
        self.assertTrue(account.reference.startswith("ACC-2026-"))

    def test_references_do_not_collide(self):
        first = self.make_account(name="One")
        second = self.make_account(name="Two")
        self.assertNotEqual(first.reference, second.reference)

    def test_opening_balance_seeds_the_current_balance(self):
        account = self.make_account(opening=D("5000.0000"))
        self.assertEqual(account.current_balance, D("5000.0000"))

    def test_a_float_opening_balance_is_refused(self):
        with self.assertRaises(ValueError):
            create_account(
                company=self.company,
                name="Floaty",
                user=self.user,
                opening_balance=5000.50,
            )

    def test_two_active_accounts_cannot_share_a_name_in_one_company(self):
        self.make_account(name="Duplicate")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Account.objects.create(
                    company=self.company,
                    name="Duplicate",
                    created_by=self.user,
                )


class TransactionLifecycleTests(TreasuryTestBase):
    def setUp(self):
        self.account = self.make_account(opening=D("1000.0000"))

    def test_a_new_transaction_is_a_draft(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        self.assertEqual(txn.status, Transaction.Status.DRAFT)

    def test_a_draft_does_not_move_the_balance(self):
        self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1000.0000"))

    def test_posting_an_inbound_increases_the_balance(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1250.0000"))

    def test_posting_an_outbound_decreases_the_balance(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("600.0000"))

    def test_a_transaction_cannot_be_posted_twice(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        with self.assertRaises(ValidationError):
            post_transaction(transaction=txn, user=self.user)

    def test_double_posting_cannot_move_the_balance_twice(self):
        """The balance consequence of the rule above, pinned separately."""
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        try:
            post_transaction(transaction=txn, user=self.user)
        except ValidationError:
            pass
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1250.0000"))

    def test_a_posted_transaction_cannot_be_edited(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        with self.assertRaises(ValidationError):
            update_transaction(transaction=txn, user=self.user, description="Rewritten")

    def test_a_draft_can_be_edited(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        update_transaction(transaction=txn, user=self.user, description="Corrected")
        txn.refresh_from_db()
        self.assertEqual(txn.description, "Corrected")

    def test_an_unlisted_field_cannot_be_edited(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        with self.assertRaises(ValueError):
            update_transaction(transaction=txn, user=self.user, status="posted")

    def test_the_account_cannot_be_switched_by_an_edit(self):
        """Moving a posted-nowhere draft between accounts is not an edit we allow."""
        other = self.make_account(name="Other Bank")
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        with self.assertRaises(ValueError):
            update_transaction(transaction=txn, user=self.user, account=other)

    def test_a_zero_amount_is_refused(self):
        with self.assertRaises(ValidationError):
            self.make_txn(self.account, Transaction.Direction.INBOUND, D("0.0000"))

    def test_a_negative_amount_is_refused(self):
        with self.assertRaises(ValidationError):
            self.make_txn(self.account, Transaction.Direction.INBOUND, D("-50.0000"))

    def test_a_float_amount_is_refused(self):
        with self.assertRaises(ValidationError):
            self.make_txn(self.account, Transaction.Direction.INBOUND, 50.25)

    def test_the_database_itself_refuses_a_negative_amount(self):
        """Belt and braces: the check constraint, not just the validator."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Transaction.objects.create(
                    account=self.account,
                    transaction_type=self.txn_type,
                    direction=Transaction.Direction.INBOUND,
                    amount=D("-1.0000"),
                    transaction_date=date(2026, 8, 15),
                    description="Should not exist",
                    created_by=self.user,
                )

    def test_signed_amount_is_the_only_place_the_sign_lives(self):
        inbound = self.make_txn(self.account, Transaction.Direction.INBOUND, D("100.0000"))
        outbound = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("100.0000"))
        self.assertEqual(inbound.signed_amount, D("100.0000"))
        self.assertEqual(outbound.signed_amount, D("-100.0000"))

    def test_money_is_never_a_float(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.account.refresh_from_db()
        self.assertIsInstance(self.account.current_balance, Decimal)
        self.assertIsInstance(txn.amount, Decimal)
        self.assertNotIsInstance(self.account.current_balance, float)

    def test_a_currency_mismatch_is_refused(self):
        with self.assertRaises(ValidationError):
            self.make_txn(
                self.account,
                Transaction.Direction.INBOUND,
                D("100.0000"),
                currency="EUR",
            )


class CancellationTests(TreasuryTestBase):
    def setUp(self):
        self.account = self.make_account(opening=D("1000.0000"))

    def test_cancelling_a_posted_transaction_gives_the_money_back(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        post_transaction(transaction=txn, user=self.user)
        cancel_transaction(transaction=txn, user=self.user, reason="Paid twice")
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1000.0000"))

    def test_cancelling_a_draft_does_not_touch_the_balance(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        cancel_transaction(transaction=txn, user=self.user, reason="Keyed in error")
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1000.0000"))

    def test_a_cancellation_reason_is_mandatory(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        with self.assertRaises(ValueError):
            cancel_transaction(transaction=txn, user=self.user, reason="   ")

    def test_a_transaction_cannot_be_cancelled_twice(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        cancel_transaction(transaction=txn, user=self.user, reason="First")
        with self.assertRaises(ValidationError):
            cancel_transaction(transaction=txn, user=self.user, reason="Second")

    def test_double_cancellation_cannot_refund_twice(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        post_transaction(transaction=txn, user=self.user)
        cancel_transaction(transaction=txn, user=self.user, reason="First")
        try:
            cancel_transaction(transaction=txn, user=self.user, reason="Second")
        except ValidationError:
            pass
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance, D("1000.0000"))

    def test_a_posted_transaction_cannot_be_archived_directly(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        post_transaction(transaction=txn, user=self.user)
        with self.assertRaises(ValueError):
            archive_transaction(transaction=txn, user=self.user)

    def test_a_draft_can_be_archived(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("400.0000"))
        archive_transaction(transaction=txn, user=self.user, reason="Abandoned")
        txn.refresh_from_db()
        self.assertTrue(txn.is_archived)


class TransferTests(TreasuryTestBase):
    def setUp(self):
        self.source = self.make_account(name="Source", opening=D("1000.0000"))
        self.destination = self.make_account(name="Destination", opening=D("200.0000"))

    def do_transfer(self, amount=D("300.0000"), **extra):
        return transfer_between_accounts(
            source_account=self.source,
            destination_account=self.destination,
            amount=amount,
            transaction_date=date(2026, 8, 15),
            description="Internal move",
            transaction_type=self.txn_type,
            user=self.user,
            **extra,
        )

    def test_a_transfer_creates_two_legs(self):
        outbound, inbound = self.do_transfer()
        self.assertEqual(outbound.direction, Transaction.Direction.OUTBOUND)
        self.assertEqual(inbound.direction, Transaction.Direction.INBOUND)

    def test_both_legs_share_a_transfer_group(self):
        outbound, inbound = self.do_transfer()
        self.assertIsNotNone(outbound.transfer_group)
        self.assertEqual(outbound.transfer_group, inbound.transfer_group)

    def test_a_transfer_moves_both_balances(self):
        self.do_transfer(amount=D("300.0000"))
        self.source.refresh_from_db()
        self.destination.refresh_from_db()
        self.assertEqual(self.source.current_balance, D("700.0000"))
        self.assertEqual(self.destination.current_balance, D("500.0000"))

    def test_a_transfer_conserves_total_money(self):
        before = self.source.current_balance + self.destination.current_balance
        self.do_transfer(amount=D("300.0000"))
        self.source.refresh_from_db()
        self.destination.refresh_from_db()
        after = self.source.current_balance + self.destination.current_balance
        self.assertEqual(before, after)

    def test_a_transfer_to_the_same_account_is_refused(self):
        with self.assertRaises(ValidationError):
            transfer_between_accounts(
                source_account=self.source,
                destination_account=self.source,
                amount=D("100.0000"),
                transaction_date=date(2026, 8, 15),
                description="Nonsense",
                transaction_type=self.txn_type,
                user=self.user,
            )

    def test_a_cross_currency_transfer_is_refused(self):
        euro = create_account(
            company=self.company,
            name="Euro Account",
            user=self.user,
            currency="EUR",
        )
        with self.assertRaises(ValidationError):
            transfer_between_accounts(
                source_account=self.source,
                destination_account=euro,
                amount=D("100.0000"),
                transaction_date=date(2026, 8, 15),
                description="FX",
                transaction_type=self.txn_type,
                user=self.user,
            )

    def test_a_refused_transfer_leaves_no_partial_legs(self):
        """Atomicity: a refusal must not leave one side of the move behind."""
        before = Transaction.objects.count()
        with self.assertRaises(ValidationError):
            transfer_between_accounts(
                source_account=self.source,
                destination_account=self.source,
                amount=D("100.0000"),
                transaction_date=date(2026, 8, 15),
                description="Nonsense",
                transaction_type=self.txn_type,
                user=self.user,
            )
        self.assertEqual(Transaction.objects.count(), before)

    def test_transfer_legs_can_be_retrieved_together(self):
        outbound, _inbound = self.do_transfer()
        legs = transfer_legs(outbound.transfer_group)
        self.assertEqual(legs.count(), 2)

    def test_an_unposted_transfer_leaves_balances_alone(self):
        self.do_transfer(post=False)
        self.source.refresh_from_db()
        self.destination.refresh_from_db()
        self.assertEqual(self.source.current_balance, D("1000.0000"))
        self.assertEqual(self.destination.current_balance, D("200.0000"))


class ReconciliationTests(TreasuryTestBase):
    def setUp(self):
        self.account = self.make_account(opening=D("1000.0000"))
        self.txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("500.0000"))
        post_transaction(transaction=self.txn, user=self.user)

    def open_period(self, statement=D("1500.0000")):
        return open_reconciliation(
            account=self.account,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
            statement_balance=statement,
            user=self.user,
        )

    def test_a_reconciliation_gets_a_reference(self):
        rec = self.open_period()
        self.assertTrue(rec.reference.startswith("REC-2026-"))

    def test_a_posted_transaction_can_be_attached(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        self.assertEqual(rec.transactions.count(), 1)

    def test_a_draft_transaction_cannot_be_attached(self):
        rec = self.open_period()
        draft = self.make_txn(self.account, Transaction.Direction.INBOUND, D("10.0000"))
        with self.assertRaises(ValidationError):
            attach_transaction_to_reconciliation(
                reconciliation=rec, transaction=draft, user=self.user
            )

    def test_a_transaction_outside_the_period_cannot_be_attached(self):
        rec = open_reconciliation(
            account=self.account,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
            statement_balance=D("1000.0000"),
            user=self.user,
        )
        with self.assertRaises(ValidationError):
            attach_transaction_to_reconciliation(
                reconciliation=rec, transaction=self.txn, user=self.user
            )

    def test_a_transaction_from_another_account_cannot_be_attached(self):
        other = self.make_account(name="Elsewhere")
        foreign = self.make_txn(other, Transaction.Direction.INBOUND, D("50.0000"))
        post_transaction(transaction=foreign, user=self.user)
        rec = self.open_period()
        with self.assertRaises(ValidationError):
            attach_transaction_to_reconciliation(
                reconciliation=rec, transaction=foreign, user=self.user
            )

    def test_completing_a_balanced_period_succeeds(self):
        rec = self.open_period(statement=D("1500.0000"))
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        rec.refresh_from_db()
        self.assertEqual(rec.status, Reconciliation.Status.COMPLETED)

    def test_completing_an_unbalanced_period_is_refused(self):
        rec = self.open_period(statement=D("9999.0000"))
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        with self.assertRaises(ValueError):
            complete_reconciliation(reconciliation=rec, user=self.user)

    def test_completing_freezes_the_attached_transactions(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        self.txn.refresh_from_db()
        self.assertTrue(self.txn.is_reconciled)

    def test_a_reconciled_transaction_cannot_be_cancelled(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        self.txn.refresh_from_db()
        with self.assertRaises(ValidationError):
            cancel_transaction(transaction=self.txn, user=self.user, reason="Too late")

    def test_a_completed_period_cannot_be_completed_again(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        with self.assertRaises(ValidationError):
            complete_reconciliation(reconciliation=rec, user=self.user)

    def test_reopening_unfreezes_the_transactions(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        reopen_reconciliation(reconciliation=rec, user=self.user, reason="Bank correction")
        self.txn.refresh_from_db()
        self.assertFalse(self.txn.is_reconciled)

    def test_reopening_requires_a_reason(self):
        rec = self.open_period()
        attach_transaction_to_reconciliation(
            reconciliation=rec, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=rec, user=self.user)
        with self.assertRaises(ValueError):
            reopen_reconciliation(reconciliation=rec, user=self.user, reason="")

    def test_an_open_period_cannot_be_reopened(self):
        rec = self.open_period()
        with self.assertRaises(ValueError):
            reopen_reconciliation(reconciliation=rec, user=self.user, reason="Nothing to reopen")

    def test_the_period_end_cannot_precede_the_start(self):
        with self.assertRaises(ValidationError):
            open_reconciliation(
                account=self.account,
                period_start=date(2026, 8, 31),
                period_end=date(2026, 8, 1),
                statement_balance=D("0.0000"),
                user=self.user,
            )

    def test_the_difference_property_reports_the_gap(self):
        rec = self.open_period(statement=D("1600.0000"))
        rec.computed_balance = D("1500.0000")
        self.assertEqual(rec.difference, D("100.0000"))

    def test_a_second_consecutive_period_can_be_reconciled(self):
        """The baseline for period two is period one's closing balance.

        Regression test for the defect where the account opening balance was
        used as the baseline for every period, making the second month
        impossible to close.
        """
        # Period 1 (August): opening 1000 + the 500 inbound from setUp = 1500
        first = self.open_period(statement=D("1500.0000"))
        attach_transaction_to_reconciliation(
            reconciliation=first, transaction=self.txn, user=self.user
        )
        complete_reconciliation(reconciliation=first, user=self.user)

        # Period 2 (September): one more 200 inbound, so 1500 + 200 = 1700
        september = create_transaction(
            account=self.account,
            transaction_type=self.txn_type,
            direction=Transaction.Direction.INBOUND,
            amount=D("200.0000"),
            transaction_date=date(2026, 9, 10),
            description="September deposit",
            user=self.user,
        )
        post_transaction(transaction=september, user=self.user)

        second = open_reconciliation(
            account=self.account,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            statement_balance=D("1700.0000"),
            user=self.user,
        )
        attach_transaction_to_reconciliation(
            reconciliation=second, transaction=september, user=self.user
        )
        complete_reconciliation(reconciliation=second, user=self.user)

        second.refresh_from_db()
        self.assertEqual(second.status, Reconciliation.Status.COMPLETED)
        self.assertEqual(second.computed_balance, D("1700.0000"))


class SelectorTests(TreasuryTestBase):
    def setUp(self):
        self.account = self.make_account(opening=D("1000.0000"))

    def test_the_ledger_balance_matches_the_maintained_balance(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.account.refresh_from_db()
        self.assertEqual(ledger_balance(self.account), self.account.current_balance)

    def test_drafts_are_excluded_from_the_ledger_balance(self):
        self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        self.assertEqual(ledger_balance(self.account), D("1000.0000"))

    def test_there_is_no_drift_in_a_healthy_ledger(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.assertEqual(accounts_with_balance_drift(), [])

    def test_the_drift_detector_actually_detects_drift(self):
        """Corrupt the maintained balance the way a rogue write would."""
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        Account.objects.filter(pk=self.account.pk).update(current_balance=D("1.0000"))
        drift = accounts_with_balance_drift()
        self.assertEqual(len(drift), 1)
        account, stored, computed = drift[0]
        self.assertEqual(stored, D("1.0000"))
        self.assertEqual(computed, D("1250.0000"))

    def test_account_totals_split_inbound_and_outbound(self):
        post_transaction(
            transaction=self.make_txn(self.account, Transaction.Direction.INBOUND, D("300.0000")),
            user=self.user,
        )
        post_transaction(
            transaction=self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("100.0000")),
            user=self.user,
        )
        totals = account_totals(self.account)
        self.assertEqual(totals["inbound"], D("300.0000"))
        self.assertEqual(totals["outbound"], D("100.0000"))
        self.assertEqual(totals["net"], D("200.0000"))
        self.assertEqual(totals["closing_balance"], D("1200.0000"))

    def test_the_running_balance_walks_forward_in_order(self):
        post_transaction(
            transaction=self.make_txn(
                self.account, Transaction.Direction.INBOUND, D("300.0000"), day=10
            ),
            user=self.user,
        )
        post_transaction(
            transaction=self.make_txn(
                self.account, Transaction.Direction.OUTBOUND, D("100.0000"), day=20
            ),
            user=self.user,
        )
        rows = running_balance(self.account)
        self.assertEqual(rows[0]["balance_after"], D("1300.0000"))
        self.assertEqual(rows[1]["balance_after"], D("1200.0000"))

    def test_the_running_balance_ends_at_the_account_balance(self):
        post_transaction(
            transaction=self.make_txn(self.account, Transaction.Direction.INBOUND, D("300.0000")),
            user=self.user,
        )
        rows = running_balance(self.account)
        self.account.refresh_from_db()
        self.assertEqual(rows[-1]["balance_after"], self.account.current_balance)

    def test_the_cash_position_is_broken_down_by_currency(self):
        create_account(
            company=self.company,
            name="Euro Pot",
            user=self.user,
            currency="EUR",
            opening_balance=D("500.0000"),
        )
        position = company_cash_position(self.company)
        self.assertEqual(position["MAD"], D("1000.0000"))
        self.assertEqual(position["EUR"], D("500.0000"))

    def test_unreconciled_posted_transactions_are_listed(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        self.assertEqual(unreconciled_posted_transactions(self.account).count(), 1)

    def test_a_cancelled_transaction_leaves_the_ledger_balance_intact(self):
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("250.0000"))
        post_transaction(transaction=txn, user=self.user)
        cancel_transaction(transaction=txn, user=self.user, reason="Reversed")
        self.assertEqual(ledger_balance(self.account), D("1000.0000"))


class IntegrityGuardTests(TreasuryTestBase):
    """Guards against corrupting data across account state and companies."""

    def setUp(self):
        self.account = self.make_account(opening=D("1000.0000"))

    def test_a_draft_cannot_be_created_on_an_archived_account(self):
        self.account.archive(user=self.user, reason="Closed")
        with self.assertRaises(ValidationError):
            self.make_txn(self.account, Transaction.Direction.INBOUND, D("50.0000"))

    def test_a_draft_cannot_be_created_on_an_inactive_account(self):
        self.account.is_active = False
        self.account.save(update_fields=["is_active"])
        with self.assertRaises(ValidationError):
            self.make_txn(self.account, Transaction.Direction.INBOUND, D("50.0000"))

    def test_a_transaction_cannot_be_linked_to_another_companys_record(self):
        other_company = Company.objects.create(name="Other Co", created_by=self.user)
        record_type = FinancialRecordType.objects.create(
            name="Treasury Link Type", created_by=self.user
        )
        foreign_record = FinancialRecord.objects.create(
            company=other_company,
            record_type=record_type,
            record_date=date(2026, 8, 15),
            description="Foreign invoice",
            created_by=self.user,
        )
        with self.assertRaises(ValidationError):
            self.make_txn(
                self.account,
                Transaction.Direction.INBOUND,
                D("50.0000"),
                financial_record=foreign_record,
            )

    def test_a_transaction_cannot_be_updated_to_link_another_companys_record(self):
        other_company = Company.objects.create(name="Other Co 2", created_by=self.user)
        record_type = FinancialRecordType.objects.create(
            name="Treasury Link Type 2", created_by=self.user
        )
        foreign_record = FinancialRecord.objects.create(
            company=other_company,
            record_type=record_type,
            record_date=date(2026, 8, 15),
            description="Foreign invoice 2",
            created_by=self.user,
        )
        txn = self.make_txn(self.account, Transaction.Direction.INBOUND, D("50.0000"))
        with self.assertRaises(ValidationError):
            update_transaction(transaction=txn, user=self.user, financial_record=foreign_record)

    def test_a_transaction_can_be_linked_to_the_same_companys_record(self):
        record_type = FinancialRecordType.objects.create(
            name="Treasury Link Type 3", created_by=self.user
        )
        own_record = FinancialRecord.objects.create(
            company=self.company,
            record_type=record_type,
            record_date=date(2026, 8, 15),
            description="Own invoice",
            created_by=self.user,
        )
        txn = self.make_txn(
            self.account,
            Transaction.Direction.INBOUND,
            D("50.0000"),
            financial_record=own_record,
        )
        self.assertEqual(txn.financial_record_id, own_record.id)

    def test_cancelling_detaches_from_an_open_reconciliation(self):
        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("100.0000"))
        post_transaction(transaction=txn, user=self.user)
        rec = open_reconciliation(
            account=self.account,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
            statement_balance=D("900.0000"),
            user=self.user,
        )
        attach_transaction_to_reconciliation(reconciliation=rec, transaction=txn, user=self.user)
        cancel_transaction(transaction=txn, user=self.user, reason="Reversed before closing")
        txn.refresh_from_db()
        self.assertIsNone(txn.reconciliation_id)

    def test_a_cancelled_and_detached_transaction_does_not_count_toward_the_open_period(self):
        from apps.treasury.selectors import reconciliation_computed_balance

        txn = self.make_txn(self.account, Transaction.Direction.OUTBOUND, D("100.0000"))
        post_transaction(transaction=txn, user=self.user)
        rec = open_reconciliation(
            account=self.account,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
            statement_balance=D("900.0000"),
            user=self.user,
        )
        attach_transaction_to_reconciliation(reconciliation=rec, transaction=txn, user=self.user)
        cancel_transaction(transaction=txn, user=self.user, reason="Reversed before closing")
        rec.refresh_from_db()
        self.assertEqual(reconciliation_computed_balance(rec), D("1000.0000"))
