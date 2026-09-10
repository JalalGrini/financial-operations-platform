# config/settings/production.py
"""
Production settings for Financial Operations Platform.
"""
import os
from datetime import timedelta

import sentry_sdk
from django.core.exceptions import ImproperlyConfigured, PermissionDenied
from django.http import Http404
from rest_framework.exceptions import NotAuthenticated
from rest_framework.exceptions import NotFound as DRFNotFound
from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied

from .base import *  # noqa: F403,F401
from .base import env
from .host_utils import production_allowed_hosts

_sentry_dsn = env("SENTRY_DSN_BACKEND", default="")


def _sentry_before_send(event, hint):
    """Drop routine auth/not-found noise. ignore_errors integers are not classes."""
    exc_info = hint.get("exc_info")
    if not exc_info:
        return event
    exc = exc_info[1]
    if isinstance(
        exc,
        (Http404, PermissionDenied, NotAuthenticated, DRFPermissionDenied, DRFNotFound),
    ):
        return None
    status = getattr(exc, "status_code", None)
    if status in (401, 403, 404):
        return None
    return event


if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment="production",
        traces_sample_rate=0.05,
        profiles_sample_rate=0.05,
        send_default_pii=False,
        ignore_errors=[404, 401, 403],
        before_send=_sentry_before_send,
        include_local_variables=False,
    )

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

# Hosts must be explicitly set in production.
#
# BUGFIX (audit finding M-7): this override previously used
# ``env("DJANGO_ALLOWED_HOSTS")``. The list cast declared in base.py's
# environ.Env(...) is keyed on "ALLOWED_HOSTS", not "DJANGO_ALLOWED_HOSTS", so no
# cast applied and a raw string was returned. Django then refused to start with
# "The ALLOWED_HOSTS setting must be a list or a tuple.", meaning the production
# settings module could never boot. Use env.list() so the cast is explicit and
# independent of the schema key.
#
# Railway's deploy healthcheck sends Host: healthcheck.railway.app (see
# https://docs.railway.com/deployments/healthchecks). An ALLOWED_HOSTS list
# that only has the public hostname therefore returns 400 to the probe; Railway
# retries, then marks the replica failed — typically ~1 minute after gunicorn
# has already bound the port. Strip accidental https:// prefixes too: Django
# matches hostnames, not origins.
# 3rb-extreme.up.railway.app until a custom domain is added. Healthcheck
# host healthcheck.railway.app is always merged by production_allowed_hosts.
ALLOWED_HOSTS = production_allowed_hosts(
    env.list("DJANGO_ALLOWED_HOSTS", default=["3rb-extreme.up.railway.app"]),  # noqa: F405
    os.environ,
)

if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS is empty. Set your public hostname "
        "(e.g. api.example.com or 3rb-extreme-backend.up.railway.app)."
    )

# CORS - only allowed origins.
# env.list() here too, so this does not silently depend on the schema key
# happening to match the environment variable name.
CORS_ALLOW_ALL_ORIGINS = False
# Update when a custom domain is added.
_cors_locked = ["https://3rb-extreme.vercel.app"]
CORS_ALLOWED_ORIGINS = list(
    dict.fromkeys(_cors_locked + env.list("CORS_ALLOWED_ORIGINS", default=[]))  # noqa: F405
)
CORS_ALLOW_CREDENTIALS = True

# Update when a custom domain is added.
_csrf_locked = ["https://3rb-extreme.vercel.app"]
CSRF_TRUSTED_ORIGINS = list(
    dict.fromkeys(_csrf_locked + env.list("CSRF_TRUSTED_ORIGINS", default=[]))  # noqa: F405
)

# Security settings
# Railway public traffic is HTTPS via X-Forwarded-Proto. Health probes hit the
# container over HTTP, so they are exempt from the SSL redirect.
SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [
    r"^health/?$",
    r"^api/health/?$",
    r"^api/v1/health/?$",
    r"^api/v1/health/database/?$",
]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
JWT_AUTH_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
# CSRF cookie MUST remain readable by the Next.js client: GET /api/v1/auth/csrf/
# sets it and the browser echoes it in X-CSRFToken. HttpOnly would break login.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
TRUST_X_FORWARDED_FOR = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
CONTENT_SECURITY_POLICY = env(
    "CONTENT_SECURITY_POLICY",
    default="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
)

# JWT hardening (production). SIGNING_KEY is DJANGO_SECRET_KEY via SECRET_KEY;
# this project does not read an env var named SECRET_KEY.
SIMPLE_JWT = {
    **SIMPLE_JWT,  # noqa: F405
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,  # noqa: F405
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Redis cache (Upstash or Railway Redis via REDIS_URL). Rate-limit middleware
# uses django.core.cache and therefore this backend.
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default=""),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        "KEY_PREFIX": "3rb",
        "TIMEOUT": 300,
    }
}
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

SPECTACULAR_SETTINGS = {
    **SPECTACULAR_SETTINGS,  # noqa: F405
    "SERVERS": [
        {
            "url": "https://3rb-extreme.up.railway.app",
            "description": "Production API",
        },
    ],
}


# Email backend for production (configure as needed)
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="")  # noqa: F405
EMAIL_PORT = env.int("EMAIL_PORT", default=587)  # noqa: F405
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)  # noqa: F405
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")  # noqa: F405
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")  # noqa: F405
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@example.com")  # noqa: F405
EMAIL_API_URL = env("EMAIL_API_URL", default="")  # noqa: F405
EMAIL_API_KEY = env("EMAIL_API_KEY", default="")  # noqa: F405

