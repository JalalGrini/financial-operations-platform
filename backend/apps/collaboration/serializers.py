from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.models import User
from apps.collaboration.models import Mention, Notification
from apps.collaboration.services import create_mention


def person_full_name(user) -> str:
    """First + last for tag UI. Never fall back to email as the primary label."""
    if user is None:
        return ""
    return f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "category",
            "title",
            "message",
            "destination",
            "metadata",
            "created_at",
            "read_at",
            "actor_name",
            "company_name",
        )
        read_only_fields = fields


class MentionSerializer(serializers.ModelSerializer):
    tagged_user_name = serializers.SerializerMethodField()
    tagged_by_name = serializers.SerializerMethodField()
    resource_type = serializers.SerializerMethodField()
    can_untag = serializers.SerializerMethodField()

    class Meta:
        model = Mention
        fields = (
            "id",
            "resource_type",
            "object_id",
            "target_label",
            "destination",
            "message",
            "created_at",
            "read_at",
            "resolved_at",
            "tagged_user",
            "tagged_user_name",
            "tagged_by",
            "tagged_by_name",
            "can_untag",
        )
        read_only_fields = fields

    def get_tagged_user_name(self, obj):
        return person_full_name(obj.tagged_user)

    def get_tagged_by_name(self, obj):
        return person_full_name(obj.tagged_by)

    def get_resource_type(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"

    def get_can_untag(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(
            user
            and (
                obj.tagged_by_id == user.id
                or user.is_superuser
                or user.groups.filter(name="Administrator").exists()
            )
        )


class MentionCreateSerializer(serializers.Serializer):
    resource_type = serializers.CharField(max_length=100)
    target_id = serializers.UUIDField()
    tagged_user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    message = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def create(self, data):
        try:
            return create_mention(actor=self.context["request"].user, **data)
        except DjangoValidationError as exc:
            detail = (
                getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
            )
            raise serializers.ValidationError(detail) from exc

    def to_representation(self, instance):
        """Return the canonical read representation after a successful create."""
        return MentionSerializer(instance, context=self.context).data


class EligibleUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "first_name", "last_name", "full_name", "email", "roles")

    def get_full_name(self, obj):
        return person_full_name(obj)

    def get_roles(self, obj):
        return (
            ["Administrator"]
            if obj.is_superuser
            else list(
                obj.groups.filter(name__in=("Administrator", "Assistant", "Director")).values_list(
                    "name", flat=True
                )
            )
        )
