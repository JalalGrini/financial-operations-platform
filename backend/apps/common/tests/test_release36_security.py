from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from apps.common.security import safe_export_cell, validate_private_upload


class Release36SecurityTests(SimpleTestCase):
    def test_csv_formula_is_neutralized(self):
        for value in ("=1+1", "+cmd", "-2+3", "@SUM(A1)"):
            self.assertTrue(safe_export_cell(value).startswith("'"))

    def test_upload_rejects_spoofed_pdf(self):
        f = SimpleUploadedFile("invoice.pdf", b"not a pdf", content_type="application/pdf")
        with self.assertRaises(Exception):
            validate_private_upload(f)

    def test_upload_accepts_real_pdf_signature(self):
        f = SimpleUploadedFile("invoice.pdf", b"%PDF-1.7 test", content_type="application/pdf")
        self.assertIs(validate_private_upload(f), f)
