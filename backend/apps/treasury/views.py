# apps/treasury/views.py
"""
Treasury API views.

Every write routes through apps.treasury.services. The viewset never calls
Model.save() for business state, because the balance invariant and the
immutability rules live in the services; a view that wrote directly would
silently bypass them.

The service layer signals refusal with Django's ValidationError or ValueError.
DRF does not know about either, so both are translated here into 400
responses; otherwise a rejected business rule would surface to the client as
a 500.
"""

from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.companies.models import Company
from apps.common.mixins import ArchivableObjectMixin, SoftDeleteViewSetMixin
from apps.common.querying import apply_archive_visibility
from apps.treasury.models import Account, DailyBudget, Reconciliation, Transaction
from apps.treasury.permissions import CanFillDailyBudget, CanManageTreasury
from apps.treasury.selectors import (
    accounts_with_balance_drift,
    all_accounts,
    all_transactions,
    running_balance,
    unreconciled_posted_transactions,
)
from apps.treasury.serializers import (
    AccountCreateSerializer,
    AccountSerializer,
    AccountUpdateSerializer,
    AttachTransactionSerializer,
    CancelTransactionSerializer,
    ReconciliationCreateSerializer,
    ReconciliationDetailSerializer,
    ReconciliationSerializer,
    ReopenReconciliationSerializer,
    TransactionCreateSerializer,
    TransactionDetailSerializer,
    TransactionSerializer,
    TransactionUpdateSerializer,
    TransferSerializer,
    DailyBudgetSerializer,
    DailyBudgetWriteSerializer,
)
from apps.treasury.services import (
    archive_transaction,
    attach_transaction_to_reconciliation,
    cancel_transaction,
    complete_reconciliation,
    create_account,
    create_transaction,
    open_reconciliation,
    post_transaction,
    reopen_reconciliation,
    transfer_between_accounts,
    update_transaction,
)


def _as_drf_error(exc):
    """Translate a service-layer refusal into a DRF 400."""
    if isinstance(exc, DjangoValidationError):
        return DRFValidationError(getattr(exc, "messages", [str(exc)]))
    return DRFValidationError([str(exc)])


class AccountViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """Treasury accounts: bank accounts, cash boxes, wallets."""

    permission_classes = [IsAuthenticated, CanManageTreasury]

    def get_serializer_class(self):
        if self.action == "create":
            return AccountCreateSerializer
        if self.action in ("update", "partial_update"):
            return AccountUpdateSerializer
        return AccountSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(all_accounts(), Account, self.request)
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        # Search by name, reference or bank details
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(reference__icontains=search)
                | Q(bank_name__icontains=search)
                | Q(account_number__icontains=search)
            )
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            account = create_account(user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(AccountSerializer(account).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        account = self.get_object()
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(account, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        try:
            for key, value in serializer.validated_data.items():
                setattr(account, key, value)
            account.updated_by = request.user
            account.full_clean(exclude=["reference"])
            account.save()
        except DjangoValidationError as exc:
            raise _as_drf_error(exc) from exc

        account.refresh_from_db()
        return Response(AccountSerializer(account).data)

    # `destroy()` used to be overridden here with logic identical to
    # `SoftDeleteViewSetMixin.destroy()` - archive instead of delete, since
    # treasury history is never destroyed. That was a pure duplication once
    # the mixin existed, so it is now removed in favor of the shared
    # implementation (Cycle 17, C-1). This ViewSet also gains a generic
    # `permanent_delete` action (decision C-5) from the same mixin.

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Bring an archived account back into use."""
        account = self.get_object()
        if not account.is_archived:
            return Response(
                {"detail": "This account is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        account.restore()
        return Response(AccountSerializer(account).data)

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """Posted movements oldest-first, each with the balance after it."""
        account = self.get_object()
        limit = request.query_params.get("limit")
        rows = running_balance(account, limit=int(limit) if limit else None)
        payload = [
            {
                "transaction": TransactionSerializer(row["transaction"]).data,
                "balance_after": str(row["balance_after"]),
            }
            for row in rows
        ]
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="balance-drift")
    def balance_drift(self, request):
        """Accounts whose stored balance disagrees with their ledger."""
        drifted = accounts_with_balance_drift()
        payload = [
            {
                "account": AccountSerializer(account).data,
                "stored_balance": str(stored),
                "ledger_balance": str(ledger),
            }
            for account, stored, ledger in drifted
        ]
        return Response(payload)


class TransactionViewSet(SoftDeleteViewSetMixin, ArchivableObjectMixin, viewsets.ModelViewSet):
    """Treasury movements: draft, posting, cancellation.

    Keeps its own `destroy()` below (routes through the `archive_transaction`
    service, unchanged) - a ViewSet's own `destroy()` always wins over
    `SoftDeleteViewSetMixin`'s in MRO, so mixing the mixin in here only adds
    the generic `permanent_delete` action (decision C-5) without disturbing
    that existing, already-correct `destroy()`.

    Also mixes in `ArchivableObjectMixin` (found while building the Cycle 17
    soft-delete structural guard): `get_queryset()` here is
    `active_transactions()`, which filters `is_archived=False` like every
    other affected selector, so the `restore` action below needs the same
    all_objects-based `get_object()` lookup override B-2 already fixed for
    the other ViewSets, or restoring an archived transaction would always
    404.
    """

    permission_classes = [IsAuthenticated, CanManageTreasury]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TransactionDetailSerializer
        if self.action == "create":
            return TransactionCreateSerializer
        if self.action in ("update", "partial_update"):
            return TransactionUpdateSerializer
        return TransactionSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(all_transactions(), Transaction, self.request)
        account_id = self.request.query_params.get("account")
        if account_id:
            queryset = queryset.filter(account_id=account_id)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        # Search by reference, description or external reference
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(description__icontains=search)
                | Q(external_reference__icontains=search)
            )
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            txn = create_transaction(user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(TransactionDetailSerializer(txn).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        txn = self.get_object()
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(txn, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            txn = update_transaction(transaction=txn, user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(TransactionDetailSerializer(txn).data)

    def get_archive_block_reason(self, instance):
        """Refuse to permanently purge a POSTED, CANCELLED, or reconciled
        transaction (bugs E-2/E-3, Cycle 19 -
        state/IMPLEMENTATION_PLAN.md Section 13.3, 13.4, 13.8 Q2).

        This ViewSet's own `destroy()` below already refuses a POSTED
        transaction via `archive_transaction`, but `permanent_delete` comes
        from `SoftDeleteViewSetMixin` and never touches that service, so it
        purged the same POSTED row anyway, leaving the account balance
        carrying an effect no surviving transaction explains (E-2). The same
        gap let a transaction still attached to a COMPLETED reconciliation
        be purged out from under a signed-off period (E-3). CANCELLED is
        refused too: its balance effect is already reversed, so purging it
        is arithmetically harmless, but it would erase the audit trail of
        the reversal itself, which is usually exactly what the reversal is
        for.
        """
        if instance.status == Transaction.Status.POSTED:
            return _(
                "A posted transaction cannot be permanently deleted. Cancel "
                "it first so the account balance is corrected."
            )
        if instance.status == Transaction.Status.CANCELLED:
            return _("A cancelled transaction cannot be permanently deleted.")
        if instance.is_reconciled:
            return _(
                "A reconciled transaction cannot be permanently deleted. "
                "Reopen the reconciliation first."
            )
        return None

    def destroy(self, request, *args, **kwargs):
        txn = self.get_object()
        try:
            archive_transaction(transaction=txn, user=request.user, reason="Deleted via API")
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Bring an archived transaction back into use.

        Found while building the Cycle 17 soft-delete structural guard
        (state/IMPLEMENTATION_PLAN.md Section 11): this ViewSet's `destroy()`
        already archived (not destroyed) since before this cycle, but with
        no `restore` action anywhere, an archived transaction was reachable
        only through admin/shell - the exact roach-motel shape as decision
        C-3b, just not one of the 20 endpoints the architect pass counted
        because this one already archived correctly. `get_queryset()` here
        is `active_transactions()`, which filters `is_archived=False` like
        every other affected selector, so without `ArchivableObjectMixin`
        (now mixed in above) this action's `get_object()` would always 404
        on the archived row it exists to bring back - the exact B-2 failure
        mode, reproduced here independently because this ViewSet's own
        `destroy()` override meant it was never touched by the Cycle 16 fix.
        """
        txn = self.get_object()
        if not txn.is_archived:
            return Response(
                {"detail": "This transaction is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        txn.restore()
        return Response(TransactionDetailSerializer(txn).data)

    @action(detail=True, methods=["post"])
    def post_to_ledger(self, request, pk=None):
        """Post a draft into the books. This is irreversible."""
        txn = self.get_object()
        try:
            posted = post_transaction(transaction=txn, user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(TransactionDetailSerializer(posted).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a transaction, recording why."""
        txn = self.get_object()
        serializer = CancelTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            cancelled = cancel_transaction(
                transaction=txn,
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(TransactionDetailSerializer(cancelled).data)


class TransferViewSet(viewsets.ViewSet):
    """Moving money between two of our own accounts.

    A plain ViewSet, not a ModelViewSet: a transfer is not a row someone
    lists, retrieves, or edits directly. It is an action that produces two
    Transaction rows, each individually visible through TransactionViewSet.
    """

    permission_classes = [IsAuthenticated, CanManageTreasury]
    serializer_class = TransferSerializer

    def create(self, request, *args, **kwargs):
        serializer = TransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            outbound, inbound = transfer_between_accounts(user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(
            {
                "outbound": TransactionDetailSerializer(outbound).data,
                "inbound": TransactionDetailSerializer(inbound).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ReconciliationViewSet(viewsets.ModelViewSet):
    """Reconciliation periods: opening, attaching, completing, reopening.

    Restricted to GET/POST: a reconciliation is never PATCHed directly, only
    transitioned through its dedicated actions, and never DELETEd since a
    signed-off period is evidence.
    """

    permission_classes = [IsAuthenticated, CanManageTreasury]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReconciliationDetailSerializer
        if self.action == "create":
            return ReconciliationCreateSerializer
        return ReconciliationSerializer

    def get_queryset(self):
        queryset = apply_archive_visibility(
            Reconciliation.all_objects.select_related("account"), Reconciliation, self.request
        )
        account_id = self.request.query_params.get("account")
        if account_id:
            queryset = queryset.filter(account_id=account_id)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            reconciliation = open_reconciliation(user=request.user, **data)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(
            ReconciliationDetailSerializer(reconciliation).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def attach(self, request, pk=None):
        """Mark a posted transaction as appearing on the statement."""
        reconciliation = self.get_object()
        serializer = AttachTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            attach_transaction_to_reconciliation(
                reconciliation=reconciliation,
                transaction=serializer.validated_data["transaction"],
                user=request.user,
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        reconciliation.refresh_from_db()
        return Response(ReconciliationDetailSerializer(reconciliation).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Freeze the period. Refuses if the statement and ledger disagree."""
        reconciliation = self.get_object()
        try:
            completed = complete_reconciliation(reconciliation=reconciliation, user=request.user)
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc
        return Response(ReconciliationDetailSerializer(completed).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Unfreeze a completed period so its transactions can be corrected."""
        reconciliation = self.get_object()
        serializer = ReopenReconciliationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reopened = reopen_reconciliation(
                reconciliation=reconciliation,
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except (DjangoValidationError, ValueError) as exc:
            raise _as_drf_error(exc) from exc

        return Response(ReconciliationDetailSerializer(reopened).data)

    @action(detail=True, methods=["get"])
    def suggestions(self, request, pk=None):
        """Posted movements on this account not yet tied to a completed period."""
        reconciliation = self.get_object()
        candidates = unreconciled_posted_transactions(
            reconciliation.account, up_to=reconciliation.period_end
        )
        return Response(TransactionSerializer(candidates, many=True).data)


def _is_administrator(user) -> bool:
    return bool(
        user
        and (
            user.is_superuser
            or user.groups.filter(name="Administrator").exists()
        )
    )


class DailyBudgetViewSet(viewsets.GenericViewSet):
    """Today's cash-on-hand cards and historical chart series."""

    permission_classes = [IsAuthenticated, CanFillDailyBudget]
    queryset = DailyBudget.objects.select_related("company", "filled_by")
    serializer_class = DailyBudgetSerializer
    pagination_class = None

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj

    def list(self, request):
        today = timezone.localdate()
        companies = Company.objects.filter(is_archived=False).order_by("name")
        today_rows = {
            row.company_id: row
            for row in DailyBudget.objects.filter(date=today).select_related(
                "company", "filled_by"
            )
        }
        prior_rows = {}
        missing = [c.id for c in companies if c.id not in today_rows]
        if missing:
            for row in (
                DailyBudget.objects.filter(company_id__in=missing, date__lt=today)
                .select_related("company", "filled_by")
                .order_by("company_id", "-date")
            ):
                prior_rows.setdefault(row.company_id, row)

        payload = []
        for company in companies:
            today_row = today_rows.get(company.id)
            if today_row:
                payload.append(
                    {
                        **DailyBudgetSerializer(today_row).data,
                        "is_filled_today": not today_row.is_carried_over,
                        "is_carried_over": today_row.is_carried_over,
                    }
                )
                continue
            prior = prior_rows.get(company.id)
            payload.append(
                {
                    "id": None,
                    "company": str(company.id),
                    "company_name": company.name,
                    "date": today.isoformat(),
                    "amount": str(prior.amount) if prior else None,
                    "note": prior.note if prior else "",
                    "filled_by": str(prior.filled_by_id) if prior and prior.filled_by_id else None,
                    "filled_by_name": "",
                    "filled_at": prior.filled_at.isoformat() if prior else None,
                    "is_carried_over": True,
                    "is_filled_today": False,
                    "created_at": None,
                    "updated_at": None,
                }
            )
        return Response(payload)

    def create(self, request):
        serializer = DailyBudgetWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        today = timezone.localdate()
        target_date = data.get("date") or today
        if target_date != today and not _is_administrator(request.user):
            raise PermissionDenied(_("Only administrators can edit a past day's entry."))
        try:
            company = Company.objects.get(pk=data["company"], is_archived=False)
        except Company.DoesNotExist:
            raise DRFValidationError({"company": [_("Company not found.")]})

        row, _created = DailyBudget.objects.update_or_create(
            company=company,
            date=target_date,
            defaults={
                "amount": data["amount"],
                "note": data.get("note") or "",
                "filled_by": request.user,
                "is_carried_over": False,
            },
        )
        DailyBudget.objects.filter(pk=row.pk).update(filled_at=timezone.now())
        row.refresh_from_db()
        body = DailyBudgetSerializer(row).data
        body["is_filled_today"] = True
        body["is_carried_over"] = False
        return Response(body, status=status.HTTP_200_OK)

    def partial_update(self, request, pk=None):
        row = self.get_object()
        today = timezone.localdate()
        if row.date != today and not _is_administrator(request.user):
            raise PermissionDenied(_("Only administrators can edit a past day's entry."))
        serializer = DailyBudgetWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "amount" in data:
            row.amount = data["amount"]
        if "note" in data:
            row.note = data["note"]
        row.filled_by = request.user
        row.is_carried_over = False
        row.save()
        DailyBudget.objects.filter(pk=row.pk).update(filled_at=timezone.now())
        row.refresh_from_db()
        return Response(DailyBudgetSerializer(row).data)

    @action(detail=False, methods=["get"])
    def history(self, request):
        company_id = request.query_params.get("company")
        if not company_id:
            raise DRFValidationError({"company": [_("company is required.")]})
        range_key = (request.query_params.get("range") or "7d").lower()
        today = timezone.localdate()
        rows = list(
            DailyBudget.objects.filter(company_id=company_id)
            .order_by("date")
            .values("date", "amount", "is_carried_over")
        )
        if range_key == "all":
            start = rows[0]["date"] if rows else today
        else:
            days = {"7d": 7, "1m": 30, "1y": 365}.get(range_key, 7)
            start = today - timedelta(days=days - 1)
        by_date = {row["date"]: row for row in rows}
        series = []
        cursor = start
        last_amount = None
        last_filled = None
        for prior in rows:
            if prior["date"] < start:
                last_amount = prior["amount"]
                last_filled = prior["date"]
        while cursor <= today:
            row = by_date.get(cursor)
            if row:
                last_amount = row["amount"]
                last_filled = cursor
                carried = row["is_carried_over"]
            else:
                carried = True
            series.append(
                {
                    "date": cursor.isoformat(),
                    "amount": str(last_amount) if last_amount is not None else None,
                    "is_carried_over": carried if last_amount is not None else False,
                    "source_date": last_filled.isoformat() if last_filled else None,
                }
            )
            cursor += timedelta(days=1)
        return Response(series)
