import logging

from rest_framework import generics
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from apps.common.http import client_ip
from apps.common.permissions import RoleBasedAccessPermission
from apps.common.security import TICKET_FILE_ERROR
from .models import ClientTicket, ClientTicketAttachment, HelpTicket
from .serializers import HelpTicketCreateSerializer, HelpTicketSerializer, HelpTicketReplySerializer
from .serializers import (
    ClientTicketCreateSerializer,
    ClientTicketReplySerializer,
    ClientTicketSerializer,
)


logger = logging.getLogger(__name__)
HONEYPOT_OK = {"detail": "Votre message a été envoyé.", "id": "fake"}


def _honeypot_filled(request) -> bool:
    value = request.data.get("website", "")
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    return bool(str(value).strip())


class HelpTicketCreateView(APIView):
    """POST /api/help/tickets/ — public, no auth required."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        if _honeypot_filled(request):
            logger.warning("honeypot help ticket ip=%s", client_ip(request))
            return Response(HONEYPOT_OK, status=status.HTTP_200_OK)
        serializer = HelpTicketCreateSerializer(data=request.data)
        if serializer.is_valid():
            ticket = serializer.save()
            from apps.common.email_copy import help_subject, ticket_received_body
            from apps.common.mailer import send_platform_email_quietly

            subject = help_subject(ticket.subject_key, ticket.locale)
            send_platform_email_quietly(
                to=ticket.email,
                subject=subject,
                body=ticket_received_body(ticket.name, subject, ticket.locale),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def _is_administrator(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user.groups.filter(name="Administrator").exists()


class CanManageHelpTickets(RoleBasedAccessPermission):
    """Help tickets (account recovery) are Administrator-only. Client tickets stay Assistant+Admin."""

    READ_ROLES = ("Administrator",)
    WRITE_ROLES = ("Administrator",)
    DELETE_ROLES = ("Administrator",)
    message = "You do not have permission to manage help tickets."


class HelpTicketListView(APIView):
    """GET /api/help/tickets/list/ — admin only."""
    permission_classes = [CanManageHelpTickets]

    def get(self, request):
        qs = HelpTicket.objects.all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(HelpTicketSerializer(qs, many=True).data)


class HelpTicketDetailView(APIView):
    """GET/PATCH/DELETE /api/help/tickets/{pk}/ — admin only."""
    permission_classes = [CanManageHelpTickets]

    def _get_ticket(self, pk):
        try:
            return HelpTicket.objects.get(pk=pk)
        except HelpTicket.DoesNotExist:
            return None

    def patch(self, request, pk):
        if not _is_administrator(request.user):
            return Response({'detail': 'Forbidden.'}, status=403)
        ticket = self._get_ticket(pk)
        if not ticket:
            return Response(status=404)
        serializer = HelpTicketSerializer(ticket, data=request.data, partial=True)
        if serializer.is_valid():
            if 'status' in request.data and request.data['status'] == 'closed':
                serializer.save(resolved_by=request.user)
            else:
                serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if not _is_administrator(request.user):
            return Response({'detail': 'Forbidden.'}, status=403)
        ticket = self._get_ticket(pk)
        if not ticket:
            return Response(status=404)
        ticket.delete()
        return Response(status=204)


class HelpTicketReplyView(APIView):
    """POST /api/help/tickets/{pk}/reply/ — admin only. Sends reply email."""
    permission_classes = [CanManageHelpTickets]

    def post(self, request, pk):
        if not _is_administrator(request.user):
            return Response({'detail': 'Forbidden.'}, status=403)
        try:
            ticket = HelpTicket.objects.get(pk=pk)
        except HelpTicket.DoesNotExist:
            return Response(status=404)
        serializer = HelpTicketReplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        subject = serializer.validated_data['reply_subject']
        body = serializer.validated_data['reply_body']
        channel = serializer.validated_data.get('channel') or 'email'
        phone = serializer.validated_data.get('phone') or ''

        from apps.common.messaging import MessagingError, send_ticket_reply

        try:
            send_ticket_reply(
                channel,
                subject=subject,
                body=body,
                email=ticket.email,
                phone=phone or None,
            )
            with transaction.atomic():
                ticket.reply_subject = subject
                ticket.reply_body = body
                ticket.replied_at = timezone.now()
                ticket.replied_by = request.user
                ticket.reply_sent = True
                ticket.status = 'closed'
                ticket.resolved_by = request.user
                ticket.save()
            return Response(HelpTicketSerializer(ticket).data)
        except Exception as e:
            # Save the reply even if delivery fails (admin can retry)
            with transaction.atomic():
                ticket.reply_subject = subject
                ticket.reply_body = body
                ticket.replied_at = timezone.now()
                ticket.replied_by = request.user
                ticket.reply_sent = False
                ticket.save()
            detail = (
                f'Reply saved but {channel} delivery failed: {e}'
                if not isinstance(e, MessagingError)
                else f'Reply saved but {channel} delivery failed: {e}'
            )
            return Response(
                {'detail': detail, 'ticket': HelpTicketSerializer(ticket).data},
                status=207
            )


# --------------------------------------------------------- client tickets
# Both administrators and assistants handle inbound client tickets.
# Group names, not lowercase role strings: this platform stores roles in
# Django Groups (see apps/personnel/permissions.py). Directors are
# deliberately excluded - client tickets are handled by admins and assistants.
CLIENT_TICKET_GROUPS = ("Administrator", "Assistant")


class IsClientTicketStaff(RoleBasedAccessPermission):
    """Allow only administrators and assistants to manage client tickets.

    Directors are intentionally excluded — client tickets involve direct
    communication with external contacts and are handled by admins/assistants.
    """

    READ_ROLES = ("Administrator", "Assistant")
    WRITE_ROLES = ("Administrator", "Assistant")
    DELETE_ROLES = ("Administrator",)
    message = "You do not have permission to manage client tickets."


class ClientTicketCreateView(generics.CreateAPIView):
    """Public endpoint used by the landing page form."""

    queryset = ClientTicket.objects.all()
    serializer_class = ClientTicketCreateSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def create(self, request, *args, **kwargs):
        if _honeypot_filled(request):
            logger.warning("honeypot client ticket ip=%s", client_ip(request))
            return Response(HONEYPOT_OK, status=status.HTTP_200_OK)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            errors = serializer.errors
            if "detail" in errors or "files" in errors or "file" in errors:
                return Response(
                    {"detail": TICKET_FILE_ERROR},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        ticket = serializer.instance
        from apps.common.email_copy import client_subject, ticket_received_body
        from apps.common.mailer import send_platform_email_quietly

        subject = client_subject(ticket.subject_key, ticket.locale)
        send_platform_email_quietly(
            to=ticket.email,
            subject=subject,
            body=ticket_received_body(ticket.name, subject, ticket.locale),
        )
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class ClientTicketListView(generics.ListAPIView):
    serializer_class = ClientTicketSerializer
    permission_classes = [IsClientTicketStaff]

    def get_queryset(self):
        qs = ClientTicket.objects.prefetch_related("attachments")
        status_param = self.request.query_params.get("status")
        if status_param in dict(ClientTicket.STATUS_CHOICES):
            qs = qs.filter(status=status_param)
        return qs


class ClientTicketDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve, and update status / is_read. Solved tickets are retained."""

    queryset = ClientTicket.objects.prefetch_related("attachments")
    serializer_class = ClientTicketSerializer
    permission_classes = [IsClientTicketStaff]

    def perform_update(self, serializer):
        previous = serializer.instance.status
        obj = serializer.save()
        if obj.status == "solved" and previous != "solved":
            obj.resolved_at = timezone.now()
            obj.resolved_by = self.request.user
            obj.save(update_fields=["resolved_at", "resolved_by"])


