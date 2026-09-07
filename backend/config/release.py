"""Safe public release identity shared by health/version endpoints.

The canonical values live in the repository-root RELEASE.json. Environment
variables may override them in an immutable deployment image, but no secret or
host-specific value is ever exposed by :func:`public_release_data`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RELEASE_FILE = PROJECT_ROOT / "RELEASE.json"

_DEFAULTS: dict[str, str] = {
    "release_id": "EFOP-DEVELOPMENT",
    "source_revision": "unknown",
    "built_at": "unknown",
    "schema_revision": "unknown",
}

# RELEASE.json is written by the release packaging step and names these fields
# differently from the keys the version endpoints expose. Without the aliases
# below, every lookup missed and the endpoints silently reported the
# "EFOP-DEVELOPMENT"/"unknown" defaults for a fully tagged release - a
# diagnostics endpoint confidently returning the wrong identity, which is worse
# than returning nothing. The endpoint-facing key stays authoritative when the
# manifest happens to carry it, so an image that writes `release_id` directly
# keeps working.
_MANIFEST_ALIASES: dict[str, tuple[str, ...]] = {
    "release_id": ("release_id", "release"),
    "source_revision": ("source_revision", "revision", "commit"),
    "built_at": ("built_at", "date"),
    "schema_revision": ("schema_revision", "version"),
}


def _read_release_file() -> dict[str, str]:
    try:
        raw: Any = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(_DEFAULTS)
    if not isinstance(raw, dict):
        return dict(_DEFAULTS)
    resolved: dict[str, str] = {}
    for key, default in _DEFAULTS.items():
        value = next(
            (raw[alias] for alias in _MANIFEST_ALIASES[key] if raw.get(alias)),
            None,
        )
        resolved[key] = str(value) if value else default
    return resolved


RELEASE_METADATA = _read_release_file()


def public_release_data() -> dict[str, str]:
    """Return safe, credential-free release information for diagnostics."""
    return {
        "release_id": os.getenv("EFOP_RELEASE_ID", RELEASE_METADATA["release_id"]),
        "source_revision": os.getenv("EFOP_SOURCE_REVISION", RELEASE_METADATA["source_revision"]),
        "built_at": os.getenv("EFOP_BUILT_AT", RELEASE_METADATA["built_at"]),
        "schema_revision": os.getenv("EFOP_SCHEMA_REVISION", RELEASE_METADATA["schema_revision"]),
        "environment": os.getenv("EFOP_ENVIRONMENT", "development"),
    }
