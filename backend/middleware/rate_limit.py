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
    "/api/v1/help/tickets": (3, 60),
}


def _normalize_path(path: str) -> str:
    if not path:
        return "/"
    stripped = path.rstrip("/")
    return stripped or "/"


class RateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = _normalize_path(request.path)
        limit = _LIMITS.get(path)
        if limit is None:
            return self.get_response(request)

        max_requests, window = limit
        ip = client_ip(request)
        cache_key = f"rl:{path}:{ip}"
        if cache.add(cache_key, 1, timeout=window):
            return self.get_response(request)
        try:
            count = cache.incr(cache_key)
        except ValueError:
            cache.set(cache_key, 1, timeout=window)
            return self.get_response(request)
        if count > max_requests:
            response = JsonResponse(
                {"detail": "Trop de tentatives. Réessayez dans 1 minute."},
                status=429,
            )
            response["Retry-After"] = str(window)
            return response
        return self.get_response(request)
