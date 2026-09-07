# apps/financial_records/tests/test_double_entry.py
"""
The invariants that make this module trustworthy with money.

Every test here targets a way the books could silently go wrong. Coverage of
happy paths is deliberately secondary: a financial module that merely works when
used correctly is not safe. What matters is that it refuses to do the wrong
thing when used incorrectly.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.companies.models import Company
from apps.configuration.models import FinancialRecordType
from apps.financial_records.models import FinancialRecord, FinancialRecordLine
from apps.financial_records.selectors import record_balance, unbalanced_posted_records
from apps.financial_records.services import (
    add_line,
    archive_record,
    attach_document,
    cancel_record,
    create_record,
    post_record,
    update_record,
)

User = get_user_model()


class FinancialRecordTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="fr-tester@example.com",
            password="testpass123",
            first_name="Fin",
            last_name="Tester",
        )
        cls.company = Company.objects.create(name="Ledger Co", created_by=cls.user)
        cls.record_type = FinancialRecordType.objects.create(
            name="Purchase Invoice",
            nature=FinancialRecordType.RecordNature.EXPENSE,
            created_by=cls.user,
        )

    def make_draft(self, description="Office supplies"):
        return create_record(
            company=self.company,
            record_type=self.record_type,
            record_date=date(2026, 8, 6),
            description=description,
            user=self.user,
        )

    def make_balanced_draft(self, amount="1500.0000"):
        record = self.make_draft()
        add_line(record=record, user=self.user, debit=Decimal(amount), description="Expense")
        add_line(record=record, user=self.user, credit=Decimal(amount), description="Payable")
        return record


class BalanceInvariantTests(FinancialRecordTestBase):
    """Debits must equal credits. This is the whole point of double entry."""

    def test_a_balanced_record_posts(self):
        record = self.make_balanced_draft("1500.0000")
        posted = post_record(record=record, user=self.user)

        self.assertEqual(posted.status, FinancialRecord.Status.POSTED)
        self.assertEqual(posted.total_amount, Decimal("1500.0000"))
        self.assertEqual(record_balance(posted), Decimal("0.0000"))

    def test_an_unbalanced_record_is_refused(self):
        """Money must not appear from nowhere."""
        record = self.make_draft()
        add_line(record=record, user=self.user, debit=Decimal("1000.0000"))
        add_line(record=record, user=self.user, credit=Decimal("900.0000"))

        with self.assertRaises(ValidationError) as caught:
            post_record(record=record, user=self.user)

        self.assertIn("balance", str(caught.exception).lower())
        record.refresh_from_db()
        self.assertEqual(
            record.status,
            FinancialRecord.Status.DRAFT,
            "A refused posting must leave the record in draft, not half-posted.",
        )

    def test_a_record_with_no_lines_cannot_post(self):
        """An empty record balances trivially, so it needs its own check."""
        record = self.make_draft()
        with self.assertRaises(ValidationError):
            post_record(record=record, user=self.user)

    def test_tiny_imbalance_is_caught(self):
        """One hundredth of a centime is still an imbalance.

        With float arithmetic this is exactly the discrepancy that disappears.
        """
        record = self.make_draft()
        add_line(record=record, user=self.user, debit=Decimal("1000.0001"))
        add_line(record=record, user=self.user, credit=Decimal("1000.0000"))

        with self.assertRaises(ValidationError):
            post_record(record=record, user=self.user)

    def test_multi_line_records_balance_across_all_lines(self):
        record = self.make_draft()
        add_line(record=record, user=self.user, debit=Decimal("600.0000"))
        add_line(record=record, user=self.user, debit=Decimal("400.0000"))
        add_line(record=record, user=self.user, credit=Decimal("1000.0000"))

        posted = post_record(record=record, user=self.user)
        self.assertEqual(posted.total_amount, Decimal("1000.0000"))


class MoneyIsDecimalTests(FinancialRecordTestBase):
    """Amounts must never round-trip through float."""

    def test_amounts_come_back_as_decimal(self):
        record = self.make_balanced_draft("1234.5678")
        line = FinancialRecordLine.objects.filter(record=record, debit__gt=0).first()
        self.assertIsInstance(line.debit, Decimal)
        self.assertEqual(line.debit, Decimal("1234.5678"))

    def test_four_decimal_places_survive_the_database(self):
        """Truncation to two places would silently lose money at scale."""
        record = self.make_balanced_draft("0.0001")
        posted = post_record(record=record, user=self.user)
        self.assertEqual(posted.total_amount, Decimal("0.0001"))

    def test_repeated_additions_do_not_drift(self):
        """Three lines of 0.1 must total exactly 0.3, which floats do not."""
        record = self.make_draft()
        for _ in range(3):
            add_line(record=record, user=self.user, debit=Decimal("0.1000"))
        add_line(record=record, user=self.user, credit=Decimal("0.3000"))

        posted = post_record(record=record, user=self.user)
        self.assertEqual(posted.total_amount, Decimal("0.3000"))


class ImmutabilityTests(FinancialRecordTestBase):
    """A posted record is a historical fact."""

    def test_posted_records_cannot_be_edited(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)

        with self.assertRaises(ValidationError):
            update_record(record=record, user=self.user, description="Rewritten")

    def test_posted_records_cannot_gain_lines(self):
        """Adding a line after posting would break the stored total silently."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)

        with self.assertRaises(ValidationError):
            add_line(record=record, user=self.user, debit=Decimal("50.0000"))

    def test_a_record_cannot_be_posted_twice(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)

        with self.assertRaises(ValidationError):
            post_record(record=record, user=self.user)

    def test_drafts_remain_editable(self):
        record = self.make_draft()
        updated = update_record(record=record, user=self.user, description="Corrected")
        self.assertEqual(updated.description, "Corrected")

    def test_unknown_fields_are_rejected_rather_than_ignored(self):
        """Silently dropping an unrecognised field hides caller bugs."""
        record = self.make_draft()
        with self.assertRaises(ValueError):
            update_record(record=record, user=self.user, status="posted")


