# apps/configuration/views.py
"""
Configuration API Views.

Implements REST endpoints for Configuration domain:
- Categories
- Financial Record Types
- Payment Methods
- Transaction Types
- Report Types
- Notification Types
"""
from functools import reduce
from operator import or_

from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.querying import apply_archive_visibility
from apps.configuration.models import (
    Category,
    FinancialRecordType,
    NotificationType,
    PaymentMethod,
    ReportType,
    TransactionType,
)
from apps.configuration.permissions import CanManageConfiguration
from apps.configuration.serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    FinancialRecordTypeCreateSerializer,
    FinancialRecordTypeSerializer,
    NotificationTypeCreateSerializer,
    NotificationTypeSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
    ReportTypeCreateSerializer,
    ReportTypeSerializer,
    TransactionTypeCreateSerializer,
    TransactionTypeSerializer,
)


class CategoryViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for Category."""

    queryset = Category.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action == "create":
            return CategoryCreateSerializer
        return CategorySerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(Category.all_objects.all(), Category, self.request)

        # Filter by scope (income/expense/transfer)
        scope = self.request.query_params.get("scope")
        if scope == "income":
            queryset = queryset.filter(is_income=True)
        elif scope == "expense":
            queryset = queryset.filter(is_expense=True)
        elif scope == "transfer":
            queryset = queryset.filter(is_transfer=True)

        # Filter by status
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by parent
        parent = self.request.query_params.get("parent")
        if parent:
            queryset = queryset.filter(parent_id=parent)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related("parent", "created_by", "updated_by").prefetch_related(
            "children"
        )

    def _build_children_map(self, objects):
        """Bulk-fetch every descendant of `objects` in one query.

        CategorySerializer.get_children recurses to serialize a category's
        full subtree. Without this, each recursive call issues its own
        `.children.all()` query, so the cost scales with the number of nodes
        in the subtree, not the page size (Cycle 23, N-2). `path` is a
        materialized path of ancestor ids, so "descendant of any object in
        `objects`" is expressible as one OR'd set of `path__startswith`
        filters, fetched once regardless of subtree depth.
        """
        objects = list(objects)
        if not objects:
            return {}
        prefixes = [f"{obj.path}{obj.id}/" if obj.path else f"/{obj.id}/" for obj in objects]
        descendants = list(
            Category.objects.filter(
                reduce(or_, (Q(path__startswith=prefix) for prefix in prefixes))
            )
        )
        nodes_by_id = {obj.id: obj for obj in objects}
        for descendant in descendants:
            nodes_by_id[descendant.id] = descendant
        children_map = {}
        for node in nodes_by_id.values():
            if node.parent_id is not None:
                children_map.setdefault(node.parent_id, []).append(node)
        return children_map

    def _build_category_names_map(self, objects, children_map):
        """Bulk-fetch `{id: name}` for every category that could be an
        ancestor of `objects` or of anything in `children_map`, in one query.

        This lets CategorySerializer.get_full_path resolve every ancestor
        name from memory instead of running one query per ancestor per row
        (Cycle 23, N-2).
        """
        known = {}
        for obj in objects:
            known[str(obj.id)] = obj.name
        for siblings in children_map.values():
            for node in siblings:
                known[str(node.id)] = node.name

        referenced_ids = set()
        for obj in objects:
            referenced_ids.update(part for part in obj.path.split("/") if part)
        for siblings in children_map.values():
            for node in siblings:
                referenced_ids.update(part for part in node.path.split("/") if part)

        missing_ids = referenced_ids - set(known.keys())
        if missing_ids:
            for row in Category.all_objects.filter(id__in=missing_ids).values("id", "name"):
                known[str(row["id"])] = row["name"]
        return known

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        objects = page if page is not None else list(queryset)

        children_map = self._build_children_map(objects)
        context = self.get_serializer_context()
        context["children_by_parent_id"] = children_map
        context["category_names_by_id"] = self._build_category_names_map(objects, children_map)

        serializer = self.get_serializer(objects, many=True, context=context)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a category."""
        category = self.get_object()
        category.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Category archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived category."""
        category = self.get_object()
        if not category.is_archived:
            return Response(
                {"detail": _("This category is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        category.restore()
        return Response({"message": _("Category restored successfully.")})


class FinancialRecordTypeViewSet(
    SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet
):
    """ViewSet for FinancialRecordType."""

    queryset = FinancialRecordType.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action == "create":
            return FinancialRecordTypeCreateSerializer
        return FinancialRecordTypeSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            FinancialRecordType.all_objects.all(), FinancialRecordType, self.request
        )

        # Filter by nature (income/expense/transfer/adjustment)
        nature = self.request.query_params.get("nature")
        if nature:
            queryset = queryset.filter(nature=nature)

        # Filter by requires validation
        requires_validation = self.request.query_params.get("requires_validation")
        if requires_validation is not None:
            queryset = queryset.filter(requires_validation=requires_validation.lower() == "true")

        # Filter by requires approval
        requires_approval = self.request.query_params.get("requires_approval")
        if requires_approval is not None:
            queryset = queryset.filter(requires_approval=requires_approval.lower() == "true")

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related(
            "default_category", "default_payment_method", "created_by", "updated_by"
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a financial record type."""
        frt = self.get_object()
        frt.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Financial record type archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived financial record type."""
        frt = self.get_object()
        if not frt.is_archived:
            return Response(
                {"detail": _("This financial record type is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        frt.restore()
        return Response({"message": _("Financial record type restored successfully.")})


class PaymentMethodViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for PaymentMethod."""

    queryset = PaymentMethod.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return PaymentMethodCreateSerializer
        return PaymentMethodSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            PaymentMethod.all_objects.all(), PaymentMethod, self.request
        )

        # Filter by kind
        kind = self.request.query_params.get("kind")
        if kind:
            queryset = queryset.filter(kind=kind)

        # Filter electronic
        is_electronic = self.request.query_params.get("is_electronic")
        if is_electronic is not None:
            queryset = queryset.filter(is_electronic=is_electronic.lower() == "true")

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related("created_by", "updated_by")

    @action(detail=False, methods=["get"])
    def by_kind(self, request):
        """Get payment methods by kind."""
        kind = request.query_params.get("kind")
        if not kind:
            return Response(
                {"error": _("kind parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        methods = self.get_queryset().filter(kind=kind)
        serializer = self.get_serializer(methods, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def electronic(self, request):
        """Get electronic payment methods."""
        methods = self.get_queryset().filter(is_electronic=True)
        serializer = self.get_serializer(methods, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def requiring_bank_details(self, request):
        """Get payment methods requiring bank details."""
        methods = self.get_queryset().filter(requires_bank_details=True)
        serializer = self.get_serializer(methods, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a payment method."""
        method = self.get_object()
        method.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Payment method archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived payment method."""
        method = self.get_object()
        if not method.is_archived:
            return Response(
                {"detail": _("This payment method is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        method.restore()
        return Response({"message": _("Payment method restored successfully.")})


class TransactionTypeViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for TransactionType."""

    queryset = TransactionType.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action == "create":
            return TransactionTypeCreateSerializer
        return TransactionTypeSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            TransactionType.all_objects.all(), TransactionType, self.request
        )

        # Filter by nature (credit/debit/both)
        nature = self.request.query_params.get("nature")
        if nature:
            queryset = queryset.filter(nature=nature)

        # Filter by is_transfer
        is_transfer = self.request.query_params.get("is_transfer")
        if is_transfer is not None:
            queryset = queryset.filter(is_transfer=is_transfer.lower() == "true")

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related("created_by", "updated_by")

    @action(detail=False, methods=["get"])
    def credit_types(self, request):
        """Get credit transaction types."""
        types = self.get_queryset().filter(nature__in=["credit", "both"])
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def debit_types(self, request):
        """Get debit transaction types."""
        types = self.get_queryset().filter(nature__in=["debit", "both"])
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def system_types(self, request):
        """Get system transaction types."""
        types = self.get_queryset().filter(is_system=True)
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a transaction type."""
        ttype = self.get_object()
        ttype.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Transaction type archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived transaction type."""
        ttype = self.get_object()
        if not ttype.is_archived:
            return Response(
                {"detail": _("This transaction type is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ttype.restore()
        return Response({"message": _("Transaction type restored successfully.")})


class ReportTypeViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for ReportType."""

    queryset = ReportType.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action == "create":
            return ReportTypeCreateSerializer
        return ReportTypeSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(ReportType.all_objects.all(), ReportType, self.request)

        # Filter by frequency
        frequency = self.request.query_params.get("frequency")
        if frequency:
            queryset = queryset.filter(frequency=frequency)

        # Filter schedulable
        schedulable = self.request.query_params.get("schedulable")
        if schedulable is not None:
            queryset = queryset.filter(supports_scheduled=schedulable.lower() == "true")

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related("category", "created_by", "updated_by")

    @action(detail=False, methods=["get"])
    def by_frequency(self, request):
        """Get report types by frequency."""
        frequency = request.query_params.get("frequency")
        if not frequency:
            return Response(
                {"error": _("frequency parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        types = self.get_queryset().filter(frequency=frequency)
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def schedulable(self, request):
        """Get schedulable report types."""
        types = self.get_queryset().filter(supports_scheduled=True)
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a report type."""
        rtype = self.get_object()
        rtype.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Report type archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived report type."""
        rtype = self.get_object()
        if not rtype.is_archived:
            return Response(
                {"detail": _("This report type is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rtype.restore()
        return Response({"message": _("Report type restored successfully.")})


class NotificationTypeViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """ViewSet for NotificationType."""

    queryset = NotificationType.objects.filter(is_archived=False)
    permission_classes = [IsAuthenticated, CanManageConfiguration]

    def get_serializer_class(self):
        if self.action == "create":
            return NotificationTypeCreateSerializer
        return NotificationTypeSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            NotificationType.all_objects.all(), NotificationType, self.request
        )

        # Filter by channel
        channel = self.request.query_params.get("channel")
        if channel:
            queryset = queryset.filter(available_channels__contains=[channel])

        # Filter by priority
        priority = self.request.query_params.get("priority")
        if priority:
            queryset = queryset.filter(default_priority=priority)

        # Search
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return queryset.select_related("created_by", "updated_by")

    @action(detail=False, methods=["get"])
    def by_channel(self, request):
        """Get notification types by channel."""
        channel = request.query_params.get("channel")
        if not channel:
            return Response(
                {"error": _("channel parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        types = self.get_queryset().filter(available_channels__contains=[channel])
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_priority(self, request):
        """Get notification types by priority."""
        priority = request.query_params.get("priority")
        if not priority:
            return Response(
                {"error": _("priority parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        types = self.get_queryset().filter(default_priority=priority)
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def for_role(self, request):
        """Get notification types for a role."""
        role = request.query_params.get("role")
        if not role:
            return Response(
                {"error": _("role parameter required.")}, status=status.HTTP_400_BAD_REQUEST
            )

        types = self.get_queryset().filter(default_recipient_roles__contains=[role])
        serializer = self.get_serializer(types, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """Archive a notification type."""
        ntype = self.get_object()
        ntype.archive(user=request.user, reason=request.data.get("reason", ""))
        return Response({"message": _("Notification type archived successfully.")})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore an archived notification type."""
        ntype = self.get_object()
        if not ntype.is_archived:
            return Response(
                {"detail": _("This notification type is not archived.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ntype.restore()
        return Response({"message": _("Notification type restored successfully.")})
