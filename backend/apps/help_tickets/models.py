from django.db import models
from django.conf import settings
import os
import uuid


def client_ticket_attachment_upload_to(instance, filename):
    """R2 key uses a UUID; the original name is stored only in file_name."""
    ext = os.path.splitext(filename or "")[1].lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    if ext not in {"pdf", "jpg", "png"}:
        ext = "bin"
    ticket_id = instance.ticket_id or "pending"
    return f"tickets/{ticket_id}/{uuid.uuid4()}.{ext}"


class HelpTicket(models.Model):
    REASON_CHOICES = [
        ('forgot_password', 'Forgot password'),
        ('login_issue', 'Login problem'),
        ('access_denied', 'Access denied'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]

    reason = models.CharField(max_length=50, choices=REASON_CHOICES)
    name = models.CharField(max_length=200)
    email = models.EmailField()
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='resolved_tickets',
    )
    # Reply fields
    reply_subject = models.CharField(max_length=300, blank=True)
    reply_body = models.TextField(blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='replied_tickets',
    )
    reply_sent = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        db_table = 'help_tickets'

    def __str__(self):
        return f'[{self.reason}] {self.name} <{self.email}>'


# ---------------------------------------------------------------- clients
class ClientTicket(models.Model):
    """A ticket submitted by a prospective client from the public landing page.

    Kept separate from HelpTicket: HelpTicket is an internal account-recovery
    channel, while this is inbound commercial contact from an unauthenticated
    visitor. Different audience, different lifecycle, different permissions.
    """

    STATUS_CHOICES = (
        ("new", "New"),
        ("in_progress", "In progress"),
        ("solved", "Solved"),
    )

    # Company is a fixed choice list, not free text, so inbound tickets can be
    # routed and reported on without cleanup.
    COMPANY_CHOICES = (
        ("3rb_extreme", "3.R.B Extreme"),
        ("3rb_maroc", "3.R.B Maroc"),
        ("el_rhrib_cash", "EL RHRIB CASH"),
        ("other", "Other / not sure"),
    )

    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=40)
    company = models.CharField(max_length=32, choices=COMPANY_CHOICES)
    message = models.TextField()

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="new")
    # is_read is deliberately independent of status: staff need to mark a
    # ticket seen without claiming it is resolved.
    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    reply_body = models.TextField(blank=True, default="")
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="client_tickets_replied",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="client_tickets_resolved",
    )

    class Meta:
        db_table = "client_tickets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"ClientTicket #{self.pk} {self.name} <{self.email}>"


class ClientTicketAttachment(models.Model):
    """A document attached to a public client ticket, stored in R2 via default storage."""

    ticket = models.ForeignKey(
        ClientTicket,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=client_ticket_attachment_upload_to, max_length=500)
    file_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    r2_key = models.CharField(max_length=500, blank=True)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "client_ticket_attachments"
        ordering = ["id"]

    def __str__(self):
        return self.file_name

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        key = ""
        if self.file:
            key = self.file.name
        if key and self.r2_key != key:
            type(self).objects.filter(pk=self.pk).update(r2_key=key)
            self.r2_key = key
