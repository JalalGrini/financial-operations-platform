from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.collaboration.models import Mention, Notification
from apps.collaboration.permissions import IsRecognizedEFOPUser
from apps.collaboration.serializers import (
    EligibleUserSerializer,
    MentionCreateSerializer,
    MentionSerializer,
    NotificationSerializer,
)
from apps.collaboration.services import untag_mention


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsRecognizedEFOPUser]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user).select_related(
            "actor", "company"
        )
        if self.request.query_params.get("unread") in ("1", "true", "yes"):
            queryset = queryset.filter(read_at__isnull=True)
        return queryset

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        obj = self.get_object()
        obj.read_at = obj.read_at or timezone.now()
        obj.save(update_fields=["read_at"])
        return Response(self.get_serializer(obj).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"updated": count})


class MentionViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsRecognizedEFOPUser]

    def get_serializer_class(self):
        return MentionCreateSerializer if self.action == "create" else MentionSerializer

    def get_queryset(self):
        user = self.request.user
        is_administrator = user.is_superuser or user.groups.filter(name="Administrator").exists()
        queryset = (
            Mention.objects.all()
            if is_administrator
            else Mention.objects.filter(Q(tagged_user=user) | Q(tagged_by=user))
        )
        queryset = queryset.select_related("tagged_user", "tagged_by", "content_type")
        params = self.request.query_params
        if params.get("assigned_to_me") in ("1", "true", "yes"):
            queryset = queryset.filter(tagged_user=self.request.user)
        if params.get("active") in ("1", "true", "yes"):
            queryset = queryset.filter(resolved_at__isnull=True)
        resource_type = params.get("resource_type", "")
        if resource_type and "." in resource_type:
            app_label, model = resource_type.split(".", 1)
            queryset = queryset.filter(content_type__app_label=app_label, content_type__model=model)
        if params.get("target_id"):
            queryset = queryset.filter(object_id=params["target_id"])
        return queryset.distinct()

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        obj = self.get_object()
        if obj.tagged_user_id != request.user.id:
            return Response({"detail": "Only the tagged user can mark this tag read."}, status=403)
        obj.read_at = obj.read_at or timezone.now()
        obj.save(update_fields=["read_at"])
        return Response(MentionSerializer(obj, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        obj = self.get_object()
        if obj.tagged_user_id != request.user.id:
            return Response({"detail": "Only the tagged user can resolve this tag."}, status=403)
        obj.resolved_at = obj.resolved_at or timezone.now()
        obj.read_at = obj.read_at or timezone.now()
        obj.save(update_fields=["resolved_at", "read_at"])
        return Response(MentionSerializer(obj, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="untag")
    def untag(self, request, pk=None):
        obj = self.get_object()
        try:
            obj = untag_mention(mention=obj, actor=request.user)
        except DjangoValidationError as exc:
            return Response({"detail": "; ".join(exc.messages)}, status=status.HTTP_403_FORBIDDEN)
        return Response(MentionSerializer(obj, context={"request": request}).data)


class EligibleUserViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsRecognizedEFOPUser]
    serializer_class = EligibleUserSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = (
            User.objects.filter(is_active=True)
            .filter(
                Q(is_superuser=True)
                | Q(groups__name__in=("Administrator", "Assistant", "Director"))
            )
            .distinct()
            .order_by("first_name", "last_name", "email")
        )
        query = self.request.query_params.get("q", "").strip()
        if query:
            queryset = queryset.filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(email__icontains=query)
            )
        return queryset[:30]
