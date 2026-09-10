"""Per-entity balances and the zero-sum invariant.

Requested as: "it should be showing the amount that each company or person has
and ofc some will have minus and some have positive and the sum of everything
will be 0 cuz the transfers are only internal".

The invariant that actually holds is on NET TRANSFERS, not on the current
balance. Σ net_transfers is exactly 0 because every transfer debits one entity
and credits another inside the group. Once entities are given opening
balances, Σ current == Σ opening, so asserting that the current column sums to
zero would be wrong the moment one starting position is set. Both facts are
pinned below so neither can be quietly broken.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.companies.models import Company
from apps.parties.models import AssociatedPerson, AssociatedPersonType
from apps.transfers.models import CashTransfer, EntityOpeningBalance, TransferStatus
from apps.transfers.selectors import entity_balances

BALANCES = "/api/v1/transfers/cash-transfers/balances/"
OPENING = "/api/v1/transfers/opening-balances/"
ZERO = Decimal("0.0000")


class BalanceTestData(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="balances@example.com",
            password="StrongPass123!",
            first_name="Bal",
            last_name="Ances",
        )
        Group.objects.get_or_create(name="Administrator")[0].user_set.add(self.user)
        self.client.force_authenticate(self.user)

        self.alpha = self._company("Alpha SARL", "RC-A", "IF-A")
        self.beta = self._company("Beta SARL", "RC-B", "IF-B")
        self.gamma = self._company("Gamma SARL", "RC-G", "IF-G")

        self.person_type = AssociatedPersonType.objects.create(name="Director")
        self.karim = AssociatedPerson.objects.create(
            first_name="Karim", last_name="Director", person_type=self.person_type
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

    def _transfer(self, amount, frm=None, to=None, from_person=None, to_person=None,
                  status=TransferStatus.CONFIRMED, currency="MAD"):
        transfer = CashTransfer.objects.create(
            from_entity_type="company" if frm is not None else "associated_person",
            from_company=frm,
            from_associated_person=from_person,
            to_entity_type="company" if to is not None else "associated_person",
            to_company=to,
            to_associated_person=to_person,
            amount=Decimal(amount),
            currency=currency,
            transfer_date=date(2026, 8, 20),
            status=status,
            created_by=self.user,
        )
        return transfer

    def _row(self, report, label):
        for row in report["entities"]:
            if row["entity_label"] == label:
                return row
        raise AssertionError(f"{label} not in report: {[r['entity_label'] for r in report['entities']]}")


class ZeroSumInvariantTests(BalanceTestData):
    def test_net_transfers_total_is_exactly_zero(self):
        self._transfer("1000", frm=self.alpha, to=self.beta)
        self._transfer("250.5550", frm=self.beta, to=self.gamma)
        self._transfer("400", frm=self.gamma, to_person=self.karim, to=None)
        self._transfer("125.25", from_person=self.karim, frm=None, to=self.alpha)

        report = entity_balances()
        self.assertEqual(report["totals"]["net_transfers"], ZERO)
        self.assertTrue(report["is_balanced"])

    def test_net_transfers_total_is_zero_with_awkward_decimals(self):
        """Guards against a float creeping into the aggregate."""
        self._transfer("0.0001", frm=self.alpha, to=self.beta)
        self._transfer("33.3333", frm=self.beta, to=self.gamma)
        self._transfer("66.6667", frm=self.gamma, to=self.alpha)

        report = entity_balances()
        self.assertEqual(report["totals"]["net_transfers"], ZERO)

    def test_current_total_equals_opening_total_not_zero(self):
        """The distinction the UI must not blur.

        With starting positions in play the current column sums to the opening
        total. Claiming it sums to zero would be arithmetically false.
        """
        EntityOpeningBalance.objects.create(
            entity_type="company", company=self.alpha, amount=Decimal("5000"),
            as_of_date=date(2026, 1, 1), created_by=self.user,
        )
        EntityOpeningBalance.objects.create(
            entity_type="company", company=self.beta, amount=Decimal("-2000"),
            as_of_date=date(2026, 1, 1), created_by=self.user,
        )
        self._transfer("750", frm=self.alpha, to=self.beta)

        report = entity_balances()
        self.assertEqual(report["totals"]["net_transfers"], ZERO)
        self.assertEqual(report["totals"]["opening_balance"], Decimal("3000.0000"))
        self.assertEqual(report["totals"]["current_balance"], Decimal("3000.0000"))

    def test_archived_transfers_do_not_affect_balances(self):
        transfer = self._transfer("900", frm=self.alpha, to=self.beta)
        transfer.archive(user=self.user)

        report = entity_balances()
        self.assertEqual(report["totals"]["net_transfers"], ZERO)
        self.assertEqual(report["entities"], [])


class PerEntityBalanceTests(BalanceTestData):
    def test_payer_is_negative_and_receiver_is_positive(self):
        self._transfer("1200", frm=self.alpha, to=self.beta)

        report = entity_balances()
        self.assertEqual(self._row(report, "Alpha SARL")["current_balance"], Decimal("-1200.0000"))
        self.assertEqual(self._row(report, "Beta SARL")["current_balance"], Decimal("1200.0000"))

    def test_opening_plus_net_equals_current(self):
        EntityOpeningBalance.objects.create(
            entity_type="company", company=self.alpha, amount=Decimal("10000"),
            as_of_date=date(2026, 1, 1), created_by=self.user,
        )
        self._transfer("2500", frm=self.alpha, to=self.beta)
        self._transfer("400", frm=self.beta, to=self.alpha)

        alpha = self._row(entity_balances(), "Alpha SARL")
        self.assertEqual(alpha["opening_balance"], Decimal("10000.0000"))
        self.assertEqual(alpha["transfers_out"], Decimal("2500.0000"))
        self.assertEqual(alpha["transfers_in"], Decimal("400.0000"))
        self.assertEqual(alpha["net_transfers"], Decimal("-2100.0000"))
        self.assertEqual(alpha["current_balance"], Decimal("7900.0000"))

    def test_associated_person_gets_a_row(self):
        self._transfer("650", frm=self.alpha, to_person=self.karim, to=None)

        row = self._row(entity_balances(), "Karim Director")
        self.assertEqual(row["entity_type"], "associated_person")
        self.assertEqual(row["current_balance"], Decimal("650.0000"))

    def test_entity_with_only_an_opening_balance_still_appears(self):
        EntityOpeningBalance.objects.create(
            entity_type="company", company=self.gamma, amount=Decimal("300"),
            as_of_date=date(2026, 1, 1), created_by=self.user,
        )
        row = self._row(entity_balances(), "Gamma SARL")
        self.assertEqual(row["current_balance"], Decimal("300.0000"))
        self.assertEqual(row["net_transfers"], ZERO)

    def test_uninvolved_entity_is_omitted(self):
        """Companies with no starting position and no transfers would only add
        empty rows to the table."""
        self._transfer("100", frm=self.alpha, to=self.beta)
        labels = [r["entity_label"] for r in entity_balances()["entities"]]
        self.assertNotIn("Gamma SARL", labels)

    def test_drafts_are_pending_not_current(self):
        self._transfer("500", frm=self.alpha, to=self.beta, status=TransferStatus.DRAFT)

        alpha = self._row(entity_balances(), "Alpha SARL")
        self.assertEqual(alpha["current_balance"], ZERO)
        self.assertEqual(alpha["pending_out"], Decimal("500.0000"))
        self.assertEqual(alpha["pending_net"], Decimal("-500.0000"))
        self.assertEqual(alpha["projected_balance"], Decimal("-500.0000"))

    def test_pending_net_total_is_also_zero(self):
        self._transfer("500", frm=self.alpha, to=self.beta, status=TransferStatus.DRAFT)
        self._transfer("120", frm=self.beta, to=self.gamma, status=TransferStatus.DRAFT)

        self.assertEqual(entity_balances()["totals"]["pending_net"], ZERO)


class BalanceCurrencyTests(BalanceTestData):
    def test_other_currencies_are_not_mixed_into_the_total(self):
        self._transfer("1000", frm=self.alpha, to=self.beta, currency="MAD")
        self._transfer("900", frm=self.alpha, to=self.beta, currency="EUR")

        mad = entity_balances(currency="MAD")
        self.assertEqual(self._row(mad, "Beta SARL")["current_balance"], Decimal("1000.0000"))
        self.assertEqual(mad["other_currencies"], ["EUR"])

    def test_each_currency_is_balanced_independently(self):
        self._transfer("900", frm=self.alpha, to=self.beta, currency="EUR")
        eur = entity_balances(currency="EUR")
        self.assertEqual(eur["totals"]["net_transfers"], ZERO)
        self.assertEqual(self._row(eur, "Alpha SARL")["current_balance"], Decimal("-900.0000"))


class BalanceEndpointTests(BalanceTestData):
    def test_endpoint_returns_money_as_strings(self):
        """DRF's JSON encoder turns Decimal into float, which would put binary
        rounding error into money."""
        self._transfer("1000.5555", frm=self.alpha, to=self.beta)

        response = self.client.get(BALANCES)
        self.assertEqual(response.status_code, 200, response.data)
        row = next(r for r in response.data["entities"] if r["entity_label"] == "Beta SARL")
        self.assertIsInstance(row["current_balance"], str)
        self.assertEqual(row["current_balance"], "1000.5555")

    def test_endpoint_reports_balanced(self):
        self._transfer("400", frm=self.alpha, to=self.beta)
        response = self.client.get(BALANCES)
        self.assertTrue(response.data["is_balanced"])
        self.assertEqual(response.data["totals"]["net_transfers"], "0.0000")

    def test_endpoint_honours_the_currency_parameter(self):
        self._transfer("900", frm=self.alpha, to=self.beta, currency="EUR")
        response = self.client.get(BALANCES, {"currency": "EUR"})
        self.assertEqual(response.data["currency"], "EUR")
        self.assertEqual(len(response.data["entities"]), 2)

    def test_endpoint_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(BALANCES).status_code, (401, 403))


class OpeningBalanceApiTests(BalanceTestData):
    def _payload(self, **overrides):
        payload = {
            "entity_type": "company",
            "company": str(self.alpha.pk),
            "amount": "5000.00",
            "currency": "MAD",
            "as_of_date": date(2026, 1, 1).isoformat(),
            "note": "Carried over from 2025",
        }
        payload.update(overrides)
        return payload

    def test_create_opening_balance(self):
        response = self.client.post(OPENING, self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["entity_label"], "Alpha SARL")
        self.assertEqual(Decimal(response.data["amount"]), Decimal("5000.0000"))

    def test_create_response_includes_id(self):
        response = self.client.post(OPENING, self._payload(), format="json")
        self.assertIsNotNone(response.data.get("id"))

    def test_negative_opening_balance_is_allowed(self):
        """An entity can legitimately start owing the group."""
        response = self.client.post(OPENING, self._payload(amount="-1500.00"), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["amount"]), Decimal("-1500.0000"))

    def test_as_of_date_defaults_to_today(self):
        payload = self._payload()
        payload.pop("as_of_date")
        response = self.client.post(OPENING, payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(response.data["as_of_date"])

    def test_duplicate_for_same_entity_is_a_400_not_a_500(self):
        """The database constraint alone would surface as an IntegrityError."""
        self.client.post(OPENING, self._payload(), format="json")
        response = self.client.post(OPENING, self._payload(amount="10.00"), format="json")
        self.assertEqual(response.status_code, 400, response.data)

    def test_same_entity_may_hold_one_balance_per_currency(self):
        self.client.post(OPENING, self._payload(), format="json")
        response = self.client.post(OPENING, self._payload(currency="EUR"), format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def test_editing_an_existing_balance_is_not_blocked_by_its_own_row(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        response = self.client.patch(
            f"{OPENING}{created.data['id']}/", {"amount": "6000.00"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data["amount"]), Decimal("6000.0000"))

    def test_company_type_requires_a_company(self):
        response = self.client.post(OPENING, self._payload(company=None), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("company", response.data)

    def test_person_opening_balance(self):
        response = self.client.post(
            OPENING,
            self._payload(
                entity_type="associated_person",
                company=None,
                associated_person=str(self.karim.pk),
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["entity_label"], "Karim Director")

    def test_person_opening_balance_omits_company_key(self):
        """The UI sends only the person FK; `company` is absent, not null."""
        payload = {
            "entity_type": "associated_person",
            "associated_person": str(self.karim.pk),
            "amount": "2500.00",
            "currency": "MAD",
        }
        response = self.client.post(OPENING, payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data["company"])
        self.assertEqual(response.data["associated_person"], str(self.karim.pk))
        self.assertEqual(response.data["entity_label"], "Karim Director")

    def test_switching_entity_type_clears_the_unused_side(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        response = self.client.patch(
            f"{OPENING}{created.data['id']}/",
            {"entity_type": "associated_person", "associated_person": str(self.karim.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        row = EntityOpeningBalance.objects.get(pk=created.data["id"])
        self.assertIsNone(row.company_id)
        self.assertEqual(row.associated_person_id, self.karim.pk)

    def test_delete_archives_instead_of_destroying(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        response = self.client.delete(f"{OPENING}{created.data['id']}/")
        self.assertEqual(response.status_code, 204)
        row = EntityOpeningBalance.all_objects.get(pk=created.data["id"])
        self.assertTrue(row.is_archived)

    def test_archived_opening_balance_leaves_the_balance_report(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        self.assertEqual(
            self._row(entity_balances(), "Alpha SARL")["opening_balance"],
            Decimal("5000.0000"),
        )
        self.client.delete(f"{OPENING}{created.data['id']}/")
        self.assertEqual(entity_balances()["entities"], [])

    def test_restore_brings_it_back(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        self.client.delete(f"{OPENING}{created.data['id']}/")
        response = self.client.post(f"{OPENING}{created.data['id']}/restore/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(EntityOpeningBalance.objects.get(pk=created.data["id"]).is_archived)

    def test_records_who_created_it(self):
        created = self.client.post(OPENING, self._payload(), format="json")
        row = EntityOpeningBalance.objects.get(pk=created.data["id"])
        self.assertEqual(row.created_by, self.user)
