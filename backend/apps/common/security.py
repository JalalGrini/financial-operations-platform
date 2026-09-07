"""Security helpers shared by uploads and spreadsheet exports."""

import os
import unicodedata
import zipfile
from pathlib import PurePosixPath

from django.core.exceptions import ValidationError

DANGEROUS_CSV_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_export_cell(value):
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(DANGEROUS_CSV_PREFIXES) else text


def safe_export_row(values):
    return [safe_export_cell(value) for value in values]


ALLOWED_SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".xlsx": (b"PK\x03\x04",),
    ".csv": tuple(),
}


def _safe_name(raw_name):
    raw = str(raw_name or "")
    normalized = unicodedata.normalize("NFKC", raw)
    name = os.path.basename(normalized)
    if not name or name != normalized or len(name) > 180:
        raise ValidationError("The file name is missing, too long, or contains a path.")
    if any(ord(ch) < 32 or ch in {"/", "\\", ":", "*", "?", '"', "<", ">", "|"} for ch in name):
        raise ValidationError("The file name contains unsafe characters.")
    return name


def _verify_image(upload):
    try:
        from PIL import Image

        upload.seek(0)
        with Image.open(upload) as image:
            image.verify()
    except Exception as exc:
        raise ValidationError("The image is corrupt or is not a supported image.") from exc
    finally:
        upload.seek(0)


def _verify_xlsx(upload):
    try:
        upload.seek(0)
        with zipfile.ZipFile(upload) as archive:
            infos = archive.infolist()
            names = {info.filename for info in infos}
            if (
                len(infos) > 2000
                or "[Content_Types].xml" not in names
                or "xl/workbook.xml" not in names
            ):
                raise ValidationError("The XLSX package is invalid or unexpectedly complex.")
            total = 0
            for info in infos:
                path = PurePosixPath(info.filename)
                if path.is_absolute() or ".." in path.parts:
                    raise ValidationError("The XLSX package contains an unsafe path.")
                total += info.file_size
                if total > 50 * 1024 * 1024:
                    raise ValidationError("The expanded XLSX package is too large.")
                if info.compress_size and info.file_size / info.compress_size > 200:
                    raise ValidationError("The XLSX package has an unsafe compression ratio.")
    except zipfile.BadZipFile as exc:
        raise ValidationError("The XLSX file is not a valid workbook package.") from exc
    finally:
        upload.seek(0)


def validate_private_upload(upload, *, max_bytes=10 * 1024 * 1024, allowed=None):
    if not upload:
        return upload
    name = _safe_name(getattr(upload, "name", ""))
    ext = os.path.splitext(name)[1].lower()
    allowed_extensions = set(allowed or ALLOWED_SIGNATURES)
    if ext not in allowed_extensions:
        raise ValidationError("This file type is not allowed.")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0 or size > max_bytes:
        raise ValidationError(f"File must be between 1 byte and {max_bytes // (1024 * 1024)} MB.")
    upload.seek(0)
    head = upload.read(4096)
    upload.seek(0)
    signatures = ALLOWED_SIGNATURES.get(ext, ())
    if signatures and not any(head.startswith(signature) for signature in signatures):
        raise ValidationError("File content does not match its extension.")
    if ext in {".png", ".jpg", ".jpeg"}:
        _verify_image(upload)
    elif ext == ".xlsx":
        _verify_xlsx(upload)
    elif ext == ".csv" and b"\x00" in head:
        raise ValidationError("CSV files must be text and cannot contain NUL bytes.")
    upload.name = name
    return upload
