# config/schema.py
"""
Schema-only serializers for the project-level health check endpoints.

M0-R2 Task 3 (see EFOP Engineering Log finding M0R-A3): `HealthView` and
`DatabaseHealthView` had no `serializer_class` and no `@extend_schema`,
so drf-spectacular fell back to its generic "unable to guess serializer"
error-level diagnostic for each of them.

These serializers exist ONLY to describe the existing, already-implemented
response shapes to drf-spectacular via `@extend_schema`. They are not used
for validation and do not change any view's runtime behavior:

- `HealthView.get()` and `DatabaseHealthView.get()` method bodies are not
  modified by this module or by the task that introduces it, only
  decorated.
- Field shapes below were characterized directly from the current view
  implementations in `config/views.py`.
"""
from rest_framework import serializers


class HealthDataSchema(serializers.Serializer):
    """Shape of the `data` object in `HealthView`'s response."""

    service = serializers.CharField()
    version = serializers.CharField()


class HealthResponseSchema(serializers.Serializer):
    """Response shape for `GET /api/v1/health/`."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = HealthDataSchema()


class DatabaseHealthDataSchema(serializers.Serializer):
    """Shape of the `data` object in `DatabaseHealthView`'s response."""

    database = serializers.CharField()


class ReleaseDataSchema(serializers.Serializer):
    """Safe build identity returned by the public version endpoint."""

    release_id = serializers.CharField()
    source_revision = serializers.CharField()
    built_at = serializers.CharField()
    schema_revision = serializers.CharField()
    environment = serializers.CharField()


class ReleaseResponseSchema(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    data = ReleaseDataSchema()


class DatabaseHealthResponseSchema(serializers.Serializer):
    """Response shape for `GET /api/v1/health/database/`, used for both
    the 200 (healthy) and 503 (unhealthy) branches since the two branches
    share the exact same field structure and only differ in field
    values and HTTP status code."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = DatabaseHealthDataSchema()
