import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import BaseModel


class AuditResult(models.TextChoices):
    SUCCESS = "success", _("Success")
    DENIED = "denied", _("Denied")
    FAILED = "failed", _("Failed")


class AuditEvent(BaseModel):
    """Append-only trace of an EFOP request or named domain operation."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    actor_email = models.EmailField(blank=True)
    actor_role = models.CharField(max_length=80, blank=True)
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=50, db_index=True)
    entity_type = models.CharField(max_length=100, blank=True, db_index=True)
    entity_id = models.CharField(max_length=100, blank=True, db_index=True)
    entity_reference = models.CharField(max_length=100, blank=True)
    summary = models.CharField(max_length=500)
    before = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    after = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    changes = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    request_method = models.CharField(max_length=10, blank=True)
    request_path = models.CharField(max_length=500, blank=True)
    result = models.CharField(
        max_length=20, choices=AuditResult.choices, default=AuditResult.SUCCESS, db_index=True
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    correlation_id = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at", "action"], name="audit_time_action_idx"),
            models.Index(fields=["actor", "-created_at"], name="audit_actor_time_idx"),
            models.Index(fields=["company", "-created_at"], name="audit_company_time_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit events are append-only and cannot be changed.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit events are append-only and cannot be deleted.")

    def __str__(self):
        return f"{self.created_at} {self.action} {self.entity_type} {self.entity_reference or self.entity_id}"
