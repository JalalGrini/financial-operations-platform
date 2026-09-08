from django.db import connection
from django.http import JsonResponse


def health_check(request):
    try:
        connection.ensure_connection()
        db_status = "connected"
    except Exception:
        db_status = "error"
    return JsonResponse({"status": "ok", "db": db_status}, status=200)
