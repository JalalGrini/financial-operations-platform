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


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_TICKET_FILES = 2
MAX_TICKET_FILE_BYTES = 2 * 1024 * 1024
MAX_TICKET_TOTAL_BYTES = 4 * 1024 * 1024
MAX_REQUEST_BODY_BYTES = 26 * 1024 * 1024
TICKET_ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
TICKET_ALLOWED_MIMES = {"application/pdf", "image/jpeg", "image/png"}
TICKET_FILE_ERROR = (
    "Fichier invalide. Max 2 fichiers, 2 Mo chacun, formats acceptés: PDF, JPG, PNG."
)
LEAVE_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
PHOTO_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

ALLOWED_SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".webp": (b"RIFF",),
    ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".docx": (b"PK\x03\x04",),
    ".xlsx": (b"PK\x03\x04",),
    ".xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".csv": tuple(),
}


def _safe_name(raw_name):
    raw = str(raw_name or "")
    normalized = unicodedata.normalize("NFKC", raw)
    name = os.path.basename(normalized.replace("\\", "/"))
    if not name or name in {".", ".."}:
        raise ValidationError("The file name is missing, too long, or contains a path.")
    cleaned = []
    for ch in name:
        if ord(ch) < 32 or ch in {"/", "\\", ":", "*", "?", '"', "<", ">", "|"}:
            cleaned.append("_")
        else:
            cleaned.append(ch)
    name = "".join(cleaned).strip(" .")
    if not name or len(name) > 180:
        raise ValidationError("The file name is missing, too long, or contains a path.")
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


def _verify_office_zip(upload, required_member, label):
    try:
        upload.seek(0)
        with zipfile.ZipFile(upload) as archive:
            infos = archive.infolist()
            names = {info.filename for info in infos}
            if (
                len(infos) > 2000
                or "[Content_Types].xml" not in names
                or required_member not in names
            ):
                raise ValidationError(f"The {label} package is invalid or unexpectedly complex.")
            total = 0
            for info in infos:
                path = PurePosixPath(info.filename)
                if path.is_absolute() or ".." in path.parts:
                    raise ValidationError(f"The {label} package contains an unsafe path.")
                total += info.file_size
                if total > 50 * 1024 * 1024:
                    raise ValidationError(f"The expanded {label} package is too large.")
                if info.compress_size and info.file_size / info.compress_size > 200:
                    raise ValidationError(f"The {label} package has an unsafe compression ratio.")
    except zipfile.BadZipFile as exc:
        raise ValidationError(f"The {label} file is not a valid Office package.") from exc
    finally:
        upload.seek(0)


def _verify_xlsx(upload):
    _verify_office_zip(upload, "xl/workbook.xml", "XLSX")


def validate_private_upload(upload, *, max_bytes=MAX_UPLOAD_BYTES, allowed=None):
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
    if ext == ".webp" and b"WEBP" not in head[:16]:
        raise ValidationError("File content does not match its extension.")
    if ext in {".png", ".jpg", ".jpeg", ".webp"}:
        _verify_image(upload)
    elif ext == ".xlsx":
        _verify_xlsx(upload)
    elif ext == ".docx":
        _verify_office_zip(upload, "word/document.xml", "DOCX")
    elif ext == ".csv" and b"\x00" in head:
        raise ValidationError("CSV files must be text and cannot contain NUL bytes.")
    upload.name = name
    return upload


def collect_request_uploads(request, *keys):
    """Collect unique uploaded files from multipart keys, including files[]."""
    names = keys or ("files", "files[]", "file")
    collected = []
    seen = set()
    sources = []
    if request is not None:
        sources.append(getattr(request, "FILES", None))
    for source in sources:
        if source is None:
            continue
        for key in names:
            getter = getattr(source, "getlist", None)
            values = getter(key) if callable(getter) else []
            for upload in values:
                marker = id(upload)
                if upload and marker not in seen:
                    seen.add(marker)
                    collected.append(upload)
    return collected


def _detect_upload_mime(upload):
    """MIME from file bytes. Prefer python-magic; fall back to signatures."""
    upload.seek(0)
    head = upload.read(2048)
    upload.seek(0)
    try:
        import magic

        mime = magic.from_buffer(head, mime=True)
        if mime:
            return str(mime).split(";")[0].strip().lower()
    except Exception:
        pass
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return "application/octet-stream"


def scrub_ticket_image(upload, mime):
    """Re-save JPEG/PNG through Pillow so EXIF and other metadata are dropped."""
    if mime not in {"image/jpeg", "image/png"}:
        return upload
    from io import BytesIO

    from django.core.files.base import ContentFile
    from PIL import Image

    upload.seek(0)
    try:
        image = Image.open(upload)
        fmt = image.format or ("JPEG" if mime == "image/jpeg" else "PNG")
        if fmt == "JPEG" and image.mode in {"RGBA", "P", "LA"}:
            image = image.convert("RGB")
        output = BytesIO()
        image.save(output, format=fmt, optimize=True)
        output.seek(0)
        cleaned = ContentFile(output.read(), name=getattr(upload, "name", "image"))
        cleaned._detected_mime = mime
        return cleaned
    except Exception as exc:
        raise ValidationError(TICKET_FILE_ERROR) from exc
    finally:
        upload.seek(0)


def validate_ticket_uploads(uploads):
    files = [upload for upload in uploads if upload]
    cleaned = []
    try:
        if len(files) > MAX_TICKET_FILES:
            raise ValidationError(TICKET_FILE_ERROR)
        total = 0
        for upload in files:
            name = _safe_name(getattr(upload, "name", ""))
            ext = os.path.splitext(name)[1].lower()
            if ext not in TICKET_ALLOWED_EXTENSIONS:
                raise ValidationError(TICKET_FILE_ERROR)
            size = int(getattr(upload, "size", 0) or 0)
            if size <= 0 or size > MAX_TICKET_FILE_BYTES:
                raise ValidationError(TICKET_FILE_ERROR)
            mime = _detect_upload_mime(upload)
            if mime not in TICKET_ALLOWED_MIMES:
                raise ValidationError("Type de fichier non autorisé.")
            if ext in {".jpg", ".jpeg"} and mime != "image/jpeg":
                raise ValidationError(TICKET_FILE_ERROR)
            if ext == ".png" and mime != "image/png":
                raise ValidationError(TICKET_FILE_ERROR)
            if ext == ".pdf" and mime != "application/pdf":
                raise ValidationError(TICKET_FILE_ERROR)
            validate_private_upload(
                upload, max_bytes=MAX_TICKET_FILE_BYTES, allowed=TICKET_ALLOWED_EXTENSIONS
            )
            upload._detected_mime = mime
            cleaned.append(scrub_ticket_image(upload, mime))
            total += size
        if total > MAX_TICKET_TOTAL_BYTES:
            raise ValidationError(TICKET_FILE_ERROR)
    except ValidationError as exc:
        raise ValidationError(TICKET_FILE_ERROR) from exc
    return cleaned
