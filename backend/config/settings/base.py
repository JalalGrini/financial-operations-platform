# config/settings/base.py
"""
Base Django settings for Financial Operations Platform.
"""
import os
from pathlib import Path

import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Environment variables
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
)

# Read .env file if it exists
environ.Env.read_env(BASE_DIR / ".env")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("DJANGO_SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
# Schema key is DEBUG, not DJANGO_DEBUG — pass an explicit default so a
# missing Railway variable does not raise ImproperlyConfigured at import.
# Production settings force DEBUG = False after this import.
DEBUG = env.bool("DJANGO_DEBUG", default=False)

# BUGFIX (audit finding M-7): this previously read ``env("DJANGO_ALLOWED_HOSTS")``.
# The list cast declared in environ.Env(...) above is keyed on "ALLOWED_HOSTS",
# not "DJANGO_ALLOWED_HOSTS", so the cast never applied and this returned a raw
# string. Django requires a list/tuple and raises
# "The ALLOWED_HOSTS setting must be a list or a tuple." at startup, which meant
# production settings could never boot. Development was unaffected because it
# overrides ALLOWED_HOSTS = ["*"], which is why this was never noticed.
# env.list() casts explicitly and does not depend on the schema key matching.
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

# Application definition
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    # python manage.py migrate must be run after adding token_blacklist
    # (creates token_blacklist_outstandingtoken / blacklistedtoken tables).
    "rest_framework_simplejwt.token_blacklist",
    "storages",
]

LOCAL_APPS = [
    "core",
    "apps.common",
    "apps.accounts",
    "apps.companies",
    "apps.parties",
    "apps.configuration",
    "apps.authentication",
    "apps.personnel",
    "apps.financial_records",
    "apps.extensibility",
    "apps.treasury",
    "apps.reports",
    "apps.dashboard",
    "apps.audit_log",
    "apps.collaboration",
    "apps.deadlines",
    "apps.inventory",
    "apps.transfers",
    "apps.help_tickets",
    "apps.leaves",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "middleware.rate_limit.RateLimitMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "apps.audit_log.middleware.AuditTrailMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.security_headers.SecurityHeadersMiddleware",
    "apps.common.request_limits.MaxBodySizeMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases
#
# Railway's Postgres plugin injects DATABASE_URL (postgresql://...). When that
# is set, it wins. Local docker-compose and existing .env files keep using
# POSTGRES_*. Do not require both.
_database_url = env("DATABASE_URL", default="").strip()
if _database_url:
    try:
        _parsed_db = environ.Env.db_url_config(_database_url)
    except Exception as exc:
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured(
            "DATABASE_URL is set but could not be parsed. Expected "
            "postgresql://USER:PASSWORD@HOST:PORT/NAME "
            f"(parser error: {exc})."
        ) from exc
    DATABASES = {"default": _parsed_db}
    DATABASES["default"]["ENGINE"] = "django.db.backends.postgresql"
    DATABASES["default"]["CONN_MAX_AGE"] = env.int("POSTGRES_CONN_MAX_AGE", default=60)
    if not isinstance(DATABASES["default"].get("OPTIONS"), dict):
        DATABASES["default"]["OPTIONS"] = {}
    DATABASES["default"]["OPTIONS"].setdefault("connect_timeout", 10)
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER"),
            "PASSWORD": env("POSTGRES_PASSWORD"),
            "HOST": env("POSTGRES_HOST"),
            "PORT": env("POSTGRES_PORT"),
            "CONN_MAX_AGE": env.int("POSTGRES_CONN_MAX_AGE", default=60),
            "OPTIONS": {
                "connect_timeout": 10,
            },
        }
    }

# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Casablanca"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Hard cap before files reach R2. Authenticated uploads stay at 10 MB.
# Public ticket attachments are capped separately at 2 MB each / 4 MB total.
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 8

