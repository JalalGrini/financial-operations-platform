# apps/companies/selectors.py
"""
Selectors for Company domain models.

Selectors encapsulate read/query logic and return querysets or model instances.
They should not modify state.
"""
from django.db.models import Count, Q, QuerySet

from .models import Company, CompanyPreference, CompanySettings


class CompanySelector:
    """Selectors for Company queries."""

    @staticmethod
    def get_all() -> QuerySet[Company]:
        """Get all non-archived companies (uses ActiveManager)."""
        return Company.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[Company]:
        """Get all companies including archived."""
        return Company.all_objects.all()

    @staticmethod
    def get_by_id(company_id) -> Company | None:
        """Get non-archived company by ID."""
        return Company.objects.filter(id=company_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> Company | None:
        """Get non-archived company by reference code."""
        return Company.objects.filter(reference=reference).first()

    @staticmethod
    def get_by_id_with_archived(company_id) -> Company | None:
        """Get company by ID including archived."""
        return Company.all_objects.filter(id=company_id).first()

    @staticmethod
    def get_active() -> QuerySet[Company]:
        """Get only active (non-archived) companies."""
        return Company.objects.all()

    @staticmethod
    def get_archived() -> QuerySet[Company]:
        """Get only archived companies."""
        return Company.all_objects.filter(is_archived=True)

    @staticmethod
    def get_with_stats() -> QuerySet[Company]:
        """Get companies annotated with related object counts."""
        return Company.objects.annotate(
            clients_count=Count("clients", filter=Q(clients__is_archived=False)),
            suppliers_count=Count("suppliers", filter=Q(suppliers__is_archived=False)),
            associated_persons_count=Count(
                "associated_persons", filter=Q(associated_persons__is_archived=False)
            ),
            financial_accounts_count=Count(
                "financial_accounts", filter=Q(financial_accounts__is_archived=False)
            ),
            financial_records_count=Count(
                "financial_records", filter=Q(financial_records__is_archived=False)
            ),
        )

    @staticmethod
    def get_user_accessible(user) -> QuerySet[Company]:
        """
        Get companies accessible to a user based on permissions.
        This intentionally returns every active row: EFOP has no per-company tenant boundary by design - roles are the only authorization boundary (see apps/common/permissions.py), and every role may read every company. Kept as a selector so a future tenant-scoped deployment has exactly one place to change.
        """
        # Role matrix is the authorization boundary; see docstring.
        return Company.objects.all()

    @staticmethod
    def search(query: str) -> QuerySet[Company]:
        """Search companies by name, reference, registration number, or email."""
        return Company.objects.filter(
            Q(name__icontains=query)
            | Q(reference__icontains=query)
            | Q(registration_number__icontains=query)
            | Q(email__icontains=query)
        )

    @staticmethod
    def get_by_registration_number(reg_number: str) -> Company | None:
        """Get company by registration number (case-insensitive)."""
        return Company.objects.filter(registration_number__iexact=reg_number).first()

    @staticmethod
    def get_by_tax_id(tax_id: str) -> Company | None:
        """Get company by tax ID (case-insensitive)."""
        return Company.objects.filter(tax_id__iexact=tax_id).first()

    @staticmethod
    def get_by_vat_number(vat_number: str) -> Company | None:
        """Get company by VAT number (case-insensitive)."""
        return Company.objects.filter(vat_number__iexact=vat_number).first()


class CompanySettingsSelector:
    """Selectors for CompanySettings queries."""

    @staticmethod
    def get_by_company(company) -> CompanySettings:
        """Get or create settings for a company."""
        return CompanySettings.objects.get_or_create(company=company)[0]

    @staticmethod
    def get_by_company_id(company_id) -> CompanySettings | None:
        """Get settings by company ID."""
        return CompanySettings.objects.filter(company_id=company_id).first()


class CompanyPreferenceSelector:
    """Selectors for CompanyPreference queries."""

    @staticmethod
    def get_by_key(company, key: str) -> CompanyPreference | None:
        """Get a preference by key for a company."""
        return CompanyPreference.objects.filter(company=company, key=key).first()

    @staticmethod
    def get_all_values(company) -> dict:
        """Get all preference values as typed dict."""
        return {
            pref.key: pref.get_typed_value()
            for pref in CompanyPreference.objects.filter(company=company)
        }

    @staticmethod
    def get_all_system_values(company) -> dict:
        """Get only system preference values."""
        return {
            pref.key: pref.get_typed_value()
            for pref in CompanyPreference.objects.filter(company=company, is_system=True)
        }

    @staticmethod
    def get_all_user_values(company) -> dict:
        """Get only user preference values."""
        return {
            pref.key: pref.get_typed_value()
            for pref in CompanyPreference.objects.filter(company=company, is_system=False)
        }
