from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from apps.audit_log.models import AuditEvent, AuditResult

SENSITIVE_KEYS = {
    "password",
    "current_password",
    "new_password",
    "confirm_password",
    "token",
    "access",
    "refresh",
    "secret",
    "authorization",
    "cookie",
    "csrfmiddlewaretoken",
    "api_key",
}


def make_json_safe(obj: Any):
    """Coerce audit payloads so JSONField / json.dumps never see UUID or Decimal."""
    if isinstance(obj, dict):
        return {str(k): make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_json_safe(i) for i in obj]
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if hasattr(obj, "pk"):
        return str(obj.pk)
    return obj


def redact(value: Any):
    if isinstance(value, dict):
        return {
            str(k): ("[REDACTED]" if str(k).lower() in SENSITIVE_KEYS else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return make_json_safe(value)


def changes_between(before, after):
    before = redact(before or {})
    after = redact(after or {})
    keys = set(before) | set(after)
    return {
        k: {"before": before.get(k), "after": after.get(k)}
        for k in keys
        if before.get(k) != after.get(k)
    }


def role_for(user):
    if not user or not getattr(user, "is_authenticated", False):
        return ""
    if getattr(user, "is_superuser", False):
        return "Administrator"
    return ", ".join(user.groups.values_list("name", flat=True))


def request_metadata(request):
    if request is None:
        return {}
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = (forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")) or None
    return {
        "request_method": request.method,
        "request_path": request.path[:500],
        "ip_address": ip,
        "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
    }


def record_event(
    *,
    action,
    summary,
    actor=None,
    company=None,
    entity=None,
    entity_type="",
    entity_id="",
    entity_reference="",
    before=None,
    after=None,
    result=AuditResult.SUCCESS,
    reason="",
    request=None,
):
    if entity is not None:
        entity_type = entity_type or entity.__class__.__name__
        entity_id = entity_id or str(getattr(entity, "pk", "") or "")
        entity_reference = entity_reference or str(getattr(entity, "reference", "") or "")
        company = company or getattr(entity, "company", None)
    return AuditEvent.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        actor_email=getattr(actor, "email", "") or "",
        actor_role=role_for(actor),
        company=company,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_reference=str(entity_reference),
        summary=summary[:500],
        before=make_json_safe(redact(before or {})),
        after=make_json_safe(redact(after or {})),
        changes=make_json_safe(changes_between(before, after)),
        result=result,
        reason=reason,
        **request_metadata(request),
    )
