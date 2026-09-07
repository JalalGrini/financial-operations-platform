"""Behavioural regression tests for the Cycle 24 fix (F-1):
apps/common/models.py::generate_sequential_reference replacing
count()-based reference generation, which collided with the UNIQUE
constraint on `reference` after archiving any row of that type.

One representative model per affected app family. See
state/IMPLEMENTATION_PLAN.md Section 18 for the full defect list and fix.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase

from apps.configuration.models import Category

User = get_user_model()


class Cycle24CategoryReferenceAfterArchiveTests(TestCase):
    """F-1 (configuration family): Category.generate_reference used
    count() + 1 against the active-only manager, so archiving any category
    caused the next create to collide with the archived row's reference."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="c24-category@example.com",
            password="testpass123",
            first_name="Cycle24",
            last_name="Category",
        )

    def test_create_after_archiving_the_only_category_does_not_collide(self):
        first = Category.objects.create(name="Cycle24 Cat A", created_by=self.user)
        first.is_archived = True
        first.save(update_fields=["is_archived"])

        with transaction.atomic():
            second = Category.objects.create(name="Cycle24 Cat B", created_by=self.user)

        self.assertNotEqual(second.reference, first.reference)
        self.assertEqual(Category.all_objects.filter(reference=second.reference).count(), 1)

    def test_create_after_archiving_the_latest_of_several_does_not_collide(self):
        cats = [
            Category.objects.create(name=f"Cycle24 Cat {i}", created_by=self.user) for i in range(3)
        ]
        latest = max(cats, key=lambda c: c.reference)
        latest.is_archived = True
        latest.save(update_fields=["is_archived"])

        with transaction.atomic():
            new_cat = Category.objects.create(name="Cycle24 Cat New", created_by=self.user)

        all_refs = list(Category.all_objects.values_list("reference", flat=True))
        self.assertEqual(
            len(all_refs), len(set(all_refs)), "reference must remain unique across all_objects"
        )
        self.assertIn(new_cat.reference, all_refs)
