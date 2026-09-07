"""
WSGI config for config project.
"""

import os

from django.core.wsgi import get_wsgi_application

# SECURITY (audit finding M-6): this is a *server* entrypoint, so it must fail
# safe. Defaulting to the development module meant that a deployment which
# forgot to set DJANGO_SETTINGS_MODULE would silently boot with DEBUG=True,
# ALLOWED_HOSTS=["*"] and CORS_ALLOW_ALL_ORIGINS=True - leaking tracebacks with
# environment data and accepting requests for any Host header.
#
# Production is now the default for WSGI/ASGI. Local development goes through
# manage.py (which still defaults to config.settings.development), so the
# convenient path is unchanged while the risky path is safe by default.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_wsgi_application()
