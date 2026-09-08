import boto3
from botocore.config import Config
from django.conf import settings


def generate_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    """Return a time-limited GET URL for a private R2 object.

    Callers must already have authorized the request. Never return a
    permanent public R2 or AWS_S3_CUSTOM_DOMAIN URL to the frontend.
    """
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": object_key},
        ExpiresIn=expires_in,
    )
