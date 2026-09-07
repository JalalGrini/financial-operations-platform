"""Hostname helpers for production ALLOWED_HOSTS.

Kept import-safe (no Django settings) so tests can cover Railway healthcheck
host merging without booting production.py.
"""


def normalize_allowed_host(raw: str) -> str:
    host = str(raw).strip()
    if not host:
        return ""
    lower = host.lower()
    if lower.startswith("https://"):
        host = host[8:]
    elif lower.startswith("http://"):
        host = host[7:]
    host = host.split("/")[0].strip()
    if host.startswith("[") and "]" in host:
        return host
    if ":" in host and host.count(":") == 1:
        host = host.split(":", 1)[0]
    return host.strip()


def production_allowed_hosts(configured, environ) -> list:
    """Merge operator hosts with Railway-injected domains and the probe host.

    Railway deploy healthchecks send Host: healthcheck.railway.app. Django
    answers 400 DisallowedHost without it, and Railway then fails the replica.
    """
    hosts: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        host = normalize_allowed_host(value)
        if not host:
            return
        key = host.lower()
        if key not in seen:
            seen.add(key)
            hosts.append(host)

    for item in configured:
        add(item)
    for env_name in (
        "RAILWAY_PUBLIC_DOMAIN",
        "RAILWAY_PRIVATE_DOMAIN",
        "RAILWAY_STATIC_URL",
    ):
        add(environ.get(env_name, "") or "")
    add("healthcheck.railway.app")
    return hosts
