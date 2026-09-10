from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="reset@example.com",
            password="OldPassphrase-2024!",
            first_name="A",
            last_name="B",
        )

    def test_unknown_email_is_rejected(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "nobody@example.com", "locale": "fr"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_known_email_sends_six_digit_code_and_resets(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "reset@example.com", "locale": "fr"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        import re

        match = re.search(r"\b(\d{6})\b", mail.outbox[0].body)
        self.assertIsNotNone(match)
        code = match.group(1)
        verify = self.client.post(
            "/api/v1/auth/password-reset/verify/",
            {"email": "reset@example.com", "code": code},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        confirm = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {
                "email": "reset@example.com",
                "code": code,
                "new_password": "FreshPassphrase-2026!",
                "confirm_password": "FreshPassphrase-2026!",
            },
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("FreshPassphrase-2026!"))
