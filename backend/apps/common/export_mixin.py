# apps/common/export_mixin.py
"""Give any list ViewSet a configurable export in one line.

Requested as: "at all the places where they are lists i should be able to
export as many formats or even choose or filter what to export".

Three things were missing before this:

1. FORMAT. Only the personnel screens could export anything but CSV.

2. FILTERS. `apps/personnel/views._export_list_response` exported
   `self.get_queryset()`, and its docstring claimed that "the ViewSet's own
   get_queryset() is reused so the export matches the on-screen filters
   exactly". That is not what get_queryset() does: DRF applies search,
   ordering and filter-backend query parameters in `filter_queryset()`, which
   was never called. Searching for one employee and pressing Export therefore
   downloaded every employee. This mixin calls `filter_queryset()`, so what is
   exported is what is on screen.

3. COLUMNS. The column set was hard-coded per endpoint with no way to pick a
   subset.

USAGE
-----
    class ThingViewSet(ExportableListMixin, viewsets.ModelViewSet):
        export_columns = [
            ("reference", "Reference"),
            ("name", "Name"),
        ]
        export_sheet_name = "Things"
        export_filename_stem = "things_export"

The default row builder reads each column's field off the model instance with
`getattr`, following `__` to traverse relations and calling any callable it
lands on. Override `build_export_row(obj)` when a value needs real work.
"""

from __future__ import annotations

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.exporting import SUPPORTED_EXPORT_FORMATS, export_bytes

#: Cap on exported rows. Generous for any real export, small enough that one
#: mistaken unbounded request cannot exhaust a worker's memory.
EXPORT_ROW_CAP = 10_000


def resolve_export_value(instance, path: str):
    """Read `path` off `instance`, traversing `__` and calling callables.

    "employment__person__last_name" walks the relations; a missing link yields
    "" rather than raising, because an export must not 500 over one null FK.
    """
    value = instance
    for part in path.split("__"):
        if value is None:
            return ""
        value = getattr(value, part, None)
        if callable(value):
            value = value()
    return "" if value is None else value


class ExportableListMixin:
    """Adds `export` and `export-options` actions to a ViewSet."""

    #: [(field path, column header)] - the full set this endpoint can export.
    export_columns: list[tuple[str, str]] = []
    #: Worksheet / PDF title.
    export_sheet_name: str = "Export"
    #: Downloaded filename without extension.
    export_filename_stem: str = "export"
    export_row_cap: int = EXPORT_ROW_CAP

    # ---------------------------------------------------------------- helpers

    def get_export_columns(self) -> list[tuple[str, str]]:
        return list(self.export_columns)

    def build_export_row(self, instance) -> dict:
        return {
            field: resolve_export_value(instance, field)
            for field, _header in self.get_export_columns()
        }

    def get_export_queryset(self):
        """The rows on screen.

        `filter_queryset` is the whole point: it applies the search, ordering
        and filter backends that `get_queryset` alone does not.
        """
        return self.filter_queryset(self.get_queryset())

    def _selected_columns(self, requested: str | None):
        """Narrow the column set to `requested`, preserving declared order.

        Order comes from the declaration rather than from the request so the
        header row is predictable, and unknown names are reported instead of
        silently ignored - a typo that quietly produced a different file would
        be worse than an error.
        """
        available = self.get_export_columns()
        if not requested:
            return available, None

        wanted = [name.strip() for name in requested.split(",") if name.strip()]
        if not wanted:
            return available, None

        known = {field for field, _header in available}
        unknown = [name for name in wanted if name not in known]
        if unknown:
            return None, (
                f"Unknown column(s): {', '.join(unknown)}. "
                f"Available: {', '.join(sorted(known))}."
            )
        chosen = [(field, header) for field, header in available if field in set(wanted)]
        return chosen, None

    # ---------------------------------------------------------------- actions

    @action(detail=False, methods=["get"], url_path="export-options")
    def export_options(self, request):
        """What this endpoint can export, so the UI can build the picker itself
        instead of hard-coding a column list per page."""
        # Headers are translated here too, otherwise the picker would offer
        # "Trade name" and the resulting file would say "Nom commercial".
        from apps.common.export_i18n import resolve_export_lang, translate_columns

        lang = resolve_export_lang(request)
        return Response(
            {
                "formats": list(SUPPORTED_EXPORT_FORMATS),
                "columns": [
                    {"field": field, "header": header}
                    for field, header in translate_columns(
                        self.get_export_columns(), lang
                    )
                ],
                "row_cap": self.export_row_cap,
            }
        )

    @action(detail=False, methods=["get", "post"])
    def export(self, request):
        """Export the filtered list.

        Query parameters:
          output_format - xlsx (default), csv or pdf
          columns       - comma-separated subset of the declared fields

        NOT `format`. That name is reserved by DRF's content negotiation
        (`URL_FORMAT_OVERRIDE`), so `?format=csv` is read as "render with a
        renderer named csv", no such renderer is registered, and the request
        fails with 404 before this method is ever entered. This mixin
        originally documented `format` as its primary parameter, which meant
        the documented call could not work; found and fixed in v17.19 when the
        mixin was first wired to real endpoints. `output_format` matches what
        the existing personnel exports and the frontend already send.

        GET and POST are both accepted: the existing frontend list pages POST
        to this path, while a plain link or a new tab can only GET.
        """
        columns = self.get_export_columns()
        if not columns:
            return Response(
                {"detail": "This endpoint does not declare any exportable columns."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        params = request.query_params
        # `format` is deliberately not consulted here - see the docstring.
        requested_format = params.get("output_format") or "xlsx"

        selected, error = self._selected_columns(params.get("columns"))
        if error:
            return Response({"columns": [error]}, status=status.HTTP_400_BAD_REQUEST)

        queryset = self.get_export_queryset()[: self.export_row_cap]
        rows = [self.build_export_row(instance) for instance in queryset]

        # v17.26: the artefact leaves in the language the user is working in.
        # Only the header row and the sheet title are translated - field paths
        # are the contract with the database and with `columns=`, and the data
        # itself is the user's own text.
        from apps.common.export_i18n import (
            resolve_export_lang,
            translate_columns,
            translate_sheet_name,
        )

        lang = resolve_export_lang(request)
        selected = translate_columns(selected, lang)
        sheet_name = translate_sheet_name(self.export_sheet_name, lang)

        try:
            content, content_type, extension = export_bytes(
                rows, selected, sheet_name, requested_format
            )
        except ValueError as exc:
            return Response({"format": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="{self.export_filename_stem}.{extension}"'
        )
        # Lets the browser surface the row count without opening the file.
        response["X-Export-Row-Count"] = str(len(rows))
        return response
