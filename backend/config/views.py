"""
Health check views for the API.
"""

from django.db import connection
from django.db.utils import OperationalError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.throttling import DatabaseHealthRateThrottle
from config.release import public_release_data
from config.schema import (
    DatabaseHealthResponseSchema,
    HealthResponseSchema,
    ReleaseResponseSchema,
)


class HealthView(APIView):
    """
    Public health check endpoint.
    GET /api/v1/health/
    """

    permission_classes = []
    authentication_classes = []
    throttle_classes = []

    @extend_schema(
        responses={200: HealthResponseSchema},
        tags=["health"],
        description="Public health check endpoint. Always reports the service as healthy.",
    )
    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "Service is healthy.",
                "data": {
                    "service": "Financial Operations Platform",
                    "version": "v1",
                },
            },
            status=status.HTTP_200_OK,
        )


class ReleaseVersionView(APIView):
    """Public, credential-free frontend/backend release identity."""

    permission_classes = []
    authentication_classes = []

    @extend_schema(
        responses={200: ReleaseResponseSchema},
        tags=["health"],
        description="Return safe build metadata so clients can detect mixed releases.",
    )
    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "Release identity retrieved.",
                "data": public_release_data(),
            },
            status=status.HTTP_200_OK,
        )


class DatabaseHealthView(APIView):
    """
    Database health check endpoint.
    GET /api/v1/health/database/
    """

    permission_classes = []
    authentication_classes = []
    # Anonymous, and executes a real query on every hit, which makes it an
    # unauthenticated database-load amplifier. Throttled rather than
    # authenticated so orchestrator readiness probes keep working; see
    # apps/common/throttling.py.
    throttle_classes = [DatabaseHealthRateThrottle]

    @extend_schema(
        responses={200: DatabaseHealthResponseSchema, 503: DatabaseHealthResponseSchema},
        tags=["health"],
        description="Database health check endpoint. Returns 200 when the database "
        "connection succeeds, 503 when it fails.",
    )
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            db_status = "healthy"
            db_message = "Database connection successful."
            http_status = status.HTTP_200_OK
        except OperationalError:
            db_status = "unhealthy"
            db_message = "Database connection failed."
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(
            {
                "success": db_status == "healthy",
                "message": db_message,
                "data": {
                    "database": db_status,
                },
            },
            status=http_status,
        )
