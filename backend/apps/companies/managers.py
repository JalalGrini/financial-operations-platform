from django.db import models
from django.db.models import Q

from apps.common.models import ActiveManager, ActiveQuerySet


class CompanyQuerySet(ActiveQuerySet):
    """Custom QuerySet for Company model."""

    def with_settings(self):
        return self.select_related("settings")

    def with_preferences(self):
        return self.prefetch_related("preferences")

    def active_with_relations(self):
        return self.active().select_related("settings").prefetch_related("preferences")

    def search(self, query: str):
        """Search companies by name, trade_name, reference, tax_id, registration_number, or email."""
        return self.filter(
            Q(name__icontains=query)
            | Q(trade_name__icontains=query)
            | Q(reference__icontains=query)
            | Q(tax_id__icontains=query)
            | Q(registration_number__icontains=query)
            | Q(email__icontains=query)
        )

    def get_by_registration_number(self, reg_number: str):
        """Get company by registration number (case-insensitive)."""
        return self.filter(registration_number__iexact=reg_number).first()

    def get_by_tax_id(self, tax_id: str):
        """Get company by tax ID (case-insensitive)."""
        return self.filter(tax_id__iexact=tax_id).first()

    def get_by_natural_key(self, reference):
        return self.get(reference=reference)


class CompanyManager(ActiveManager.from_queryset(CompanyQuerySet)):
    """Manager for Company model with active filtering and custom querysets."""

    pass


class CompanySettingsManager(models.Manager):
    """Manager for CompanySettings."""

    def get_by_natural_key(self, company_reference):
        return self.get(company__reference=company_reference)


class CompanyPreferenceManager(models.Manager):
    """Manager for CompanyPreference."""

    def get_by_natural_key(self, company_reference, key):
        return self.get(company__reference=company_reference, key=key)
