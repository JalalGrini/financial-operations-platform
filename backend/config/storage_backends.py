from storages.backends.s3boto3 import S3Boto3Storage
class PrivateMediaStorage(S3Boto3Storage):
 default_acl=None
 file_overwrite=False
 querystring_auth=True
 location="private"
