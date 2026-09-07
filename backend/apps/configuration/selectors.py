# apps/configuration/selectors.py
"""
Selectors for Configuration domain models.

Selectors encapsulate read/query logic and return querysets or model instances.
They should not modify state.
"""
from django.db.models import Q, QuerySet

from .models import (
    Category,
    ConfigurationStatus,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)


class CategorySelector:
    """Selectors for Category queries."""

    @staticmethod
    def get_all() -> QuerySet[Category]:
        """Get all non-archived categories."""
        return Category.objects.all()

    @staticmethod
    def get_all_with_archived() -> QuerySet[Category]:
        """Get all categories including archived."""
        return Category.all_objects.all()

    @staticmethod
    def get_root() -> QuerySet[Category]:
        """Get root categories (no parent)."""
        return Category.objects.filter(parent__isnull=True)

    @staticmethod
    def get_children(parent_id) -> QuerySet[Category]:
        """Get direct children of a category."""
        return Category.objects.filter(parent_id=parent_id)

    @staticmethod
    def get_descendants(category_id) -> QuerySet[Category]:
        """Get all descendants of a category (recursive)."""
        category = Category.objects.filter(id=category_id).first()
        if not category:
            return Category.objects.none()
        if category.path:
            return Category.objects.filter(path__startswith=f"{category.path}/{category.id}/")
        return Category.objects.filter(path__startswith=f"/{category.id}/")

    @staticmethod
    def get_by_id(category_id) -> Category | None:
        """Get non-archived category by ID."""
        return Category.objects.filter(id=category_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> Category | None:
        """Get non-archived category by reference."""
        return Category.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> QuerySet[Category]:
        """Get only active categories."""
        return Category.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_income() -> QuerySet[Category]:
        """Get income categories."""
        return Category.objects.filter(is_income=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_expense() -> QuerySet[Category]:
        """Get expense categories."""
        return Category.objects.filter(is_expense=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_transfer() -> QuerySet[Category]:
        """Get transfer categories."""
        return Category.objects.filter(is_transfer=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def search(query: str) -> QuerySet[Category]:
        """Search categories by name or description."""
        return Category.objects.filter(Q(name__icontains=query) | Q(description__icontains=query))

    @staticmethod
    def get_root_categories() -> list:
        """Get all root categories with their full tree."""
        roots = Category.objects.filter(parent__isnull=True).prefetch_related("children")
        return list(roots)


class FinancialRecordTypeSelector:
    """Selectors for FinancialRecordType queries."""

    @staticmethod
    def get_all() -> "QuerySet[FinancialRecordType]":
        from .models import FinancialRecordType

        return FinancialRecordType.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet[FinancialRecordType]":
        from .models import FinancialRecordType

        return FinancialRecordType.all_objects.all()

    @staticmethod
    def get_by_id(type_id) -> "FinancialRecordType | None":
        from .models import FinancialRecordType

        return FinancialRecordType.objects.filter(id=type_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> "FinancialRecordType | None":
        from .models import FinancialRecordType

        return FinancialRecordType.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_income() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            nature=FinancialRecordType.RecordNature.INCOME,
            status=ConfigurationStatus.ACTIVE,
        )

    @staticmethod
    def get_expense() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            nature=FinancialRecordType.RecordNature.EXPENSE,
            status=ConfigurationStatus.ACTIVE,
        )

    @staticmethod
    def get_transfer() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            nature=FinancialRecordType.RecordNature.TRANSFER,
            status=ConfigurationStatus.ACTIVE,
        )

    @staticmethod
    def get_adjustment() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            nature=FinancialRecordType.RecordNature.ADJUSTMENT,
            status=ConfigurationStatus.ACTIVE,
        )

    @staticmethod
    def get_requires_validation() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            requires_validation=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_requires_approval() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.filter(
            requires_approval=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_with_category() -> "QuerySet[FinancialRecordType]":
        from .models import ConfigurationStatus, FinancialRecordType

        return FinancialRecordType.objects.select_related("default_category").filter(
            status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def search(query: str) -> "QuerySet[FinancialRecordType]":
        from django.db.models import Q

        from .models import FinancialRecordType

        return FinancialRecordType.objects.filter(
            Q(name__icontains=query) | Q(description__icontains=query)
        )


class PaymentMethodSelector:
    """Selectors for PaymentMethod queries."""

    @staticmethod
    def get_all() -> "QuerySet[PaymentMethod]":
        from .models import PaymentMethod

        return PaymentMethod.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet[PaymentMethod]":
        from .models import PaymentMethod

        return PaymentMethod.all_objects.all()

    @staticmethod
    def get_by_id(method_id) -> "PaymentMethod | None":
        from .models import PaymentMethod

        return PaymentMethod.objects.filter(id=method_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> "PaymentMethod | None":
        from .models import PaymentMethod

        return PaymentMethod.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> "QuerySet[PaymentMethod]":
        from .models import ConfigurationStatus, PaymentMethod

        return PaymentMethod.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_by_kind(kind: str) -> "QuerySet[PaymentMethod]":
        from .models import ConfigurationStatus, PaymentMethod

        return PaymentMethod.objects.filter(kind=kind, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_electronic() -> "QuerySet[PaymentMethod]":
        from .models import ConfigurationStatus, PaymentMethod

        return PaymentMethod.objects.filter(is_electronic=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_requiring_bank_details() -> "QuerySet[PaymentMethod]":
        from .models import ConfigurationStatus, PaymentMethod

        return PaymentMethod.objects.filter(
            requires_bank_details=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_with_extra_fields() -> "QuerySet[PaymentMethod]":
        from .models import PaymentMethod

        return PaymentMethod.objects.filter(status=ConfigurationStatus.ACTIVE).exclude(
            extra_fields={}
        )


class TransactionTypeSelector:
    """Selectors for TransactionType queries."""

    @staticmethod
    def get_all() -> "QuerySet[TransactionType]":
        from .models import TransactionType

        return TransactionType.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet[TransactionType]":
        from .models import TransactionType

        return TransactionType.all_objects.all()

    @staticmethod
    def get_by_id(type_id) -> "TransactionType | None":
        from .models import TransactionType

        return TransactionType.objects.filter(id=type_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> "TransactionType | None":
        from .models import TransactionType

        return TransactionType.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_credit_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(
            nature__in=["credit", "both"], status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_debit_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(
            nature__in=["debit", "both"], status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_transfer_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(is_transfer=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_adjustment_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(is_adjustment=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_opening_balance_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(
            is_opening_balance=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_reversal_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(is_reversal=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_requiring_approval() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(
            requires_approval=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_requiring_counterparty() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(
            requires_counterparty=True, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_system_types() -> "QuerySet[TransactionType]":
        from .models import ConfigurationStatus, TransactionType

        return TransactionType.objects.filter(is_system=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_allowed_payment_methods(type_id) -> "QuerySet":
        from .models import TransactionType

        tt = TransactionType.objects.filter(id=type_id).first()
        if tt:
            return tt.allowed_payment_methods.all()
        return None


class ReportTypeSelector:
    """Selectors for ReportType queries."""

    @staticmethod
    def get_all() -> "QuerySet[ReportType]":
        from .models import ReportType

        return ReportType.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet[ReportType]":
        from .models import ReportType

        return ReportType.all_objects.all()

    @staticmethod
    def get_by_id(type_id) -> "ReportType | None":
        from .models import ReportType

        return ReportType.objects.filter(id=type_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> "ReportType | None":
        from .models import ReportType

        return ReportType.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> "QuerySet[ReportType]":
        from .models import ConfigurationStatus, ReportType

        return ReportType.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_schedulable() -> "QuerySet[ReportType]":
        from .models import ConfigurationStatus, ReportType

        return ReportType.objects.filter(supports_scheduled=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_previewable() -> "QuerySet[ReportType]":
        from .models import ConfigurationStatus, ReportType

        return ReportType.objects.filter(supports_preview=True, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_by_frequency(frequency: str) -> "QuerySet[ReportType]":
        from .models import ConfigurationStatus, ReportType

        return ReportType.objects.filter(frequency=frequency, status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_by_category(category_id) -> "QuerySet[ReportType]":
        from .models import ConfigurationStatus, ReportType

        return ReportType.objects.filter(category_id=category_id, status=ConfigurationStatus.ACTIVE)


class NotificationTypeSelector:
    """Selectors for NotificationType queries."""

    @staticmethod
    def get_all() -> "QuerySet[NotificationType]":
        from .models import NotificationType

        return NotificationType.objects.all()

    @staticmethod
    def get_all_with_archived() -> "QuerySet[NotificationType]":
        from .models import NotificationType

        return NotificationType.all_objects.all()

    @staticmethod
    def get_by_id(type_id) -> "NotificationType | None":
        from .models import NotificationType

        return NotificationType.objects.filter(id=type_id).first()

    @staticmethod
    def get_by_reference(reference: str) -> "NotificationType | None":
        from .models import NotificationType

        return NotificationType.objects.filter(reference=reference).first()

    @staticmethod
    def get_active() -> "QuerySet[NotificationType]":
        from .models import ConfigurationStatus, NotificationType

        return NotificationType.objects.filter(status=ConfigurationStatus.ACTIVE)

    @staticmethod
    def get_by_priority(priority: str) -> "QuerySet[NotificationType]":
        from .models import ConfigurationStatus, NotificationType

        return NotificationType.objects.filter(
            default_priority=priority, status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_by_channel(channel: str) -> "QuerySet[NotificationType]":
        from .models import ConfigurationStatus, NotificationType

        return NotificationType.objects.filter(
            available_channels__contains=[channel], status=ConfigurationStatus.ACTIVE
        )

    @staticmethod
    def get_for_role(role: str) -> "QuerySet[NotificationType]":
        from .models import ConfigurationStatus, NotificationType

        return NotificationType.objects.filter(
            default_recipient_roles__contains=[role], status=ConfigurationStatus.ACTIVE
        )
