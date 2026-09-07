# apps/reports/xlsx.py
"""xlsx export for a report version (blueprint Section 15).

Generalises apps.personnel.services.ReportService._build_xlsx's
rows/columns/sheet_name pattern for arbitrary ReportValue rows, rather than
duplicating the styling and formula-injection-guard logic a second time.
PDF export is deferred to Phase 2 (decision R-7, Cycle 21 architect pass,
state/IMPLEMENTATION_PLAN.md Section 15.7): no reportlab/weasyprint is
available in this environment.
"""
from decimal import Decimal

COLUMNS = [
    ("key", "Key"),
    ("label", "Label"),
    ("period_label", "Period"),
    ("amount", "Amount"),
    ("is_available", "Available"),
    ("source_references", "Source Records"),
]


def _rows_for_xlsx(values):
    rows = []
    for value in values:
        source_refs = ", ".join(source.financial_record.reference for source in value.sources.all())
        rows.append(
            {
                "key": value.key,
                "label": value.label,
                "period_label": value.period_label,
                "amount": value.amount,
                "is_available": "Yes" if value.is_available else "No",
                "source_references": source_refs,
            }
        )
    return rows


def build_report_version_xlsx(*, version, values) -> bytes:
    """Build an xlsx workbook for one report version's computed values.

    Mirrors apps.personnel.services.ReportService._build_xlsx exactly
    (header styling, thin borders, formula-injection guard, auto-fit
    columns) so a report export looks and behaves consistently with the
    payroll/CNSS exports that already exist.
    """
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    rows = _rows_for_xlsx(values)
    sheet_name = f"{version.report.reference} v{version.version_number}"[:31]

    wb = Workbook()
    ws = wb.active
    wb.active.title = sheet_name

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
    header_alignment = Alignment(horizontal="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_idx, (_field, header) in enumerate(COLUMNS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    for row_idx, row in enumerate(rows, 2):
        for col_idx, (field, _unused) in enumerate(COLUMNS, 1):
            value = row.get(field, "")
            if isinstance(value, Decimal):
                value = float(value)
            elif value is None:
                value = ""

            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(wrap_text=True)

            # Prevent spreadsheet formula/csv injection, matching the guard
            # in apps.personnel.services.ReportService._build_xlsx.
            if isinstance(value, str) and value:
                if value[0] in ("=", "+", "-", "@") or value.lstrip().startswith(
                    ("=", "+", "-", "@")
                ):
                    cell.value = "'" + value

    for col_idx, (auto_field, header) in enumerate(COLUMNS, 1):
        max_length = max(
            len(str(header)), max((len(str(row.get(auto_field, ""))) for row in rows), default=0)
        )
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_length + 2, 50)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return output.read()
