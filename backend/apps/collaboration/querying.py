from django.contrib.contenttypes.models import ContentType

from apps.collaboration.models import Mention


class TaggedForMeFilterMixin:
    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        if self.request.query_params.get("tagged_for_me") in ("1", "true", "yes"):
            ct = ContentType.objects.get_for_model(queryset.model, for_concrete_model=False)
            ids = Mention.objects.filter(
                tagged_user=self.request.user, content_type=ct, resolved_at__isnull=True
            ).values("object_id")
            queryset = queryset.filter(pk__in=ids)
        return queryset
