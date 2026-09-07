"""Behavioural regression test for the Cycle 24 fixes (F-2):
PayrollAdjustment.generate_reference was concurrency-safe (used
select_for_update) but queried the active-only `objects` manager instead of
`all_objects`, so archiving any adjustment caused the next create to collide
with the UNIQUE constraint on `reference`.

See state/IMPLEMENTATION_PLAN.md Section 18 for the full defect list and fix.
"""

from django.db import transaction
from django.test import TestCase

from apps.personnel.models import PayrollAdjustment
from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_payroll,
    create_test_user,
)


class Cycle24PayrollAdjustmentReferenceAfterArchiveTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(email="c24-adjustment@example.com")
        cls.payroll = create_test_payroll(user=cls.user)

    def test_create_after_archiving_the_only_adjustment_does_not_collide(self):
        first = create_test_adjustment(payroll=self.payroll, user=self.user)
        first.is_archived = True
        first.save(update_fields=["is_archived"])

        with transaction.atomic():
            second = create_test_adjustment(payroll=self.payroll, user=self.user)

        self.assertNotEqual(second.reference, first.reference)
        self.assertEqual(
            PayrollAdjustment.all_objects.filter(reference=second.reference).count(), 1
        )