USE_CLOUDFLARE_R2 = env.bool("USE_CLOUDFLARE_R2", default=False)
_django_environment = os.environ.get("DJANGO_ENVIRONMENT", "production")
_s3_default = True if _django_environment == "production" else USE_CLOUDFLARE_R2
USE_S3_STORAGE = env.bool("USE_S3_STORAGE", default=_s3_default)
if USE_S3_STORAGE:
    AWS_ACCESS_KEY_ID = env("R2_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("R2_SECRET_ACCESS_KEY")
    # Temporary R2 S3 credentials include a session token. Permanent dashboard
    # tokens do not; leave the env var unset in that case.
    _aws_session_token = env("AWS_SESSION_TOKEN", default="").strip()
    if _aws_session_token:
        AWS_SESSION_TOKEN = _aws_session_token
    AWS_STORAGE_BUCKET_NAME = env("R2_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("R2_REGION", default="auto")
    R2_ACCOUNT_ID = env("R2_ACCOUNT_ID", default="")
    _r2_endpoint = env("R2_ENDPOINT_URL", default="").strip()
    if not _r2_endpoint:
        if not str(R2_ACCOUNT_ID).strip():
            from django.core.exceptions import ImproperlyConfigured

            raise ImproperlyConfigured(
                "USE_S3_STORAGE=True requires R2_ACCOUNT_ID or R2_ENDPOINT_URL "
                "so AWS_S3_ENDPOINT_URL can be set for Cloudflare R2."
            )
        _r2_endpoint = f"https://{str(R2_ACCOUNT_ID).strip()}.r2.cloudflarestorage.com"
    AWS_S3_ENDPOINT_URL = _r2_endpoint
    AWS_DEFAULT_ACL = None
    AWS_S3_FILE_OVERWRITE = True
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    AWS_S3_ADDRESSING_STYLE = "path"
    AWS_LOCATION = env("AWS_LOCATION", default="private")
    STORAGES = {
        "default": {"BACKEND": "config.storage_backends.PrivateMediaStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

_settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "")
_is_dev_or_test = "development" in _settings_module or "test" in _settings_module
if _django_environment == "production" and not USE_S3_STORAGE and not _is_dev_or_test:
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured("File storage must be S3/R2 in production")

# Default primary key field type
# https://docs.djangoproject.com/en/6.0/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom User Model
AUTH_USER_MODEL = "accounts.User"

# JWT Authentication
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_TOKEN_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_TOKEN_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": env.bool("JWT_ROTATE_REFRESH_TOKENS", default=True),
    "BLACKLIST_AFTER_ROTATION": env.bool("JWT_BLACKLIST_AFTER_ROTATION", default=True),
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "VERIFYING_KEY": None,
    "AUDIENCE": None,
    "ISSUER": None,
    "JWK_URL": None,
    "LEEWAY": 0,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXPIRES": timedelta(
        days=env.int("JWT_SLIDING_TOKEN_REFRESH_EXPIRES_DAYS", default=1)
    ),
    "SLIDING_TOKEN_LIFETIME": timedelta(
        minutes=env.int("JWT_SLIDING_TOKEN_LIFETIME_MINUTES", default=5)
    ),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(
        days=env.int("JWT_SLIDING_TOKEN_REFRESH_LIFETIME_DAYS", default=1)
    ),
}

# JWT Cookie settings
# M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
# Unification"): these settings are the single source of truth for
# cookie identity/attributes, consumed exclusively through
# `apps.authentication.cookies` — no view or middleware should read
# these directly or hard-code a cookie name/attribute.
JWT_AUTH_COOKIE = env("JWT_AUTH_COOKIE", default="access_token")
JWT_AUTH_REFRESH_COOKIE = env("JWT_AUTH_REFRESH_COOKIE", default="refresh_token")
JWT_AUTH_COOKIE_SECURE = env.bool("JWT_AUTH_COOKIE_SECURE", default=False)
JWT_AUTH_COOKIE_HTTP_ONLY = True
JWT_AUTH_COOKIE_SAMESITE = env("JWT_AUTH_COOKIE_SAMESITE", default="Lax")
JWT_AUTH_COOKIE_PATH = env("JWT_AUTH_COOKIE_PATH", default="/")
# A narrower path for the refresh cookie specifically: the refresh
# token only ever needs to be sent to the refresh/logout/change-password
# endpoints, so it is scoped to the shared `/api/v1/auth/` prefix rather
# than the whole site. This remains compatible with all three of those
# endpoints, all of which live under this same prefix.
JWT_AUTH_REFRESH_COOKIE_PATH = env("JWT_AUTH_REFRESH_COOKIE_PATH", default="/api/v1/auth/")
# Host-only cookie by default (no `Domain` attribute at all) rather than
# a literal `"localhost"` string: an explicit `Domain=localhost` makes
# the cookie a *domain* cookie matching any port/subdomain of
# `localhost`, which is both unnecessary for a same-origin dev setup and
# not the same thing as the host-only cookie a real deployment needs.
# `None` here means Django's `set_cookie()`/`delete_cookie()` omit the
# `Domain` attribute entirely, which is the correct default for both
# local development and production (where the real value, if any, is
# provided via the `JWT_AUTH_COOKIE_DOMAIN` environment variable).
JWT_AUTH_COOKIE_DOMAIN = env("JWT_AUTH_COOKIE_DOMAIN", default=None)

# Django REST Framework
# M1-A: `CookieJWTAuthentication` (SimpleJWT read from an HttpOnly
# cookie, with explicit CSRF enforcement for unsafe methods) is the
# sole default API authentication path. `SessionAuthentication` is
# removed — no view in this project relies on Django session-cookie
# auth, and retaining it in parallel with a JWT-cookie authenticator
# would reintroduce the "two competing auth paths" problem M1-A exists
# to eliminate. The bearer-header `JWTAuthentication` class is likewise
# not part of the default browser path (see Engineering Log requirement
# "Do not retain bearer-header JWT as a parallel browser path").
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.authentication.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardResultsPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.exceptions.custom_exception_handler",
}

# CORS — explicit, environment-driven allow-list; credentialed requests
# require an explicit origin list (never `*`) per the CORS spec, which
# `CORS_ALLOW_CREDENTIALS = True` already required before M1-A.
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

