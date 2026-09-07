# apps/transfers/selectors.py
"""Read-side queries for the transfers budget.

THE ZERO-SUM INVARIANT, STATED PRECISELY
----------------------------------------
Every cash transfer moves one amount out of exactly one entity and into
exactly one other entity inside the group. So, summed across all entities:

    Σ net_transfers == 0        (exactly, always)

That is an integrity check on the ledger and it is surfaced as its own total
so a non-zero value is immediately visible as a bug.

It does NOT follow that every column sums to zero. Once entities are given
starting positions:

    Σ current == Σ opening + Σ net_transfers == Σ opening

So the *current* balances only sum to zero if the opening balances themselves
sum to zero. Presenting `current` as the thing that must total zero would be
arithmetically wrong the moment a single opening balance is set. The three
columns are therefore reported separately rather than collapsed.

CURRENCY
--------
Balances are computed for ONE currency at a time. Summing across currencies
would produce a meaningless number, so callers pass a currency and the
response also names any other currencies present, letting the UI say
"transfers also exist in EUR" instead of silently omitting them.

CONFIRMED VS DRAFT
------------------
`CashTransfer`'s module docstring defines a confirmed amount as the one
"taken from the budget", so balances are built from confirmed transfers.
Drafts are reported alongside as `pending_*` rather than dropped, so a user
can see what would change on confirmation.
"""

from decimal import Decimal

from django.db.models import Sum

from apps.transfers.models import (
    CashTransfer,
    EntityOpeningBalance,
    EntityType,
    TransferStatus,
)

ZERO = Decimal("0.0000")

DEFAULT_CURRENCY = "MAD"


def _sum_by_entity(queryset, fk_field):
    """Map {entity_pk: summed amount} for one side of the transfer.

    One grouped aggregate per side instead of a query per entity, so the view
    cost does not grow with the number of companies.
    """
    rows = (
        queryset.filter(**{f"{fk_field}__isnull": False})
        .values(fk_field)
        .annotate(total=Sum("amount"))
        .values_list(fk_field, "total")
    )
    return {pk: (total or ZERO) for pk, total in rows}


def _entity_names(company_ids, person_ids):
    """Resolve display names in two queries regardless of entity count."""
    from apps.companies.models import Company
    from apps.parties.models import AssociatedPerson

    companies = {
        pk: name
        for pk, name in Company.all_objects.filter(pk__in=company_ids).values_list("pk", "name")
    }
    persons = {
        p.pk: p.get_full_name()
        for p in AssociatedPerson.all_objects.filter(pk__in=person_ids)
    }
    return companies, persons


def entity_balances(currency=DEFAULT_CURRENCY):
    """Per-entity opening / net-transfer / current balances for one currency.

    @param currency - ISO currency code to report on.
    @returns dict with `currency`, `entities` (list, richest first by absolute
        current balance is NOT used - sorted by type then name for stable
        reading), `totals`, and `other_currencies`.
    """
    live_transfers = CashTransfer.objects.filter(is_archived=False)
    in_currency = live_transfers.filter(currency=currency)

    confirmed = in_currency.filter(status=TransferStatus.CONFIRMED)
    drafts = in_currency.filter(status=TransferStatus.DRAFT)

    company_in = _sum_by_entity(confirmed, "to_company")
    company_out = _sum_by_entity(confirmed, "from_company")
    person_in = _sum_by_entity(confirmed, "to_associated_person")
    person_out = _sum_by_entity(confirmed, "from_associated_person")

    company_pending_in = _sum_by_entity(drafts, "to_company")
    company_pending_out = _sum_by_entity(drafts, "from_company")
    person_pending_in = _sum_by_entity(drafts, "to_associated_person")
    person_pending_out = _sum_by_entity(drafts, "from_associated_person")

    openings = EntityOpeningBalance.objects.filter(is_archived=False, currency=currency)
    company_opening = {
        ob.company_id: ob.amount for ob in openings if ob.company_id is not None
    }
    person_opening = {
        ob.associated_person_id: ob.amount
        for ob in openings
        if ob.associated_person_id is not None
    }

    # An entity belongs in the report if it has a starting position OR has
    # taken part in any transfer. Entities with neither are genuinely absent
    # from this budget and would only add empty rows.
    company_ids = (
        set(company_in)
        | set(company_out)
        | set(company_pending_in)
        | set(company_pending_out)
        | set(company_opening)
    )
    person_ids = (
        set(person_in)
        | set(person_out)
        | set(person_pending_in)
        | set(person_pending_out)
        | set(person_opening)
    )
    company_names, person_names = _entity_names(company_ids, person_ids)

    entities = []

    def _row(entity_type, pk, name, opening, inflow, outflow, pending_in, pending_out):
        net = inflow - outflow
        pending_net = pending_in - pending_out
        return {
            "entity_type": entity_type,
            "entity_id": str(pk),
            "entity_label": name,
            "opening_balance": opening,
            "transfers_in": inflow,
            "transfers_out": outflow,
            "net_transfers": net,
            "current_balance": opening + net,
            "pending_in": pending_in,
            "pending_out": pending_out,
            "pending_net": pending_net,
            "projected_balance": opening + net + pending_net,
        }

    for pk in company_ids:
        entities.append(
            _row(
                EntityType.COMPANY,
                pk,
                company_names.get(pk, "Unknown company"),
                company_opening.get(pk, ZERO),
                company_in.get(pk, ZERO),
                company_out.get(pk, ZERO),
                company_pending_in.get(pk, ZERO),
                company_pending_out.get(pk, ZERO),
            )
        )
    for pk in person_ids:
        entities.append(
            _row(
                EntityType.ASSOCIATED_PERSON,
                pk,
                person_names.get(pk, "Unknown person"),
                person_opening.get(pk, ZERO),
                person_in.get(pk, ZERO),
                person_out.get(pk, ZERO),
                person_pending_in.get(pk, ZERO),
                person_pending_out.get(pk, ZERO),
            )
        )

    entities.sort(key=lambda e: (e["entity_type"], e["entity_label"].lower()))

    def _total(key):
        return sum((e[key] for e in entities), ZERO)

    totals = {
        "opening_balance": _total("opening_balance"),
        "transfers_in": _total("transfers_in"),
        "transfers_out": _total("transfers_out"),
        # Always exactly 0 when the ledger is sound - this is the integrity check.
        "net_transfers": _total("net_transfers"),
        "current_balance": _total("current_balance"),
        "pending_net": _total("pending_net"),
        "projected_balance": _total("projected_balance"),
    }

    other_currencies = sorted(
        live_transfers.exclude(currency=currency)
        .values_list("currency", flat=True)
        .distinct()
    )

    return {
        "currency": currency,
        "entities": entities,
        "totals": totals,
        "other_currencies": other_currencies,
        "is_balanced": totals["net_transfers"] == ZERO,
    }
