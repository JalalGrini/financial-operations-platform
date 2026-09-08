from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Write, read, and delete a tiny JPEG to prove R2 storage works."

    def handle(self, *args, **options):
        from PIL import Image

        buffer = BytesIO()
        Image.new("RGB", (16, 16), "green").save(buffer, format="JPEG")
        payload = buffer.getvalue()
        key = default_storage.save(
            "prove-uploads/ok.jpg", ContentFile(payload, name="ok.jpg")
        )
        with default_storage.open(key, "rb") as handle:
            stored = handle.read()
        if stored[:3] != b"\xff\xd8\xff":
            raise CommandError("Read back a payload that is not a JPEG.")
        if not default_storage.exists(key):
            raise CommandError(f"Saved and read {key} but exists() is false.")
        default_storage.delete(key)
        self.stdout.write(self.style.SUCCESS(f"R2 storage OK ({key})"))
