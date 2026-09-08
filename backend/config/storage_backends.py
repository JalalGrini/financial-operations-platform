from botocore.exceptions import ClientError
from storages.backends.s3boto3 import S3Boto3Storage


class PrivateMediaStorage(S3Boto3Storage):
    """Cloudflare R2 requires path-style addressing and rejects object ACLs."""

    default_acl = None
    file_overwrite = True
    querystring_auth = True
    location = "private"
    addressing_style = "path"
    signature_version = "s3v4"
    custom_domain = None

    def exists(self, name):
        try:
            return super().exists(name)
        except ClientError as exc:
            status = (exc.response or {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status in {400, 404}:
                return False
            raise
