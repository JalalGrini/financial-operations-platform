# apps/audit_log/describe.py
"""Turn an HTTP request/response pair into a sentence a person can read.

WHY THIS EXISTS
---------------
`AuditTrailMiddleware` used to record every write as:

    action  = "create_or_action"
    summary = "POST /api/v1/transfers/cash-transfers/ returned 500"
    reason  = ""            <- always empty

So the log could not answer the two questions actually asked of it: what did
someone do, and if it did not work, why. 137 of the ~238 events in the QA
database shared the single action value "create_or_action", which lumps
"created a transfer" together with "confirmed a transfer" and "signed in".

This module derives:
  * a precise action ("create", "confirm", "archive", "sign in", ...)
  * a human label for the thing acted on, from the view's MODEL verbose_name
  * the entity reference, read back out of the response on success
  * the REASON, read out of the error body on a denial or failure
  * an English sentence for `summary`

The action and label come from Django's resolved route (`resolver_match`)
rather than from slicing the URL string. Path slicing cannot tell the resource
`cash-transfers` in `/transfers/cash-transfers/` apart from the collection
action `export` in `/personnel/salaries/export/`; the resolver already knows,
because the router named those routes `cash-transfer-list` and
`salary-export`.

Nothing here may raise: the caller wraps it, and an audit trail that can break
a request is worse than one that is terse.
"""

from __future__ import annotations

import re

from apps.audit_log.models import AuditResult
from apps.audit_log.services import SENSITIVE_KEYS

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$")

# action -> (base form, past form). The base form follows "was not allowed to"
# and "could not"; the past form follows the actor's name.
ACTION_PHRASES = {
    "create": ("create", "created"),
    "update": ("update", "updated"),
    "delete": ("delete", "deleted"),
    "archive": ("archive", "archived"),
    "restore": ("restore", "restored"),
    "confirm": ("confirm", "confirmed"),
    "revert_to_draft": ("revert to draft", "reverted to draft"),
    "complete": ("complete", "completed"),
    "reopen": ("reopen", "reopened"),
    "approve": ("approve", "approved"),
    "submit-for-review": ("submit for review", "submitted for review"),
    "regenerate": ("regenerate", "regenerated"),
    "upload-ready": ("upload a finished file for", "uploaded a finished file for"),
    "calculate": ("calculate", "calculated"),
    "recalculate": ("recalculate", "recalculated"),
    "post_to_ledger": ("post to the ledger", "posted to the ledger"),
    "post": ("post", "posted"),
    "cancel": ("cancel", "cancelled"),
    "export": ("export", "exported"),
    "preview": ("preview", "previewed"),
    "read": ("mark as read", "marked as read"),
    "resolve": ("resolve", "resolved"),
    "reconcile": ("reconcile", "reconciled"),
    # Account/session actions describe themselves; they have no target entity.
    "login": ("sign in", "signed in"),
    "logout": ("sign out", "signed out"),
    "refresh": ("refresh the session", "refreshed the session"),
    "change-password": ("change the password", "changed the password"),
}

# Actions where naming a target would read as nonsense ("signed in on login").
SELF_ACTIONS = {"login", "logout", "refresh", "change-password"}

# Keys worth reading back off a successful response to identify the record.
REFERENCE_KEYS = ("reference", "code", "number")


def _segments(path: str) -> list[str]:
    """Path pieces after /api/v1/, empty strings dropped."""
    trimmed = path.split("/api/v1/", 1)[-1]
    return [piece for piece in trimmed.split("/") if piece]


def _looks_like_id(segment: str) -> bool:
    if UUID_RE.match(segment):
        return True
    return segment.isdigit()


def resolve_action(request) -> str:
    """A specific verb for what this request did.

    POST is the only method that can carry a custom action name, so it is the
    only one that reads a name off the URL. Treating PUT on
    `/accounts/me/preferences/` as an action called "preferences" would just
    move the vagueness somewhere new; it is an update of preferences.
    """
    method = (request.method or "").upper()
    if method in {"PUT", "PATCH"}:
        return "update"
    if method == "DELETE":
        return "delete"
    if method != "POST":
        return method.lower()

    match = getattr(request, "resolver_match", None)
    url_name = (getattr(match, "url_name", "") or "") if match else ""
    if url_name.endswith("-list"):
        return "create"

    segments = _segments(request.path)
    last = segments[-1] if segments else ""
    if not last or _looks_like_id(last):
        # POST straight at a detail route: nothing nameable in the URL.
        return "create"
    return last


def _model_from_view(request):
    match = getattr(request, "resolver_match", None)
    func = getattr(match, "func", None) if match else None
    view = getattr(func, "cls", None) or getattr(func, "view_class", None)
    if view is None:
        return None
    queryset = getattr(view, "queryset", None)
    model = getattr(queryset, "model", None)
    if model is not None:
        return model
    serializer = getattr(view, "serializer_class", None)
    meta = getattr(serializer, "Meta", None)
    return getattr(meta, "model", None)


