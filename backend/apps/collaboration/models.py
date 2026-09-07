import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class Notification(models.Model):
    class Category(models.TextChoices):
        MENTION = "mention", "Mention"
        PAYROLL = "payroll", "Payroll"
        CNSS = "cnss", "CNSS"
        DOCUMENT = "document", "Financial document"
        REPORT = "report", "Report"
        PAYMENT = "payment", "Payment"
        SYSTEM = "system", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications_created",
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    category = models.CharField(max_length=32, choices=Category.choices, db_index=True)
    title = models.CharField(max_length=160)
    message = models.CharField(max_length=500, blank=True)
    destination = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["recipient", "read_at", "-created_at"], name="collab_notif_inbox_idx"
            )
        ]


class Mention(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tagged_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mentions_received"
    )
    tagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="mentions_created"
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentions",
    )
    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT)
    object_id = models.UUIDField(db_index=True)
    target = GenericForeignKey("content_type", "object_id")
    target_label = models.CharField(max_length=240)
    destination = models.CharField(max_length=500)
    message = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["tagged_user", "resolved_at", "-created_at"],
                name="collab_mention_queue_idx",
            ),
            models.Index(fields=["content_type", "object_id"], name="collab_mention_target_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tagged_user", "content_type", "object_id"],
                condition=models.Q(resolved_at__isnull=True),
                name="collab_unique_active_mention",
            )
        ]
