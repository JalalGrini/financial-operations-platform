"""Request helpers shared across apps.

This module exists so that every security control keys on the SAME notion of
'who is calling'. The login lockout and the rate limiters must agree: if they
resolved the client address differently, an attacker could satisfy one and evade
the other.
"""

from django.conf import settings


def client_ip(request) -> str:
    """Resolve the client IP used to key security counters.

    `X-Forwarded-For` is deliberately NOT trusted by default. That header is
    attacker-controlled: if it were trusted unconditionally, an attacker could
    send a different value on every request and give themselves a fresh counter
    each time, which would reduce both the lockout and the rate limits to
    decoration. It is honoured only when the deployment explicitly declares that
    it sits behind a proxy that overwrites the header
    (`TRUST_X_FORWARDED_FOR = True`), which is the only configuration in which
    the value can be believed.

    Consequence when deploying behind a load balancer without setting that flag:
    every request appears to originate from the proxy, so all callers share one
    per-IP bucket. The email-keyed limit still works, but the IP-keyed limit
    becomes global and could throttle legitimate users. Set the flag in any
    proxied deployment.
    """
    if getattr(settings, "TRUST_X_FORWARDED_FOR", False):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "0.0.0.0"