def resolve_entity(request, action: str):
    """(entity_type, label) for the thing acted on.

    `entity_type` stays machine-filterable; `label` is what goes in a sentence.
    The model's own verbose_name is preferred because it is already singular and
    already written for people ("cash transfer", not "cash-transfers").
    """
    model = _model_from_view(request)
    if model is not None:
        try:
            return model.__name__, str(model._meta.verbose_name)
        except Exception:
            return model.__name__, model.__name__

    # No model behind this route (plain APIView, or a report/export endpoint).
    segments = [s for s in _segments(request.path) if not _looks_like_id(s)]
    if segments and segments[-1] == action:
        segments = segments[:-1]
    slug = segments[-1] if segments else "api"
    return slug, slug.replace("-", " ").replace("_", " ")


def _response_payload(response):
    """The parsed response body, or None when there is not one to read.

    Streaming responses (the CSV exports) must never be touched: reading
    `.content` on them raises, and consuming the iterator would deliver an
    empty file to the user.
    """
    if getattr(response, "streaming", False):
        return None
    data = getattr(response, "data", None)
    if data is not None:
        return data
    return None


def extract_reference(response) -> str:
    """Identify the affected record from a successful response body."""
    payload = _response_payload(response)
    if not isinstance(payload, dict):
        return ""
    for key in REFERENCE_KEYS:
        value = payload.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value)[:100]
    return ""


def _flatten_errors(payload, depth=0):
    """Collect human-facing error strings out of a DRF error body."""
    if depth > 4:
        return []
    if isinstance(payload, str):
        return [payload]
    if isinstance(payload, (list, tuple)):
        collected = []
        for item in payload:
            collected.extend(_flatten_errors(item, depth + 1))
        return collected
    if isinstance(payload, dict):
        collected = []
        for key, value in payload.items():
            key_text = str(key)
            if key_text.lower() in SENSITIVE_KEYS:
                # The message may quote the rejected value back.
                collected.append(f"{key_text}: [REDACTED]")
                continue
            if key_text in {"success", "errors"} and isinstance(value, (dict, list)):
                collected.extend(_flatten_errors(value, depth + 1))
                continue
            messages = _flatten_errors(value, depth + 1)
            if not messages:
                continue
            if key_text in {"detail", "message", "non_field_errors"}:
                collected.extend(messages)
            else:
                collected.append(f"{key_text}: {'; '.join(messages)}")
        return collected
    return []


def extract_reason(response, status: int) -> str:
    """Why the request did not succeed, in the server's own words."""
    payload = _response_payload(response)

    if isinstance(payload, dict):
        # This project wraps errors as
        #   {"success": false, "message": "An error occurred.", "errors": {...}}
        # and repeats the field errors at the top level. `message` is a fixed
        # generic string, so including it unconditionally prefixed every reason
        # with "An error occurred. | " and pushed the real explanation to the
        # right. Prefer the specific errors; fall back to `message` only when
        # there are none.
        envelope_message = payload.get("message")
        specific = {k: v for k, v in payload.items() if k not in {"success", "message"}}
        messages = [m for m in _flatten_errors(specific) if str(m).strip()]
        if not messages and isinstance(envelope_message, str) and envelope_message.strip():
            messages = [envelope_message]
    else:
        messages = [m for m in _flatten_errors(payload) if str(m).strip()]
    # Deduplicate while preserving order: DRF error bodies frequently repeat the
    # same field errors at the top level and under "errors".
    seen = set()
    unique = []
    for message in messages:
        text = str(message).strip()
        if text and text not in seen:
            seen.add(text)
            unique.append(text)
    if unique:
        return " | ".join(unique)[:2000]
    if status >= 500:
        return "The server failed to process the request. See the server log for the traceback."
    if status == 404:
        return "The record was not found."
    if status in {401, 403}:
        return "Permission was refused for this account."
    return ""


def _actor_name(actor) -> str:
    if actor is None or not getattr(actor, "is_authenticated", False):
        return "An unauthenticated visitor"
    full = ""
    getter = getattr(actor, "get_full_name", None)
    if callable(getter):
        try:
            full = (getter() or "").strip()
        except Exception:
            full = ""
    return full or getattr(actor, "email", "") or "Someone"


def build_summary(*, actor, action: str, label: str, reference: str, result: str, reason: str) -> str:
    """One sentence: who, what, to what, and how it went."""
    base, past = ACTION_PHRASES.get(action, (action.replace("_", " ").replace("-", " "),) * 2)
    who = _actor_name(actor)

    if action in SELF_ACTIONS:
        target = ""
    else:
        article = "" if label.endswith("s") else "a "
        target = f" {article}{label}".rstrip()
        if reference:
            target = f" {label} {reference}"

    if result == AuditResult.SUCCESS:
        sentence = f"{who} {past}{target}"
    elif result == AuditResult.DENIED:
        sentence = f"{who} was not allowed to {base}{target}"
    else:
        sentence = f"{who} could not {base}{target}"

    if reason and result != AuditResult.SUCCESS:
        sentence = f"{sentence} — {reason}"
    return sentence[:500]


def resolve_entity_id(request, response) -> str:
    """The affected record's id: from the URL, or from a create response body."""
    for segment in reversed(_segments(request.path)):
        if _looks_like_id(segment):
            return segment[:100]

    payload = _response_payload(response)
    if isinstance(payload, dict):
        new_id = payload.get("id")
        if isinstance(new_id, (str, int)) and str(new_id).strip():
            return str(new_id)[:100]
    return ""


def result_for_status(status: int) -> str:
    if status < 400:
        return AuditResult.SUCCESS
    if status in {401, 403}:
        return AuditResult.DENIED
    return AuditResult.FAILED
