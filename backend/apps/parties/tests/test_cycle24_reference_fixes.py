"""Behavioural regression test for the Cycle 24 fix (F-1): Client.generate_reference
used count() + 1 against the active-only manager, so archiving any client caused
the next create to collide with the UNIQUE constraint on `reference`.

See state/IMPLEMENTATION_PLAN.md Section 18 for the full defect list and fix.
"""

from django.db import transaction
from django.test import TestCase

from apps.accounts.models import User
from apps.parties.models import Client


class Cycle24ClientReferenceAfterArchiveTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="c24-client@example.com",
            password="testpass123",
            first_name="Cycle24",
            last_name="Client",
        )

    def test_create_after_archiving_the_only_client_does_not_collide(self):
        first = Client.objects.create(name="Cycle24 Client A", created_by=self.user)
        first.is_archived = True
        first.save(update_fields=["is_archived"])

        with transaction.atomic():
            second = Client.objects.create(name="Cycle24 Client B", created_by=self.user)

        self.assertNotEqual(second.reference, first.reference)
        self.assertEqual(Client.all_objects.filter(reference=second.reference).count(), 1)
