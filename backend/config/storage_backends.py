from storages.backends.s3boto3 import S3Boto3Storage


class PrivateMediaStorage(S3Boto3Storage):
    """Cloudflare R2 requires path-style addressing and rejects object ACLs."""

    default_acl = None
    file_overwrite = False
    querystring_auth = True
    location = "private"
    addressing_style = "path"
    signature_version = "s3v4"
    custom_domain = None
