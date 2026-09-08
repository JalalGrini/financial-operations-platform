"""IP rate limits backed by Django's default cache.

In production the cache is Redis, so every gunicorn worker shares one counter.
Limits are applied only to the auth and public-ticket paths listed below.
"""

from django.core.cache import cache
from django.http import JsonResponse

from apps.common.http import client_ip

# path (no trailing slash) -> (max requests, window seconds)
_LIMITS = {
    "/api/v1/auth/login": (5, 60),
    "/api/v1/auth/token/refresh": (5, 60),
    "/api/v1/auth/refresh": (5, 60),
    "/api/v1/help/tickets": (3, 3600),
    "/api/v1/help/client-tickets": (3, 3600),
}

_TICKET_PATHS = frozenset(
    {
        "/api/v1/help/tickets",
        "/api/v1/help/client-tickets",
    }
)
_TICKET_DAILY_MAX = 10
_TICKET_DAILY_WINDOW = 86400


def _normalize_path(path: str) -> str:
    if not path:
        return "/"
    stripped = path.rstrip("/")
    return stripped or "/"


def _hit(cache_key: str, window: int) -> int:
    if cache.add(cache_key, 1, timeout=window):
        return 1
    try:
        return cache.incr(cache_key)
    except ValueError:
        cache.set(cache_key, 1, timeout=window)
        return 1


def _blocked(detail: str, retry_after: int):
    response = JsonResponse({"detail": detail}, status=429)
    response["Retry-After"] = str(retry_after)
    return response


class RateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method != "POST":
            return self.get_response(request)
        path = _normalize_path(request.path)
        limit = _LIMITS.get(path)
        if limit is None:
            return self.get_response(request)

        ip = client_ip(request)
        if path in _TICKET_PATHS:
            daily_count = _hit(f"rl:tickets:daily:{ip}", _TICKET_DAILY_WINDOW)
            if daily_count > _TICKET_DAILY_MAX:
                return _blocked(
                    "Trop de tentatives. Réessayez dans 24 heures.",
                    _TICKET_DAILY_WINDOW,
                )

        max_requests, window = limit
        cache_key = f"rl:{path}:{ip}"
        count = _hit(cache_key, window)
        if count > max_requests:
            if window >= 3600:
                detail = "Trop de tentatives. Réessayez dans 1 heure."
            else:
                detail = "Trop de tentatives. Réessayez dans 1 minute."
            return _blocked(detail, window)
        return self.get_response(request)
