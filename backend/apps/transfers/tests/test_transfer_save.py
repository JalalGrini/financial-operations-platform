"""Saving a cash transfer, end to end.

WHY THIS FILE EXISTS
--------------------
The transfers app shipped with NO tests, and as a direct result shipped a model
that could not be inserted even once: `CashTransfer` inherits
`ReferenceTrackedModel` but never overrode `generate_reference()`, so
`ReferenceModel.save()` fell through to the abstract base and raised
NotImplementedError on every POST. `efop_qa` contained zero transfers, which
matches the report "idk why it can't save a thing".

A second, quieter defect sat behind it: `get_serializer_class()` returns the
thin write serializer for create/update and DRF echoes that serializer back as
the response body. The body therefore had no `id`, and the frontend's
`router.push('/transfers/' + result.id)` navigated to `/transfers/undefined`,
so even a committed save looked like a failure.

Endpoints mirror frontend/src/features/transfers/api.ts:
  create   POST /transfers/cash-transfers/
  update   PATCH /transfers/cash-transfers/{id}/
  confirm  POST /transfers/cash-transfers/{id}/confirm/
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.companies.models import Company
from apps.parties.models import AssociatedPerson, AssociatedPersonType
from apps.transfers.models import CashTransfer, TransferStatus

TRANSFERS = "/api/v1/transfers/cash-transfers/"


class TransferTestData(APITestCase):
    """Shared fixtures for the transfers suite."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="transfers@example.com",
            password="StrongPass123!",
            first_name="Tra",
            last_name="Nsfer",
        )
        Group.objects.get_or_create(name="Administrator")[0].user_set.add(self.user)
        self.client.force_authenticate(self.user)

        self.alpha = self._company("Alpha SARL", "RC-ALPHA", "IF-ALPHA")
        self.beta = self._company("Beta SARL", "RC-BETA", "IF-BETA")

        self.person_type = AssociatedPersonType.objects.create(name="Director")
        self.karim = AssociatedPerson.objects.create(
            first_name="Karim",
            last_name="Director",
            person_type=self.person_type,
        )

    def _company(self, name, rc, tax):
        return Company.objects.create(
            name=name,
            registration_number=rc,
            tax_id=tax,
            address="Casablanca",
            phone="0500000000",
            email=f"{rc.lower()}@example.invalid",
        )

    def _payload(self, **overrides):
        payload = {
            "from_entity_type": "company",
            "from_company": str(self.alpha.pk),
            "to_entity_type": "company",
            "to_company": str(self.beta.pk),
            "amount": "1500.00",
            "currency": "MAD",
            "transfer_date": date(2026, 8, 20).isoformat(),
            "note": "",
        }
        payload.update(overrides)
        return payload


class CashTransferCreateTests(TransferTestData):
    def test_create_returns_201(self):
        """The headline regression: this raised NotImplementedError -> 500."""
        response = self.client.post(TRANSFERS, self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(CashTransfer.objects.count(), 1)

    def test_create_generates_a_reference(self):
        response = self.client.post(TRANSFERS, self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        reference = response.data["reference"]
        self.assertRegex(reference, r"^TRF-\d{4}-\d{5}$")

    def test_create_response_carries_the_saved_resource_not_the_input(self):
        """Guards the /transfers/undefined redirect.

        The frontend navigates to the new record using `result.id`, so the body
        must describe the saved row. Asserting on the read-only fields the write
        serializer does not have is what makes this fail if the response is ever
        switched back to the write serializer.
        """
        response = self.client.post(TRANSFERS, self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        for field in ("id", "reference", "status", "from_label", "to_label", "is_editable"):
            self.assertIn(field, response.data, f"create response is missing '{field}'")
        self.assertIsNotNone(response.data["id"])
        self.assertEqual(response.data["from_label"], "Alpha SARL")
        self.assertEqual(response.data["to_label"], "Beta SARL")

    def test_update_response_carries_the_saved_resource(self):
        created = self.client.post(TRANSFERS, self._payload(), format="json")
        transfer_id = created.data["id"]
        response = self.client.patch(
            f"{TRANSFERS}{transfer_id}/", {"amount": "1750.00"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["id"], transfer_id)
        self.assertEqual(Decimal(response.data["amount"]), Decimal("1750.0000"))

    def test_create_records_who_did_it(self):
        """created_by was never populated, so the audit trail could not say
        who moved the money."""
        response = self.client.post(TRANSFERS, self._payload(), format="json")
        transfer = CashTransfer.objects.get(pk=response.data["id"])
        self.assertEqual(transfer.created_by, self.user)
        self.assertEqual(transfer.updated_by, self.user)

    def test_references_increment(self):
        first = self.client.post(TRANSFERS, self._payload(), format="json")
        second = self.client.post(TRANSFERS, self._payload(), format="json")
        self.assertLess(first.data["reference"], second.data["reference"])

    def test_reference_does_not_collide_with_an_archived_transfer(self):
        """`reference` is unique across archived rows too, so a generator that
        only looked at active rows would collide here (Cycle 24 F-1/F-2)."""
        first = self.client.post(TRANSFERS, self._payload(), format="json")
        CashTransfer.objects.get(pk=first.data["id"]).archive(user=self.user)

        second = self.client.post(TRANSFERS, self._payload(), format="json")
        self.assertEqual(second.status_code, 201, second.data)
        self.assertNotEqual(first.data["reference"], second.data["reference"])

    def test_person_to_company_transfer_saves(self):
        response = self.client.post(
            TRANSFERS,
            self._payload(
                from_entity_type="associated_person",
                from_company=None,
                from_associated_person=str(self.karim.pk),
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["from_label"], "Karim Director")

    def test_confirm_marks_the_transfer_confirmed(self):
        created = self.client.post(TRANSFERS, self._payload(), format="json")
        response = self.client.post(f"{TRANSFERS}{created.data['id']}/confirm/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], TransferStatus.CONFIRMED)
        self.assertIsNotNone(response.data["confirmed_at"])


class CashTransferValidationTests(TransferTestData):
    def test_company_cannot_transfer_to_itself(self):
        response = self.client.post(
            TRANSFERS, self._payload(to_company=str(self.alpha.pk)), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_company_entity_type_requires_a_company(self):
        response = self.client.post(TRANSFERS, self._payload(from_company=None), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("from_company", response.data)

    def test_zero_amount_is_rejected(self):
        response = self.client.post(TRANSFERS, self._payload(amount="0"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.data)

    def test_negative_amount_is_rejected(self):
        """Direction is carried by the from/to pair, so a negative amount would
        silently invert the transfer and corrupt both balances."""
        response = self.client.post(TRANSFERS, self._payload(amount="-500"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.data)

    def test_partial_update_into_a_self_transfer_is_rejected(self):
        """The old validate() read only `attrs`, so a PATCH that changed one
        side skipped every rule and could create a self-transfer."""
        created = self.client.post(TRANSFERS, self._payload(), format="json")
        response = self.client.patch(
            f"{TRANSFERS}{created.data['id']}/",
            {"to_company": str(self.alpha.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)

    def test_switching_entity_type_clears_the_unused_side(self):
        """A stale FK left on the other side would keep counting toward that
        entity's balance."""
        created = self.client.post(TRANSFERS, self._payload(), format="json")
        response = self.client.patch(
            f"{TRANSFERS}{created.data['id']}/",
            {
                "from_entity_type": "associated_person",
                "from_associated_person": str(self.karim.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        transfer = CashTransfer.objects.get(pk=created.data["id"])
        self.assertIsNone(transfer.from_company_id)
        self.assertEqual(transfer.from_associated_person_id, self.karim.pk)
