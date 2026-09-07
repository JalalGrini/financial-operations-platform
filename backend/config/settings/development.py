# config/settings/development.py
"""
Development settings for Financial Operations Platform.
"""
import sys

from .base import *  # noqa: F403,F401

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ["*"]

# CORS - allow all origins in development for convenience
CORS_ALLOW_ALL_ORIGINS = True

# Email backend for development
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Disable HTTPS requirements in development
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Test database selection.
#
# THIS PLATFORM RUNS ON POSTGRESQL, and that is now true everywhere by default:
# production, development, the test suite and CI all use the PostgreSQL instance
# configured in base.py from the POSTGRES_* environment variables. Running
# `pytest` with no flags runs against PostgreSQL.
#
# SQLite remains reachable behind exactly one explicit opt-in:
#
#     USE_SQLITE_FOR_TESTS=True pytest
#
# That escape hatch exists for one reason: an offline build environment where no
# PostgreSQL daemon can be installed. It is NOT a supported way to validate this
# platform. A green SQLite run proves little about production, because SQLite is
# permissive exactly where PostgreSQL is strict: it ignores max_length, treats
# select_for_update() as a no-op, and cannot execute the JSONField __contains
# queries this codebase relies on.
#
# Treat a SQLite run as a smoke test. The release gate is a PostgreSQL run.
USE_SQLITE_FOR_TESTS = env.bool("USE_SQLITE_FOR_TESTS", default=False)  # noqa: F405

if ("test" in sys.argv or "pytest" in sys.modules) and USE_SQLITE_FOR_TESTS:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

# Loosen the LOGIN throttles for local work so a developer cannot lock
# themselves out while iterating on the sign-in screen.
#
# This MERGES into the base rates instead of replacing them. It used to assign a
# fresh two-key dict, which silently dropped the third key, "health_db" - the
# scope DatabaseHealthRateThrottle declares and config/views.py attaches to
# DatabaseHealthView. A throttle whose scope has no configured rate raises
# ImproperlyConfigured from get_rate(), so GET /api/v1/health/database/ answered
# **500 in development**, and the readiness probe reported the service as down.
# base.py's own comment already said all three keys are required.
#
# Anything added to the base rates from now on survives this override by default,
# which is the behaviour a developer overriding two keys expects.
#
# `manage.py test` also loads this module (manage.py defaults to development).
# Keep the shipped limits during the test run so
# apps/authentication/tests/test_login_throttling.py can actually hit 429.
if "test" not in sys.argv and "pytest" not in sys.modules:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "login_ip": "100/minute",
        "login_email": "100/minute",
    }

