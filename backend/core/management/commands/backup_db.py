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
        try:
            self._report_r2_usage(s3)
        except Exception as exc:
            self.stderr.write(f"R2 storage check failed: {exc}")

    def _report_r2_usage(self, s3):
        bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "") or ""
        if not bucket:
            return
        total_size = 0
        token = None
        while True:
            kwargs = {"Bucket": bucket}
            if token:
                kwargs["ContinuationToken"] = token
            response = s3.list_objects_v2(**kwargs)
            total_size += sum(obj.get("Size", 0) for obj in response.get("Contents") or [])
            if not response.get("IsTruncated"):
                break
            token = response.get("NextContinuationToken")
            if not token:
                break
        total_gb = total_size / (1024**3)
        if total_gb > 7.0:
            self.stderr.write(
                f"WARNING: R2 storage at {total_gb:.2f}GB — approaching free tier limit!"
            )
            raise SystemExit(1)
        self.stdout.write(f"R2 storage: {total_gb:.2f}GB / 10GB")
