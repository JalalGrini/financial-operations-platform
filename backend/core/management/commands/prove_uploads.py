from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Write, head, and delete a tiny object to prove R2 storage works."

    def handle(self, *args, **options):
        key = default_storage.save(
            "prove-uploads/ok.txt", ContentFile(b"efop-prove-uploads")
        )
        if not default_storage.exists(key):
            raise CommandError(f"Saved {key} but exists() is false.")
        with default_storage.open(key, "rb") as handle:
            payload = handle.read()
        if payload != b"efop-prove-uploads":
            raise CommandError("Read back a different payload.")
        default_storage.delete(key)
        self.stdout.write(self.style.SUCCESS(f"R2 storage OK ({key})"))
