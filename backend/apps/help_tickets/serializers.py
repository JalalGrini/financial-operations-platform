from rest_framework import serializers
from .models import ClientTicket, HelpTicket


class HelpTicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = HelpTicket
        fields = ['reason', 'name', 'email', 'message']


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


class ClientTicketCreateSerializer(serializers.ModelSerializer):
    """Public intake. Visitor-supplied fields are writable; id is returned."""

    class Meta:
        model = ClientTicket
        fields = ["id", "name", "email", "phone", "company", "message"]
        read_only_fields = ["id"]


class ClientTicketSerializer(serializers.ModelSerializer):
    replied_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    company_label = serializers.CharField(
        source="get_company_display", read_only=True
    )

    class Meta:
        model = ClientTicket
        fields = [
            "id", "name", "email", "phone", "company", "company_label",
            "message", "status", "is_read", "created_at", "updated_at",
            "reply_body", "replied_at", "replied_by", "replied_by_name",
            "resolved_at", "resolved_by", "resolved_by_name",
        ]
        # Visitor-supplied content is immutable for staff; they reply, they do
        # not rewrite the client's words.
        read_only_fields = [
            "name", "email", "phone", "company", "message",
            "created_at", "updated_at", "replied_at", "replied_by",
            "resolved_at", "resolved_by",
        ]

    def _name(self, user):
        if not user:
            return None
        return getattr(user, "get_full_name", lambda: str(user))() or str(user)

    def get_replied_by_name(self, obj):
        return self._name(obj.replied_by)

    def get_resolved_by_name(self, obj):
        return self._name(obj.resolved_by)


class ClientTicketReplySerializer(serializers.Serializer):
    reply_body = serializers.CharField()
    # Replying does not force resolution; staff decide explicitly.
    mark_solved = serializers.BooleanField(required=False, default=False)
    channel = serializers.ChoiceField(
        choices=("email", "sms", "whatsapp"), required=False, default="email"
    )
