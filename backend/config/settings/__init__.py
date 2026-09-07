# config/settings/__init__.py
# Determine environment and load appropriate settings
import os

from .base import *  # noqa: F403,F401

ENVIRONMENT = os.environ.get("DJANGO_ENVIRONMENT", "production")

if ENVIRONMENT == "production":
    from .production import *  # noqa: F403,F401
else:
    from .development import *  # noqa: F403,F401
