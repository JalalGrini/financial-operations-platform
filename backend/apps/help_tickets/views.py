from rest_framework import generics
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from apps.common.permissions import RoleBasedAccessPermission
from .models import ClientTicket, HelpTicket
from .serializers import HelpTicketCreateSerializer, HelpTicketSerializer, HelpTicketReplySerializer
from .serializers import (
    ClientTicketCreateSerializer,
    ClientTicketReplySerializer,
    ClientTicketSerializer,
)


class HelpTicketCreateView(APIView):
    """POST /api/help/tickets/ — public, no auth required."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = HelpTicketCreateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CanManageHelpTickets(RoleBasedAccessPermission):
    """Administrators and Assistants manage help tickets; Directors read only."""

    message = "You do not have permission to manage help tickets."


class HelpTicketListView(APIView):
    """GET /api/help/tickets/ — admin only."""
    permission_classes = [CanManageHelpTickets]

    def _is_admin(self, user):
        return getattr(user, 'role', None) == 'administrator'

    def get(self, request):
        if not self._is_admin(request.user):
            return Response({'detail': 'Forbidden.'}, status=403)
        qs = HelpTicket.objects.all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(HelpTicketSerializer(qs, many=True).data)


class HelpTicketDetailView(APIView):
    """GET/PATCH/DELETE /api/help/tickets/{pk}/ — admin only."""
    permission_classes = [CanManageHelpTickets]

    def _is_admin(self, user):
        return getattr(user, 'role', None) == 'administrator'

    def _get_ticket(self, pk):
        try:
            return HelpTicket.objects.get(pk=pk)
        except HelpTicket.DoesNotExist:
            return None

    def patch(self, request, pk):
        if not self._is_admin(request.user):
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
        if not self._is_admin(request.user):
            return Response({'detail': 'Forbidden.'}, status=403)
        ticket = self._get_ticket(pk)
        if not ticket:
            return Response(status=404)
        ticket.delete()
        return Response(status=204)


class HelpTicketReplyView(APIView):
    """POST /api/help/tickets/{pk}/reply/ — admin only. Sends reply email."""
    permission_classes = [CanManageHelpTickets]

    def _is_admin(self, user):
        return getattr(user, 'role', None) == 'administrator'

    def post(self, request, pk):
        if not self._is_admin(request.user):
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


class ClientTicketListView(generics.ListAPIView):
    serializer_class = ClientTicketSerializer
    permission_classes = [IsClientTicketStaff]

    def get_queryset(self):
        qs = ClientTicket.objects.all()
        status_param = self.request.query_params.get("status")
        if status_param in dict(ClientTicket.STATUS_CHOICES):
            qs = qs.filter(status=status_param)
        return qs


class ClientTicketDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve, and update status / is_read. Solved tickets are retained."""

    queryset = ClientTicket.objects.all()
    serializer_class = ClientTicketSerializer
    permission_classes = [IsClientTicketStaff]

    def perform_update(self, serializer):
        previous = serializer.instance.status
        obj = serializer.save()
        if obj.status == "solved" and previous != "solved":
            obj.resolved_at = timezone.now()
            obj.resolved_by = self.request.user
            obj.save(update_fields=["resolved_at", "resolved_by"])


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
        try:
            send_ticket_reply(
                channel,
                subject="EFOP — Reply to your enquiry",
                body=data["reply_body"],
                email=ticket.email,
                phone=ticket.phone or None,
            )
        except (MessagingError, Exception):
            # Reply is stored even if the channel cannot deliver yet.
            pass

        return Response(ClientTicketSerializer(ticket).data)