class ClientTicketAttachmentDownloadView(APIView):
    """Staff-only download of a stored ticket attachment."""

    permission_classes = [IsClientTicketStaff]

    def get(self, request, pk, attachment_id):
        attachment = get_object_or_404(
            ClientTicketAttachment.objects.select_related("ticket"),
            pk=attachment_id,
            ticket_id=pk,
            deleted=False,
        )
        if not attachment.file:
            return Response({"detail": "No file is attached."}, status=status.HTTP_404_NOT_FOUND)
        try:
            handle = attachment.file.open("rb")
        except FileNotFoundError:
            return Response(
                {"detail": "The stored file is unavailable."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            handle,
            as_attachment=True,
            filename=attachment.file_name or attachment.file.name.rsplit("/", 1)[-1],
            content_type=attachment.content_type or "application/octet-stream",
        )


class ClientTicketReplyView(APIView):
    permission_classes = [IsClientTicketStaff]

    def post(self, request, pk):
        try:
            ticket = ClientTicket.objects.get(pk=pk)
        except ClientTicket.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = ClientTicketReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from apps.common.messaging import MessagingError, send_ticket_reply

        ticket.reply_body = data["reply_body"]
        ticket.replied_at = timezone.now()
        ticket.replied_by = request.user
        ticket.is_read = True
        if data.get("mark_solved"):
            ticket.status = "solved"
            ticket.resolved_at = timezone.now()
            ticket.resolved_by = request.user
        elif ticket.status == "new":
            ticket.status = "in_progress"
        ticket.save()

        channel = data.get("channel") or "email"
        from apps.common.email_copy import client_subject
        reply_subject = client_subject(ticket.subject_key, ticket.locale)
        try:
            send_ticket_reply(
                channel,
                subject=reply_subject,
                body=data["reply_body"],
                email=ticket.email,
                phone=ticket.phone or None,
            )
        except (MessagingError, Exception):
            # Reply is stored even if the channel cannot deliver yet.
            pass

        return Response(ClientTicketSerializer(ticket).data)