# CSRF — explicit cookie/header names (Django's own defaults, made
# explicit here per the Engineering Log requirement to "keep credentialed
# CORS and trusted-origin settings explicit and environment-driven").
# The CSRF cookie is deliberately NOT HttpOnly: the frontend must be able
# to read it via JavaScript and echo it back in the `X-CSRFToken` header
# (`CSRF_HEADER_NAME` below) on unsafe requests. This is unrelated to,
# and does not weaken, the JWT cookies above, which remain HttpOnly.
CSRF_COOKIE_NAME = env("CSRF_COOKIE_NAME", default="csrftoken")
CSRF_HEADER_NAME = env("CSRF_HEADER_NAME", default="HTTP_X_CSRFTOKEN")
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE", default="Lax")
CSRF_COOKIE_PATH = env("CSRF_COOKIE_PATH", default="/")
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

# drf-spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": "Financial Operations Platform API",
    "DESCRIPTION": "API for the Enterprise Financial Operations Platform",
    "VERSION": "v1",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1/",
    "SERVERS": [
        {"url": "http://localhost:8000", "description": "Development Server"},
    ],
}

# Celery (configured but workers not started in this milestone)
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Casablanca"

# Email (SMTP) — replace with real values at deployment
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="3RB Extreme <noreply@efop.local>")
EMAIL_API_URL = env("EMAIL_API_URL", default="")
EMAIL_API_KEY = env("EMAIL_API_KEY", default="")

# Twilio (SMS + WhatsApp) — placeholders until deployment
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN", default="")
TWILIO_PHONE_NUMBER = env("TWILIO_PHONE_NUMBER", default="")
TWILIO_WHATSAPP_NUMBER = env(
    "TWILIO_WHATSAPP_NUMBER", default="whatsapp:+14155238886"
)

# Logging foundation
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}


# ---------------------------------------------------------------------------
# Login brute-force protection (cycle 3, finding H-8)
# ---------------------------------------------------------------------------
# Before cycle 3 the login endpoint had no rate limiting and no lockout: the
# FailedLoginAttempt model and its progressive-lockout methods existed and were
# migrated, but nothing in the codebase ever wrote to them, so the table was
# permanently empty. LoginView now records failures per (email, IP) and refuses
# a locked identity even when the password is correct.
#
# Number of consecutive failed attempts allowed before the identity is locked.
# Read by FailedLoginAttempt.increment_attempt().
LOGIN_MAX_ATTEMPTS = env.int("LOGIN_MAX_ATTEMPTS", default=5)

# Whether to believe the X-Forwarded-For header when identifying the client IP.
# Defaults to False on purpose: the header is attacker-controlled, so trusting it
# unconditionally would let an attacker send a new value per request and reset
# their own lockout counter every time. Enable this ONLY when the deployment sits
# behind a proxy/load balancer that overwrites the header (e.g. Railway), because
# only then can its value be trusted.
TRUST_X_FORWARDED_FOR = env.bool("TRUST_X_FORWARDED_FOR", default=False)

# ---------------------------------------------------------------------------
# Caching (Cycle 6)
# ---------------------------------------------------------------------------
# Added because rate limiting stores its counters here, so the cache stopped
# being an optional performance nicety and became a security dependency.
#
# The LocMemCache default is per-process. Under gunicorn with N workers a limit
# of 10/min is really 10/min per worker, i.e. 10*N/min overall, and the counters
# vanish on every restart. That is acceptable for local development and tests
# and NOT acceptable in production: set REDIS_URL so every worker shares one
# counter. `redis` is already a pinned dependency (used by Celery) and Django
# ships the backend, so this needs no new package.
REDIS_URL = env("REDIS_URL", default="")

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "efop-local-cache",
        }
    }

# ---------------------------------------------------------------------------
# Rate limiting (Cycle 6)
# ---------------------------------------------------------------------------
# No DEFAULT_THROTTLE_CLASSES is set on purpose. A global throttle would apply
# to every authenticated endpoint in the platform at once, and a finance tool
# has legitimate bulk workflows (payroll runs, report exports) that would start
# failing with no warning. Throttles are attached explicitly to the endpoints
# that need them, so the blast radius of this change is exactly those views.
#
# These rates are the layer the per-(email, IP) lockout cannot provide. See
# apps/common/throttling.py for why all three keys are required.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    # Per source address, across all accounts. Sized well above any human
    # (typos, several colleagues behind one office NAT) but far below the rate
    # a stuffing script needs to be worth running.
    "login_ip": env("THROTTLE_LOGIN_IP", default="20/min"),
    # Per account, across all source addresses. This is the botnet-resistant
    # limit, so it is the tightest of the three.
    "login_email": env("THROTTLE_LOGIN_EMAIL", default="10/min"),
    # Per source address. Generous, because Kubernetes-style readiness probes
    # poll frequently and must never be throttled into a false 'unhealthy'.
    "health_db": env("THROTTLE_HEALTH_DB", default="30/min"),
    # Anonymous public intake (help tickets / client tickets).
    "anon": env("THROTTLE_ANON", default="10/hour"),
    "password_reset": env("THROTTLE_PASSWORD_RESET", default="5/min"),
}
