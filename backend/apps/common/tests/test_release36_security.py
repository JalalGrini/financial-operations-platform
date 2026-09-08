from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from apps.common.security import safe_export_cell, validate_private_upload, validate_ticket_uploads


class Release36SecurityTests(SimpleTestCase):
    def test_csv_formula_is_neutralized(self):
        for value in ("=1+1", "+cmd", "-2+3", "@SUM(A1)"):
            self.assertTrue(safe_export_cell(value).startswith("'"))

    def test_upload_rejects_spoofed_pdf(self):
        f = SimpleUploadedFile("invoice.pdf", b"not a pdf", content_type="application/pdf")
        with self.assertRaises(Exception):
            validate_private_upload(f)

    def test_upload_sanitizes_colon_in_filename(self):
        from apps.common.security import _safe_name

        self.assertEqual(
            _safe_name("WhatsApp Image at 12:34:56.jpg"),
            "WhatsApp Image at 12_34_56.jpg",
        )

    def test_upload_accepts_real_pdf_signature(self):
        f = SimpleUploadedFile("invoice.pdf", b"%PDF-1.7 test", content_type="application/pdf")
        self.assertIs(validate_private_upload(f), f)

    def test_ticket_uploads_reject_too_many_files(self):
        files = [
            SimpleUploadedFile(f"doc{i}.pdf", b"%PDF-1.7 x", content_type="application/pdf")
            for i in range(3)
        ]
        with self.assertRaises(Exception):
            validate_ticket_uploads(files)

    def test_ticket_uploads_reject_executables(self):
        f = SimpleUploadedFile("payload.exe", b"MZ\x90\x00", content_type="application/octet-stream")
        with self.assertRaises(Exception):
            validate_ticket_uploads([f])

    def test_ticket_uploads_reject_spoofed_content_type(self):
        f = SimpleUploadedFile("photo.png", b"%PDF-1.7 x", content_type="image/png")
        with self.assertRaises(Exception):
            validate_ticket_uploads([f])