class CancellationTests(FinancialRecordTestBase):
    """Corrections leave a trail."""

    def test_cancelling_requires_a_reason(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)

        with self.assertRaises(ValueError):
            cancel_record(record=record, user=self.user, reason="   ")

    def test_cancelled_record_keeps_its_reason_and_becomes_immutable(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)
        cancelled = cancel_record(
            record=record, user=self.user, reason="Duplicate of FRC-2026-00002"
        )

        self.assertEqual(cancelled.status, FinancialRecord.Status.CANCELLED)
        self.assertEqual(cancelled.cancellation_reason, "Duplicate of FRC-2026-00002")
        self.assertIsNotNone(cancelled.cancelled_at)
        with self.assertRaises(ValidationError):
            update_record(record=record, user=self.user, description="Nope")

    def test_a_record_cannot_be_cancelled_twice(self):
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)
        cancel_record(record=record, user=self.user, reason="First")

        with self.assertRaises(ValueError):
            cancel_record(record=record, user=self.user, reason="Second")


class SoftDeleteTests(FinancialRecordTestBase):
    """Archive, never destroy."""

    def test_archiving_hides_from_default_manager_but_keeps_the_row(self):
        # A POSTED record can no longer be archived directly (bug E-1,
        # Cycle 19 - state/IMPLEMENTATION_PLAN.md Section 13.2): it must be
        # cancelled first, so the correction itself is recorded. Cancel,
        # then archive, to exercise the same soft-delete behavior this test
        # has always covered.
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)
        cancel_record(record=record, user=self.user, reason="Superseded")
        archive_record(record=record, user=self.user, reason="Superseded")

        self.assertFalse(FinancialRecord.objects.filter(pk=record.pk).exists())
        self.assertTrue(FinancialRecord.all_objects.filter(pk=record.pk).exists())

    def test_a_posted_record_cannot_be_archived_directly(self):
        """Bug E-1 (Cycle 19): archive_record() had no status guard at all,
        so a POSTED record - and the balanced ledger lines proving it -
        could be archived (and then permanently purged) through the
        ordinary API."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)

        with self.assertRaises(ValueError):
            archive_record(record=record, user=self.user, reason="Superseded")

        record.refresh_from_db()
        self.assertFalse(record.is_archived)


class DatabaseLevelGuardTests(FinancialRecordTestBase):
    """The database refuses malformed lines even if a service is bypassed.

    Application checks protect the API. These protect the data from scripts,
    shell sessions and future code paths that forget to call the service.
    """

    def test_a_line_cannot_carry_both_debit_and_credit(self):
        record = self.make_draft()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FinancialRecordLine.objects.create(
                    record=record,
                    line_number=1,
                    debit=Decimal("10.0000"),
                    credit=Decimal("10.0000"),
                    created_by=self.user,
                )

    def test_a_line_cannot_be_empty(self):
        record = self.make_draft()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FinancialRecordLine.objects.create(
                    record=record,
                    line_number=1,
                    debit=Decimal("0.0000"),
                    credit=Decimal("0.0000"),
                    created_by=self.user,
                )

    def test_line_numbers_are_unique_within_a_record(self):
        record = self.make_draft()
        add_line(record=record, user=self.user, debit=Decimal("5.0000"))
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FinancialRecordLine.objects.create(
                    record=record,
                    line_number=1,
                    debit=Decimal("5.0000"),
                    created_by=self.user,
                )

    def test_line_numbers_are_allocated_sequentially(self):
        record = self.make_draft()
        first = add_line(record=record, user=self.user, debit=Decimal("1.0000"))
        second = add_line(record=record, user=self.user, credit=Decimal("1.0000"))
        self.assertEqual([first.line_number, second.line_number], [1, 2])


class ReferenceTests(FinancialRecordTestBase):
    def test_references_are_generated_and_unique(self):
        first = self.make_draft("One")
        second = self.make_draft("Two")

        self.assertTrue(first.reference.startswith("FRC-"))
        self.assertNotEqual(first.reference, second.reference)


class IntegrityProbeTests(FinancialRecordTestBase):
    def test_no_posted_record_is_ever_unbalanced(self):
        """The probe reconciliation and health checks will rely on."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)
        self.assertEqual(unbalanced_posted_records(), [])


class AttachmentTests(FinancialRecordTestBase):
    def test_attachments_store_a_key_not_a_blob(self):
        record = self.make_balanced_draft()
        attachment = attach_document(
            record=record,
            user=self.user,
            file_key="records/2026/08/invoice-001.pdf",
            file_name="invoice-001.pdf",
            content_type="application/pdf",
            size_bytes=48213,
        )
        self.assertEqual(attachment.file_key, "records/2026/08/invoice-001.pdf")
        self.assertFalse(hasattr(attachment, "data"))

    def test_supporting_documents_may_be_added_after_posting(self):
        """Paperwork arrives late; refusing it would push people to edit history."""
        record = self.make_balanced_draft()
        post_record(record=record, user=self.user)
        attachment = attach_document(
            record=record,
            user=self.user,
            file_key="records/2026/08/receipt.pdf",
            file_name="receipt.pdf",
        )
        self.assertIsNotNone(attachment.pk)
