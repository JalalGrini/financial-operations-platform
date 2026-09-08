import os
import subprocess
from datetime import datetime, timezone

import boto3
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backup PostgreSQL database to Cloudflare R2"

    def handle(self, *args, **options):
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.sql"
        db = settings.DATABASES["default"]
        env = os.environ.copy()
        env["PGPASSWORD"] = db.get("PASSWORD") or ""
        dump_path = f"/tmp/{filename}"
        result = subprocess.run(
            [
                "pg_dump",
                "-h",
                db.get("HOST") or "localhost",
                "-p",
                str(db.get("PORT") or 5432),
                "-U",
                db.get("USER") or "",
                "-d",
                db.get("NAME") or "",
                "-f",
                dump_path,
            ],
            env=env,
            capture_output=True,
        )
        if result.returncode != 0:
            self.stderr.write(f"Backup failed: {result.stderr.decode()}")
            return
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        s3.upload_file(dump_path, "3rb-backups", f"db/{filename}")
        try:
            os.remove(dump_path)
        except OSError:
            pass
        self.stdout.write(f"Backup uploaded: db/{filename}")
