"""Pure safety policy shared by the destructive development reset command."""

from dataclasses import dataclass
from pathlib import Path

RESET_PHRASE = "RESET-EFOP-LOCAL-DATA"
LOCAL_HOSTS = {"", "localhost", "127.0.0.1", "::1", "postgres", "db"}
SAFE_EXACT_DATABASE_NAMES = {
    "financial_ops",  # repository docker-compose local default
    "financial_ops_dev",
    "efop",
    "efop_dev",
    "efop_local",
}
FORBIDDEN_MARKERS = {"prod", "production", "stage", "staging", "live"}


@dataclass(frozen=True)
class ResetTarget:
    debug: bool
    settings_module: str
    engine: str
    name: str
    host: str
    base_dir: str = ""
    allow_destructive_reset: bool = False


class UnsafeResetError(ValueError):
    pass


def assert_reset_allowed(*, target: ResetTarget, confirmation: str, expected_database: str) -> None:
    """Raise unless every independent destructive-operation guard passes."""
    errors: list[str] = []
    module = (target.settings_module or "").lower()
    name = str(target.name or "").strip()
    name_lower = name.lower()
    host = str(target.host or "").strip().lower()
    engine = str(target.engine or "").lower()

    if not target.allow_destructive_reset:
        errors.append("EFOP_ALLOW_LOCAL_RESET must exactly equal 1")
    if confirmation != RESET_PHRASE:
        errors.append(f"confirmation must exactly equal {RESET_PHRASE}")
    if not expected_database or expected_database != name:
        errors.append("--expected-database must exactly match the configured database name")
    if not target.debug:
        errors.append("DEBUG must be True")
    if not any(token in module for token in ("development", "test", "qa")):
        errors.append("DJANGO_SETTINGS_MODULE must be an explicit development, test, or qa module")
    if any(marker in module for marker in FORBIDDEN_MARKERS):
        errors.append("production/staging settings are forbidden")
    if any(marker in name_lower for marker in FORBIDDEN_MARKERS):
        errors.append("database name contains a production/staging marker")

    if "sqlite" in engine:
        if name == ":memory:":
            pass
        else:
            db_path = Path(name).resolve()
            base = Path(target.base_dir).resolve() if target.base_dir else None
            if not base or base not in db_path.parents:
                errors.append("SQLite database must live inside the backend project")
            if not any(token in db_path.name.lower() for token in ("dev", "test", "qa", "local")):
                errors.append("SQLite filename must contain dev, test, qa, or local")
    elif "postgresql" in engine:
        if host not in LOCAL_HOSTS:
            errors.append("PostgreSQL host must be local/docker-local")
        safe_name = any(token in name_lower for token in ("dev", "test", "qa"))
        if not safe_name:
            errors.append("PostgreSQL database name must contain dev, test, or qa")
    else:
        errors.append("only local PostgreSQL or a local development SQLite database is supported")

    if errors:
        raise UnsafeResetError("Reset refused: " + "; ".join(errors) + ".")
