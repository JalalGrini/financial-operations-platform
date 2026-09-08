from botocore.exceptions import ClientError
from storages.backends.s3boto3 import S3Boto3Storage
from storages.utils import clean_name


class PrivateMediaStorage(S3Boto3Storage):
    """Cloudflare R2 requires path-style addressing and rejects object ACLs."""

    default_acl = None
    file_overwrite = True
    querystring_auth = True
    location = "private"
    addressing_style = "path"
    signature_version = "s3v4"
    custom_domain = None

    def get_available_name(self, name, max_length=None):
        # django-storages' exists() returns False whenever file_overwrite is
        # True, which is correct for overwrite-on-save but makes avatar/photo
        # download views think a just-uploaded file is missing. Keep overwrite
        # here and implement a real HeadObject in exists().
        name = clean_name(name)
        if max_length and len(name) > max_length:
            name = name[:max_length]
        return name

    def exists(self, name):
        name = self._normalize_name(clean_name(name))
        try:
            self.connection.meta.client.head_object(Bucket=self.bucket_name, Key=name)
            return True
        except ClientError as exc:
            status = (exc.response or {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status in {400, 404}:
                return False
            raise
