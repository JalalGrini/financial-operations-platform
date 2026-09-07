import csv

from django.http import StreamingHttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action

from apps.audit_log.models import AuditEvent
from apps.audit_log.permissions import CanViewAuditLog
from apps.audit_log.serializers import AuditEventSerializer
from apps.common.export_i18n import resolve_export_lang, translate_header
from apps.common.querying import apply_date_range
from apps.common.security import safe_export_row


class Echo:
    def write(self, value):
        return value


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = [CanViewAuditLog]
    ordering_fields = ["created_at", "action", "result"]
    search_fields = ["summary", "entity_reference", "entity_id", "actor_email", "request_path"]

    def get_queryset(self):
        q = AuditEvent.objects.select_related("actor", "company")
        p = self.request.query_params
        if p.get("actor"):
            q = q.filter(actor_id=p["actor"])
        if p.get("company"):
            q = q.filter(company_id=p["company"])
        if p.get("action"):
            q = q.filter(action=p["action"])
        if p.get("entity_type"):
            q = q.filter(entity_type=p["entity_type"])
        if p.get("result"):
            q = q.filter(result=p["result"])
        # Was two hand-rolled filters passing the raw string straight into the
        # ORM. The __date lookup was already correct here, but nothing validated
        # the value: "2026-13-01" is well-formed yet impossible, and parse_date
        # raises on it rather than returning None, so it surfaced as a 500 on
        # user input. The shared helper answers 400 instead.
        q = apply_date_range(q, self.request, "created_at")
        return q

    @action(detail=False, methods=["get"])
    def export(self, request):
        rows = self.filter_queryset(self.get_queryset()).iterator()
        pseudo = Echo()
        writer = csv.writer(pseudo)

        # The header row is system-generated content, so it follows the language
        # the user is working in. This writer predates the shared
        # ExportableListMixin and so was missed when export_i18n was wired in
        # v17.26: a Director working in French exported the audit log and got a
        # file headed Time / Actor / Role.
        #
        # Only the header is translated. Every data cell below is either the
        # user's own text (summary, reason) or a stable identifier (path,
        # correlation id), and translating those would corrupt the record.
        lang = resolve_export_lang(request)
        header = [
            translate_header(label, lang)
            for label in (
                "Time",
                "Actor",
                "Role",
                "Company",
                "Action",
                "Entity",
                "Reference",
                "Result",
                "Summary",
                # The "why" behind a denial or failure. Exporting the outcome
                # without it made the CSV as unhelpful as the old on-screen log.
                "Reason",
                "Path",
                "Correlation ID",
            )
        ]

        def stream():
            yield writer.writerow(safe_export_row(header))
            for e in rows:
                yield writer.writerow(
                    safe_export_row(
                        [
                            e.created_at.isoformat(),
                            e.actor_email,
                            e.actor_role,
                            getattr(e.company, "name", ""),
                            e.action,
                            e.entity_type,
                            e.entity_reference,
                            e.result,
                            e.summary,
                            e.reason,
                            e.request_path,
                            str(e.correlation_id),
                        ]
                    )
                )

        response = StreamingHttpResponse(stream(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="efop_audit_log.csv"'
        return response
