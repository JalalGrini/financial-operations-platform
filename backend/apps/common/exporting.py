# apps/common/exporting.py
"""One export engine for the whole platform: CSV, XLSX and PDF.

WHY THIS EXISTS
---------------
Exporting was implemented three separate times:
  * apps/personnel/services.py  - csv + xlsx + pdf, the most complete version
  * apps/audit_log/views.py     - its own streaming csv writer
  * apps/inventory/views.py     - its own csv writer
and apps/reports/xlsx.py carries a fourth copy whose own docstring says it
"mirrors apps.personnel.services.ReportService._build_xlsx exactly". Only the
personnel one could produce anything other than CSV, so "export in as many
formats" was true on exactly one screen.

The row/column shape is deliberately the same as the personnel implementation
this was lifted from - `rows` is a list of dicts and `columns` a list of
(field, header) pairs - so existing callers delegate here without changing how
they build their data.

SPREADSHEET FORMULA INJECTION (D-109)
-------------------------------------
Every writer quote-prefixes any text cell beginning with =, +, - or @. A cell
like `=HYPERLINK("http://evil","click")` is inert in the database and inert on
the web page, but Excel executes it on open. The PDF writer applies the guard
too: a PDF cell never executes, but its text gets copy-pasted into
spreadsheets.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from django.utils import timezone

from apps.common.security import safe_export_row

#: Formats the engine can produce, in the order a UI should offer them.
SUPPORTED_EXPORT_FORMATS = ("xlsx", "csv", "pdf")

#: Characters that make a spreadsheet treat a text cell as a formula.
_FORMULA_PREFIXES = ("=", "+", "-", "@")

#: Longest cell rendered into a PDF, so a table cannot overflow the page width.
_PDF_CELL_LIMIT = 120


def _looks_like_formula(value: str) -> bool:
    if not value:
        return False
    return value[0] in _FORMULA_PREFIXES or value.lstrip().startswith(_FORMULA_PREFIXES)


def _as_text(value) -> str:
    """Normalise a cell to text the way every writer here needs it."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    if value is None:
        return ""
    return str(value)


def _guarded_text(value) -> str:
    text = _as_text(value)
    return "'" + text if _looks_like_formula(text) else text


def build_csv(rows: list[dict], columns: list[tuple[str, str]]) -> bytes:
    """CSV bytes, utf-8-sig so Excel detects the encoding on a double click."""
    import csv
    from io import StringIO

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(safe_export_row([header for _field, header in columns]))
    for row in rows:
        writer.writerow(
            safe_export_row([_guarded_text(row.get(field, "")) for field, _header in columns])
        )
    return output.getvalue().encode("utf-8-sig")


def build_xlsx(rows: list[dict], columns: list[tuple[str, str]], sheet_name: str) -> bytes:
    """Styled workbook: bold header band, borders, wrapped text, auto width."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    sheet = workbook.active
    # Excel rejects sheet names over 31 chars or containing []:*?/\
    sheet.title = (sheet_name or "Export")[:31] or "Export"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
    header_alignment = Alignment(horizontal="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_idx, (_field, header) in enumerate(columns, 1):
        cell = sheet.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    for row_idx, row in enumerate(rows, 2):
        for col_idx, (field, _unused) in enumerate(columns, 1):
            raw = row.get(field, "")
            # Numbers and dates stay typed so the spreadsheet can sum and sort
            # them; everything else becomes guarded text.
            if isinstance(raw, Decimal):
                value = float(raw)
            elif isinstance(raw, datetime):
                value = raw.strftime("%Y-%m-%d %H:%M")
            elif isinstance(raw, date):
                value = raw.strftime("%Y-%m-%d")
            elif raw is None:
                value = ""
            else:
                value = raw

            cell = sheet.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(wrap_text=True)

            if isinstance(value, str) and _looks_like_formula(value):
                cell.value = "'" + value

    for col_idx, (field, header) in enumerate(columns, 1):
        widest = max(
            len(str(header)),
            max((len(_as_text(row.get(field, ""))) for row in rows), default=0),
        )
        sheet.column_dimensions[get_column_letter(col_idx)].width = min(widest + 2, 50)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output.read()


def build_pdf(rows: list[dict], columns: list[tuple[str, str]], sheet_name: str) -> bytes:
    """Landscape A4 table with a repeated header row for multi-page output."""
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        title=sheet_name,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    styles = getSampleStyleSheet()

    data = [[str(header) for _field, header in columns]]
    for row in rows:
        data.append(
            [_guarded_text(row.get(field, ""))[:_PDF_CELL_LIMIT] for field, _header in columns]
        )

    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2F5496")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F2F2")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    doc.build(
        [
            Paragraph(sheet_name, styles["Title"]),
            Spacer(1, 6 * mm),
            Paragraph(
                f"Generated {timezone.now().strftime('%Y-%m-%d %H:%M')} — {len(rows)} row(s)",
                styles["Normal"],
            ),
            Spacer(1, 4 * mm),
            table,
        ]
    )
    return buffer.getvalue()


def export_bytes(
    rows: list[dict],
    columns: list[tuple[str, str]],
    sheet_name: str,
    output_format: str,
) -> tuple[bytes, str, str]:
    """Render `rows` in `output_format`.

    @returns (content, content_type, file extension)
    @raises ValueError for an unsupported format, so a view can answer 400
        rather than 500.
    """
    fmt = (output_format or "").strip().lower()
    if fmt == "xlsx":
        return (
            build_xlsx(rows, columns, sheet_name),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xlsx",
        )
    if fmt == "csv":
        return build_csv(rows, columns), "text/csv; charset=utf-8", "csv"
    if fmt == "pdf":
        return build_pdf(rows, columns, sheet_name), "application/pdf", "pdf"
    raise ValueError(
        f"Unsupported export format: {output_format!r}. "
        f"Choose one of: {', '.join(SUPPORTED_EXPORT_FORMATS)}."
    )
