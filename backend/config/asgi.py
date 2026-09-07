"""
ASGI config for config project.
"""

import os

from django.core.asgi import get_asgi_application

# SECURITY (audit finding M-6): see the note in config/wsgi.py. Server
# entrypoints default to production so that a missing DJANGO_SETTINGS_MODULE
# cannot silently enable DEBUG and wildcard hosts/CORS in a deployed
# environment. manage.py still defaults to development for local work.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_asgi_application()
