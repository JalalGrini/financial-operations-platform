"""Copy Railway production variables into GitHub Actions secrets.

Prints only secret names that were set. Never prints values.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from urllib.parse import quote, urlsplit, urlunsplit

RAILWAY_PROJECT = "00650a80-e31e-47f9-b450-ef4c196d9b8d"
RAILWAY_SERVICE = "efop-backend"
RAILWAY_ENV = "production"

# GitHub-hosted runners cannot reach Railway private DNS. Public TCP proxy
# for production Postgres (Railway Networking → TCP Proxy).
RAILWAY_PG_TCP_HOST = "sakura.proxy.rlwy.net"
RAILWAY_PG_TCP_PORT = 48502

# GitHub secret name -> Railway variable name
MAPPING = {
    "DATABASE_URL": "DATABASE_URL",
    "REDIS_URL": "REDIS_URL",
    "DJANGO_SECRET_KEY": "DJANGO_SECRET_KEY",
    "AWS_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
    "AWS_S3_ENDPOINT_URL": "R2_ENDPOINT_URL",
    "R2_BUCKET_NAME": "R2_BUCKET_NAME",
    "R2_ACCOUNT_ID": "R2_ACCOUNT_ID",
    "DJANGO_ALLOWED_HOSTS": "DJANGO_ALLOWED_HOSTS",
}


def _bin(name: str) -> str:
    found = shutil.which(name) or shutil.which(f"{name}.cmd") or shutil.which(f"{name}.exe")
    if not found:
        raise SystemExit(f"{name} is not on PATH")
    return found


def public_database_url(url: str) -> str:
    """Rewrite railway.internal DATABASE_URL to the public TCP proxy."""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if "railway.internal" not in host and host != "postgres":
        return url
    hostname = RAILWAY_PG_TCP_HOST
    port = RAILWAY_PG_TCP_PORT
    user = quote(parsed.username or "", safe="")
    password = quote(parsed.password or "", safe="")
    auth = user
    if password:
        auth = f"{user}:{password}"
    netloc = f"{auth}@{hostname}:{port}" if auth else f"{hostname}:{port}"
    query = parsed.query
    if "sslmode=" not in query:
        query = f"{query}&sslmode=require" if query else "sslmode=require"
    return urlunsplit((parsed.scheme, netloc, parsed.path, query, parsed.fragment))


def railway_variables() -> dict[str, str]:
    raw = subprocess.check_output(
        [
            _bin("railway"),
            "variable",
            "list",
            "--json",
            "-p",
            RAILWAY_PROJECT,
            "-s",
            RAILWAY_SERVICE,
            "-e",
            RAILWAY_ENV,
        ],
        stderr=subprocess.DEVNULL,
    )
    payload = json.loads(raw)
    if isinstance(payload, dict):
        return {str(k): str(v) if v is not None else "" for k, v in payload.items()}
    raise SystemExit("Unexpected Railway variable JSON shape")


def set_github_secret(name: str, value: str) -> None:
    proc = subprocess.run(
        [_bin("gh"), "secret", "set", name],
        input=value.encode("utf-8"),
        capture_output=True,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        raise SystemExit(f"failed to set {name}: {err or proc.returncode}")


def main() -> int:
    variables = railway_variables()
    set_github_secret("RAILWAY_BACKEND_URL", "3rb-extreme.up.railway.app")
    print("set RAILWAY_BACKEND_URL")

    missing: list[str] = []
    for gh_name, railway_name in MAPPING.items():
        value = (variables.get(railway_name) or "").strip()
        if not value and gh_name == "AWS_S3_ENDPOINT_URL":
            account = (variables.get("R2_ACCOUNT_ID") or "").strip()
            if account:
                value = f"https://{account}.r2.cloudflarestorage.com"
        if not value:
            missing.append(f"{gh_name} <- {railway_name}")
            continue
        if gh_name == "DATABASE_URL":
            rewritten = public_database_url(value)
            if rewritten != value:
                print("rewrote DATABASE_URL host to public TCP proxy")
            value = rewritten
        set_github_secret(gh_name, value)
        print(f"set {gh_name}")

    if missing:
        print("missing: " + ", ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
