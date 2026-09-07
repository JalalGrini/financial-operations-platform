"""Rate limiting for the endpoints an unauthenticated caller can reach.

These limits are deliberately layered on top of the per-(email, IP) login
lockout in `apps.authentication.views`, because that lockout cannot see two
real attacks:

* **IP rotation against one account** - a fresh source address per guess means
  every lockout row is a first offence, so the lockout never engages.
  `LoginEmailRateThrottle` closes this by keying on the account instead.
* **Credential stuffing from one host** - a fresh account per guess means the
  same thing. `LoginIPRateThrottle` closes this by keying on the source.

Together the three keys (email+IP, email, IP) cover the attack surface: an
attacker must vary both dimensions at once to stay under every limit, which
costs them both a botnet and a very low per-account guess rate.

OPERATIONAL WARNING
-------------------
Every counter here lives in Django's default cache. With the in-process
LocMemCache each worker keeps its own counters, so a limit of N/min becomes
N/min *per worker* and the protection weakens in direct proportion to how far
you scale out. Point `REDIS_URL` at a shared cache in any real deployment - see
the CACHES block in `config/settings/base.py`.
"""

import hashlib

from rest_framework.throttling import SimpleRateThrottle

from apps.common.http import client_ip


class LoginIPRateThrottle(SimpleRateThrottle):
    """Cap login attempts from a single source address, across all accounts.

    This is the anti-credential-stuffing control: it does not care which account
    is being attempted, only how fast one host is attempting them.
    """

    scope = "login_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}


class LoginEmailRateThrottle(SimpleRateThrottle):
    """Cap login attempts against a single account, across all source addresses.

    This is the anti-botnet control, and it is the only layer that survives an
    attacker with an unlimited supply of IP addresses.
    """

    scope = "login_email"

    def get_cache_key(self, request, view):
        email = request.data.get("email") if hasattr(request, "data") else None
        if not isinstance(email, str) or not email.strip():
            # No account to key on (malformed request). Returning None skips
            # this throttle only; LoginIPRateThrottle still applies, so an
            # attacker cannot bypass rate limiting by omitting the field.
            return None

        # The address is hashed rather than stored raw. These keys can live in a
        # shared Redis instance that is often less protected than the database,
        # and a list of cache keys should not double as a list of user emails.
        # Normalised first so that Foo@x.com and foo@x.com share one bucket -
        # otherwise case variation alone would multiply the attacker's budget.
        digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": digest}


class DatabaseHealthRateThrottle(SimpleRateThrottle):
    """Cap anonymous hits on the database health endpoint.

    That endpoint executes a real query for any caller, so it is an
    unauthenticated database-load amplifier. It is throttled rather than
    authenticated on purpose: readiness probes are usually unauthenticated, and
    requiring credentials would break orchestrator health checking. A generous
    limit keeps probes working while removing the amplification.
    """

    scope = "health_db"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}
