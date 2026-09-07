"""Deterministic settings for pytest.

The application database is never used as the test database. PostgreSQL tests
run in a dedicated, test-prefixed database that pytest-django recreates before
the suite, so stale migration state cannot leave core tables such as
``accounts_user`` missing. SQLite remains an explicit smoke-only opt-in through
USE_SQLITE_FOR_TESTS=True in development.py.
"""

from django.core.exceptions import ImproperlyConfigured

from .development import *  # noqa: F401,F403

DEBUG = False
CONN_MAX_AGE = 0
DATABASES["default"]["CONN_MAX_AGE"] = 0  # noqa: F405

if DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql":  # noqa: F405
    source_name = str(DATABASES["default"]["NAME"])  # noqa: F405
    default_test_name = f"test_{source_name}_efop_33_1"
    test_name = env("POSTGRES_TEST_DB", default=default_test_name)  # noqa: F405
    if not test_name.startswith("test_"):
        raise ImproperlyConfigured("POSTGRES_TEST_DB must start with 'test_'.")
    if test_name == source_name:
        raise ImproperlyConfigured("The test database must not be the application database.")
    DATABASES["default"]["TEST"] = {"NAME": test_name, "MIRROR": None}  # noqa: F405

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "efop-release-33-1-tests",
    }
}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Restore the real throttle rates for the suite.
#
# development.py deliberately loosens the login throttles to 100/minute so a
# developer cannot lock themselves out. test.py inherits development, so the
# suite inherited that too - and apps/authentication/tests/test_login_throttling.py
# drives exactly 40 requests to prove the two attacks it documents are blocked.
# At 100/minute, 40 requests never reach the limit, so both attack tests failed
# while the control they cover was in fact configured correctly in base.py.
#
# The result was worse than a red test: the security control was effectively
# unverified, because the only tests that exercise it could never pass.
# Pinning the rates here keeps the developer convenience in runserver and tests
# the shipped limits.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],  # noqa: F405
    "login_ip": "20/min",
    "login_email": "10/min",
}