# Static files: nginx in a VM deploy; WhiteNoise on Railway (no nginx).
# STATIC_ROOT is already set in base.py
# RateLimit sits immediately after SecurityMiddleware; WhiteNoise follows it.
if "whitenoise.middleware.WhiteNoiseMiddleware" not in MIDDLEWARE:  # noqa: F405
    _anchor = "middleware.rate_limit.RateLimitMiddleware"
    if _anchor not in MIDDLEWARE:  # noqa: F405
        _anchor = "django.middleware.security.SecurityMiddleware"
    _insert_idx = MIDDLEWARE.index(_anchor)  # noqa: F405
    MIDDLEWARE.insert(  # noqa: F405
        _insert_idx + 1, "whitenoise.middleware.WhiteNoiseMiddleware"
    )
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
}

# ---------------------------------------------------------------------------
# Startup safety assertions (audit finding M-4)
# ---------------------------------------------------------------------------
# The repository ships a .env containing a placeholder secret key
# ("your-secret-key-here-..."). Because SECRET_KEY is also the default JWT
# SIGNING_KEY, deploying with that placeholder would let anyone who has read the
# public repository forge session cookies and JWT access tokens - a full
# authentication bypass.
#
# Django cannot detect this on its own: a placeholder is a perfectly valid
# string. We therefore refuse to boot in production with a known-bad or
# suspiciously weak signing key. Failing loudly at startup is strictly better
# than serving traffic with forgeable tokens.
#
# (That secret-key guard is implemented further down, after the shared-cache
# guard added in Cycle 6. Both follow the same principle: refuse to boot rather
# than serve traffic with a security control that is silently ineffective.)


# Cycle 6: rate limiting is only as real as the cache behind it.
#
# DRF stores throttle counters in the default cache. With the LocMemCache
# fallback each gunicorn worker keeps its OWN counters, so a 10/min limit
# becomes 10/min *per worker* and the counters reset on every restart. The
# platform would report itself as rate limited while offering an attacker N
# times the intended budget - a security control that looks enabled and is not.
#
# Django cannot detect this: LocMemCache is a perfectly valid backend. So, in
# the same spirit as the secret-key guard below, production refuses to boot
# without a shared cache rather than silently degrading.
if not REDIS_URL:  # noqa: F405
    raise ImproperlyConfigured(  # noqa: F405
        "REDIS_URL must be set in production. Without a shared cache, login "
        "rate limiting degrades to per-worker counters and stops being a "
        "meaningful control against distributed brute-force attacks. Set "
        "REDIS_URL to the same Redis instance used by Celery."
    )

_PLACEHOLDER_SECRET_MARKERS = (
    "your-secret-key-here",
    "change-me",
    "changeme",
    "placeholder",
    "insecure",
    "django-insecure",
    "offline-sandbox-test-key",
)

_secret_key_value = str(SECRET_KEY)  # noqa: F405
_secret_key_lower = _secret_key_value.lower()

if any(marker in _secret_key_lower for marker in _PLACEHOLDER_SECRET_MARKERS):
    raise ImproperlyConfigured(  # noqa: F405
        "DJANGO_SECRET_KEY still contains a placeholder value. Generate a unique "
        "secret before deploying: "
        'python -c "from django.core.management.utils import get_random_secret_key; '
        'print(get_random_secret_key())"'
    )

if len(_secret_key_value) < 50:
    raise ImproperlyConfigured(  # noqa: F405
        "DJANGO_SECRET_KEY is too short for production "
        f"({len(_secret_key_value)} characters; at least 50 required)."
    )

# DEBUG must never be enabled in production, regardless of what the environment
# says. DEBUG=True exposes tracebacks containing settings and query values.
if DEBUG:
    raise ImproperlyConfigured("DEBUG must be False in production settings.")

# Object storage is mandatory in production. Local FileSystemStorage under
# MEDIA_ROOT is not web-safe if the reverse proxy ever aliases /media/.
USE_S3_STORAGE = env.bool("USE_S3_STORAGE", default=True)  # noqa: F405
if not USE_S3_STORAGE:
    raise ImproperlyConfigured("File storage must be S3/R2 in production")

_r2_missing = [
    name
    for name, value in (
        ("R2_ACCESS_KEY_ID", globals().get("AWS_ACCESS_KEY_ID", "")),
        ("R2_SECRET_ACCESS_KEY", globals().get("AWS_SECRET_ACCESS_KEY", "")),
        ("R2_BUCKET_NAME", globals().get("AWS_STORAGE_BUCKET_NAME", "")),
        ("R2_ACCOUNT_ID", globals().get("R2_ACCOUNT_ID", "")),
        ("R2_ENDPOINT_URL", globals().get("AWS_S3_ENDPOINT_URL", "")),
    )
    if not str(value).strip()
]
if _r2_missing:
    raise ImproperlyConfigured(
        "USE_S3_STORAGE=True requires non-empty Cloudflare R2 credentials. "
        "Missing or empty: " + ", ".join(_r2_missing) + ". "
        "Set them in Railway Variables."
    )

_r2_endpoint_value = str(globals().get("AWS_S3_ENDPOINT_URL", "")).lower()
_r2_account_value = str(globals().get("R2_ACCOUNT_ID", "")).lower()
if "placeholder" in _r2_endpoint_value or _r2_account_value in {
    "placeholder",
    "check",
    "changeme",
    "example",
    "your-account-id",
}:
    raise ImproperlyConfigured(
        "R2_ACCOUNT_ID / R2_ENDPOINT_URL is still a placeholder. "
        "Set the Cloudflare account id so Django talks to "
        "https://<accountid>.r2.cloudflarestorage.com."
    )

# Logging - reduce verbosity in production
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
LOGGING["loggers"]["django"]["level"] = "WARNING"  # noqa: F405
LOGGING["loggers"]["apps"]["level"] = "INFO"  # noqa: F405
