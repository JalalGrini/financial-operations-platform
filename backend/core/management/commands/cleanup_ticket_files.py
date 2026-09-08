from datetime import timedelta

import boto3
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Delete R2 attachments from help tickets older than 30 days"

    def handle(self, *args, **options):
        from apps.help_tickets.models import ClientTicketAttachment

        cutoff = timezone.now() - timedelta(days=30)
        old_attachments = ClientTicketAttachment.objects.filter(
            created_at__lt=cutoff, deleted=False
        )

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="auto",
        )

        deleted_count = 0
        for attachment in old_attachments:
            key = (attachment.r2_key or "").strip() or (
                attachment.file.name if attachment.file else ""
            )
            if not key:
                attachment.deleted = True
                attachment.save(update_fields=["deleted"])
                deleted_count += 1
                continue
            try:
                s3.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=key)
                attachment.deleted = True
                attachment.save(update_fields=["deleted"])
                deleted_count += 1
            except Exception as exc:
                self.stderr.write(f"Failed to delete {key}: {exc}")

        self.stdout.write(f"Cleaned up {deleted_count} old attachments.")
