from django.db import IntegrityError
from django.test import SimpleTestCase

from config.exceptions import custom_exception_handler


class IntegrityExceptionContractTests(SimpleTestCase):
    def test_sqlite_style_unique_violation_is_a_readable_400(self):
        response = custom_exception_handler(
            IntegrityError("UNIQUE constraint failed: personnel_person.cin"), {}
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])

    def test_unknown_not_null_integrity_defect_is_not_disguised_as_duplicate(self):
        response = custom_exception_handler(
            IntegrityError("NOT NULL constraint failed: app_model.required"), {}
        )
        self.assertIsNone(response)
