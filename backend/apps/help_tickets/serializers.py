from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.security import (
    TICKET_FILE_ERROR,
    collect_request_uploads,
    validate_ticket_uploads,
)

from .models import ClientTicket, ClientTicketAttachment, HelpTicket


class HelpTicketCreateSerializer(serializers.ModelSerializer):
    website = serializers.CharField(required=False, allow_blank=True, write_only=True, default="")

    class Meta:
        model = HelpTicket
        fields = ["reason", "name", "email", "message", "website"]

    def create(self, validated_data):
        validated_data.pop("website", None)
        return super().create(validated_data)


class HelpTicketSerializer(serializers.ModelSerializer):
    resolved_by_name = serializers.SerializerMethodField()
    replied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HelpTicket
        fields = [
            'id', 'reason', 'name', 'email', 'message', 'status',
            'created_at', 'updated_at', 'resolved_by', 'resolved_by_name',
            'reply_subject', 'reply_body', 'replied_at', 'reply_sent',
            'replied_by', 'replied_by_name',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_resolved_by_name(self, obj):
        if obj.resolved_by:
            return getattr(obj.resolved_by, 'get_full_name', lambda: str(obj.resolved_by))()
        return None

    def get_replied_by_name(self, obj):
        if obj.replied_by:
            return getattr(obj.replied_by, 'get_full_name', lambda: str(obj.replied_by))()
        return None


class HelpTicketReplySerializer(serializers.Serializer):
    reply_subject = serializers.CharField(max_length=300)
    reply_body = serializers.CharField()
    channel = serializers.ChoiceField(
        choices=("email", "sms", "whatsapp"), required=False, default="email"
    )
    phone = serializers.CharField(required=False, allow_blank=True, default="")


class ClientTicketAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ClientTicketAttachment
        fields = ["id", "file_name", "content_type", "size_bytes", "download_url", "created_at"]
        read_only_fields = fields

    def get_download_url(self, obj):
        return f"/api/v1/help/client-tickets/{obj.ticket_id}/attachments/{obj.pk}/download/"


class ClientTicketCreateSerializer(serializers.ModelSerializer):
    """Public intake. Visitor-supplied fields are writable; id is returned.

    Accepts JSON with no files, a legacy single `file`, or multiple `files` /
    `files[]` parts. Existing tickets with zero or one attachment keep working.
    """

    file = serializers.FileField(required=False, write_only=True)
    files = serializers.ListField(
        child=serializers.FileField(), required=False, write_only=True, allow_empty=True
    )
    website = serializers.CharField(required=False, allow_blank=True, write_only=True, default="")
    attachments = ClientTicketAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ClientTicket
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "company",
            "message",
            "file",
            "files",
            "website",
            "attachments",
        ]
        read_only_fields = ["id", "attachments"]

    def validate(self, attrs):
        attrs.pop("website", None)
        request = self.context.get("request")
        collected = collect_request_uploads(request, "files", "files[]", "file")
        listed = list(attrs.get("files") or [])
        legacy = attrs.get("file")
        uploads = collected or ([*listed, legacy] if legacy or listed else [])
        try:
            attrs["_uploads"] = validate_ticket_uploads(uploads)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"detail": TICKET_FILE_ERROR}) from exc
        return attrs

    def create(self, validated_data):
        uploads = validated_data.pop("_uploads", [])
        validated_data.pop("files", None)
        validated_data.pop("file", None)
        validated_data.pop("website", None)
        ticket = ClientTicket.objects.create(**validated_data)
        for upload in uploads:
            mime = getattr(upload, "_detected_mime", "") or getattr(upload, "content_type", "") or ""
            ClientTicketAttachment.objects.create(
                ticket=ticket,
                file=upload,
                file_name=getattr(upload, "name", "") or "attachment",
                content_type=mime,
                size_bytes=int(getattr(upload, "size", 0) or 0),
            )
        return ticket


class ClientTicketSerializer(serializers.ModelSerializer):
    replied_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    company_label = serializers.CharField(
        source="get_company_display", read_only=True
    )
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = ClientTicket
        fields = [
            "id", "name", "email", "phone", "company", "company_label",
            "message", "status", "is_read", "created_at", "updated_at",
            "reply_body", "replied_at", "replied_by", "replied_by_name",
            "resolved_at", "resolved_by", "resolved_by_name", "attachments",
        ]
        # Visitor-supplied content is immutable for staff; they reply, they do
        # not rewrite the client's words.
        read_only_fields = [
            "name", "email", "phone", "company", "message",
            "created_at", "updated_at", "replied_at", "replied_by",
            "resolved_at", "resolved_by", "attachments",
        ]

    def _name(self, user):
        if not user:
            return None
        return getattr(user, "get_full_name", lambda: str(user))() or str(user)

    def get_replied_by_name(self, obj):
        return self._name(obj.replied_by)

    def get_resolved_by_name(self, obj):
        return self._name(obj.resolved_by)

    def get_attachments(self, obj):
        items = [item for item in obj.attachments.all() if not item.deleted]
        return ClientTicketAttachmentSerializer(items, many=True, context=self.context).data


class ClientTicketReplySerializer(serializers.Serializer):
    reply_body = serializers.CharField()
    # Replying does not force resolution; staff decide explicitly.
    mark_solved = serializers.BooleanField(required=False, default=False)
    channel = serializers.ChoiceField(
        choices=("email", "sms", "whatsapp"), required=False, default="email"
    )
