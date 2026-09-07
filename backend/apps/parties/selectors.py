# apps/parties/selectors.py
"""
Selectors for Party domain models.

Selectors encapsulate read/query logic and return querysets or model instances.
They should not modify state.
"""
from django.db.models import Count, Q, QuerySet

from .models import (
    AssociatedPerson,
    AssociatedPersonType,
    AssociatedPersonTypeStatus,
    Client,
    ExternalParty,
    PartyStatus,
    Supplier,
)


class AssociatedPersonTypeSelector:
    """Selectors for AssociatedPersonType queries."""

    @staticmethod
    def get_all() -> QuerySet[AssociatedPersonType]:
        """Get all non-archived person types."""
        return AssociatedPersonType.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[AssociatedPersonType]:
        """Get all person types including archived."""
        return AssociatedPersonType.all_objects.all()

    @staticmethod
    def get_by_id(type_id) -> AssociatedPersonType | None:
        """Get non-archived person type by ID."""
        return AssociatedPersonType.objects.filter(id=type_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> AssociatedPersonType | None:
        """Get non-archived person type by reference code."""
        return AssociatedPersonType.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> QuerySet[AssociatedPersonType]:
        """Get only active (non-archived, status=active) person types."""
        return AssociatedPersonType.objects.filter(
            is_archived=False, status=AssociatedPersonTypeStatus.ACTIVE
        )

    @staticmethod
    def get_default() -> AssociatedPersonType | None:
        """Get the default person type."""
        return AssociatedPersonType.objects.filter(is_default=True).first()


class ClientSelector:
    """Selectors for Client queries."""

    @staticmethod
    def get_all() -> QuerySet[Client]:
        """Get all non-archived clients."""
        return Client.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[Client]:
        """Get all clients including archived."""
        return Client.all_objects.all()

    @staticmethod
    def get_by_id(client_id) -> Client | None:
        """Get non-archived client by ID."""
        return Client.objects.filter(id=client_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> Client | None:
        """Get non-archived client by reference code."""
        return Client.objects.filter(reference=reference).first()

    @staticmethod
    def get_by_tax_id(tax_id: str) -> Client | None:
        """Get client by tax ID (case-insensitive)."""
        return Client.objects.filter(tax_id__iexact=tax_id).first()

    @staticmethod
    def get_by_vat_number(vat_number: str) -> Client | None:
        """Get client by VAT number (case-insensitive)."""
        return Client.objects.filter(vat_number__iexact=vat_number).first()

    @staticmethod
    def get_active() -> QuerySet[Client]:
        """Get only active (non-archived, status=active) clients."""
        return Client.objects.filter(is_archived=False, status=PartyStatus.ACTIVE)

    @staticmethod
    def get_archived() -> QuerySet[Client]:
        """Get only archived clients."""
        return Client.objects.archived()

    @staticmethod
    def get_with_stats() -> QuerySet[Client]:
        """Get clients annotated with related object counts."""
        return Client.objects.annotate(
            financial_accounts_count=Count(
                "financial_accounts", filter=Q(financial_accounts__is_archived=False)
            ),
            financial_records_count=Count(
                "financial_records", filter=Q(financial_records__is_archived=False)
            ),
        )

    @staticmethod
    def get_user_accessible(user) -> QuerySet[Client]:
        """Get clients accessible to a user based on permissions."""
        return Client.objects.all()

    @staticmethod
    def search(query: str) -> QuerySet[Client]:
        """Search clients by name, reference, tax ID, or email."""
        return Client.objects.filter(
            Q(name__icontains=query)
            | Q(trade_name__icontains=query)
            | Q(reference__icontains=query)
            | Q(tax_id__icontains=query)
            | Q(vat_number__icontains=query)
            | Q(email__icontains=query)
        )


class SupplierSelector:
    """Selectors for Supplier queries."""

    @staticmethod
    def get_all() -> QuerySet[Supplier]:
        """Get all non-archived suppliers."""
        return Supplier.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[Supplier]:
        """Get all suppliers including archived."""
        return Supplier.all_objects.all()

    @staticmethod
    def get_by_id(supplier_id) -> Supplier | None:
        """Get non-archived supplier by ID."""
        return Supplier.objects.filter(id=supplier_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> Supplier | None:
        """Get non-archived supplier by reference code."""
        return Supplier.objects.filter(reference=reference).first()

    @staticmethod
    def get_by_tax_id(tax_id: str) -> Supplier | None:
        """Get supplier by tax ID (case-insensitive)."""
        return Supplier.objects.filter(tax_id__iexact=tax_id).first()

    @staticmethod
    def get_by_vat_number(vat_number: str) -> Supplier | None:
        """Get supplier by VAT number (case-insensitive)."""
        return Supplier.objects.filter(vat_number__iexact=vat_number).first()

    @staticmethod
    def get_active() -> QuerySet[Supplier]:
        """Get only active (non-archived, status=active) suppliers."""
        return Supplier.objects.filter(is_archived=False, status=PartyStatus.ACTIVE)

    @staticmethod
    def get_preferred() -> QuerySet[Supplier]:
        """Get preferred suppliers."""
        return Supplier.objects.filter(is_archived=False, is_preferred=True)

    @staticmethod
    def search(query: str) -> QuerySet[Supplier]:
        """Search suppliers by name, reference, tax ID, or email."""
        return Supplier.objects.filter(
            Q(name__icontains=query)
            | Q(trade_name__icontains=query)
            | Q(reference__icontains=query)
            | Q(tax_id__icontains=query)
            | Q(vat_number__icontains=query)
            | Q(email__icontains=query)
        )


class AssociatedPersonSelector:
    """Selectors for AssociatedPerson queries."""

    @staticmethod
    def get_all() -> QuerySet[AssociatedPerson]:
        """Get all non-archived associated persons."""
        return AssociatedPerson.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[AssociatedPerson]:
        """Get all associated persons including archived."""
        return AssociatedPerson.all_objects.all()

    @staticmethod
    def get_by_id(person_id) -> AssociatedPerson | None:
        """Get non-archived associated person by ID."""
        return AssociatedPerson.objects.filter(id=person_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> AssociatedPerson | None:
        """Get non-archived associated person by reference code."""
        return AssociatedPerson.objects.filter(reference=reference).first()

    @staticmethod
    def get_by_user(user) -> AssociatedPerson | None:
        """Get associated person linked to a user."""
        return AssociatedPerson.objects.filter(user=user).first()

    @staticmethod
    def get_by_national_id(national_id: str) -> AssociatedPerson | None:
        """Get associated person by national ID (case-insensitive)."""
        return AssociatedPerson.objects.filter(national_id__iexact=national_id).first()

    @staticmethod
    def get_active() -> QuerySet[AssociatedPerson]:
        """Get only active (non-archived, status=active) persons."""
        return AssociatedPerson.objects.filter(is_archived=False, status=PartyStatus.ACTIVE)

    @staticmethod
    def get_by_type(person_type_id) -> QuerySet[AssociatedPerson]:
        """Get persons by type ID."""
        return AssociatedPerson.objects.filter(person_type_id=person_type_id)

    @staticmethod
    def get_subordinates(manager_id) -> QuerySet[AssociatedPerson]:
        """Get all subordinates of a manager."""
        return AssociatedPerson.objects.filter(manager_id=manager_id)

    @staticmethod
    def get_by_company(company_id) -> QuerySet[AssociatedPerson]:
        """Get persons linked to a company (via financial accounts)."""
        return AssociatedPerson.objects.filter(
            financial_accounts__company_id=company_id,
            is_archived=False,
        ).distinct()

    @staticmethod
    def search(query: str) -> QuerySet[AssociatedPerson]:
        """Search persons by name, reference, national ID, or email."""
        return AssociatedPerson.objects.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(reference__icontains=query)
            | Q(national_id__icontains=query)
            | Q(email__icontains=query)
        )


class ExternalPartySelector:
    """Selectors for ExternalParty queries."""

    @staticmethod
    def get_all() -> QuerySet[ExternalParty]:
        """Get all non-archived external parties."""
        return ExternalParty.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[ExternalParty]:
        """Get all external parties including archived."""
        return ExternalParty.all_objects.all()

    @staticmethod
    def get_by_id(party_id) -> ExternalParty | None:
        """Get non-archived external party by ID."""
        return ExternalParty.objects.filter(id=party_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> ExternalParty | None:
        """Get non-archived external party by reference code."""
        return ExternalParty.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> QuerySet[ExternalParty]:
        """Get only active external parties."""
        return ExternalParty.objects.filter(is_archived=False, status=PartyStatus.ACTIVE)

    @staticmethod
    def get_recurring() -> QuerySet[ExternalParty]:
        """Get recurring external parties."""
        return ExternalParty.objects.filter(is_recurring=True, is_archived=False)

    @staticmethod
    def search(query: str) -> QuerySet[ExternalParty]:
        """Search external parties by name, reference, or category."""
        return ExternalParty.objects.filter(
            Q(name__icontains=query)
            | Q(trade_name__icontains=query)
            | Q(reference__icontains=query)
            | Q(party_category__icontains=query)
        )
