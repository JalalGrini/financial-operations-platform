from apps.audit_log.describe import (
    build_summary,
    extract_reason,
    extract_reference,
    resolve_action,
    resolve_entity,
    resolve_entity_id,
    result_for_status,
)
from apps.audit_log.services import record_event


class AuditTrailMiddleware:
    """Record every unsafe API request without persisting request bodies or secrets.

    The description of each event is built in apps.audit_log.describe, which
    replaced this middleware's original one-size-fits-all output:

        action  = "create_or_action"      (for every POST, whatever it did)
        summary = "POST /api/v1/... returned 500"
        reason  = ""                      (never populated at all)

    Both questions a reader brings to an audit log - what was done, and why it
    did not work - were unanswerable. Failure reasons are now taken from the
    response the server actually sent back.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.path.startswith("/api/v1/")
            and not request.path.startswith("/api/v1/audit-log/")
        ):
            try:
                self._record(request, response)
            except Exception:
                # An audit trail that can break a request is worse than a terse
                # one. Deliberately swallowed, as before.
                pass
        return response

    def _record(self, request, response):
        status = getattr(response, "status_code", 500)
        result = result_for_status(status)
        action = resolve_action(request)
        entity_type, label = resolve_entity(request, action)

        reference = extract_reference(response) if result == "success" else ""
        reason = extract_reason(response, status) if result != "success" else ""

        actor = getattr(request, "user", None)
        record_event(
            action=action,
            summary=build_summary(
                actor=actor,
                action=action,
                label=label,
                reference=reference,
                result=result,
                reason=reason,
            ),
            actor=actor,
            entity_type=entity_type,
            entity_id=resolve_entity_id(request, response),
            entity_reference=reference,
            result=result,
            reason=reason,
            request=request,
        )
