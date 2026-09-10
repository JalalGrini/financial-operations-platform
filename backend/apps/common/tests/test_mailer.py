import io
import json
import urllib.error
from unittest.mock import patch

from django.core import mail
from django.test import SimpleTestCase, override_settings

from apps.common.mailer import MailerError, queue_platform_email, send_platform_email

FAKE_BREVO_KEY = "xkeysib-test-key-not-real"


class _FakeApiResponse:
    def __init__(self, status=201, body=b"{}"):
        self.status = status
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self._body


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class QueuePlatformEmailTests(SimpleTestCase):
    def test_sends_inline_without_starting_a_thread(self):
        with patch("threading.Thread") as thread:
            queue_platform_email(
                to="golnar@example.com",
                subject="Your 3.R.B Extreme sign-in code",
                body="123456",
            )
            thread.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["golnar@example.com"])
        self.assertEqual(mail.outbox[0].subject, "Your 3.R.B Extreme sign-in code")

    def test_send_platform_email_uses_default_from_when_none(self):
        send_platform_email(to="a@example.com", subject="s", body="b")
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(mail.outbox[0].from_email)

    def test_missing_recipient_raises(self):
        with self.assertRaises(MailerError):
            send_platform_email(to="", subject="s", body="b")

    @override_settings(
        EMAIL_API_KEY=FAKE_BREVO_KEY,
        EMAIL_API_URL="https://api.brevo.com/v3/smtp/email",
    )
    def test_locmem_skips_api_when_key_is_set(self):
        with patch("apps.common.mailer.urllib.request.urlopen") as urlopen:
            send_platform_email(to="a@example.com", subject="s", body="b")
            urlopen.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    EMAIL_API_KEY=FAKE_BREVO_KEY,
    EMAIL_API_URL="",
    DEFAULT_FROM_EMAIL="3.R.B Extreme <grp3rb@gmail.com>",
)
class BrevoApiMailerTests(SimpleTestCase):
    def test_posts_brevo_payload_and_skips_smtp(self):
        with patch("apps.common.mailer.get_connection") as get_connection:
            with patch(
                "apps.common.mailer.urllib.request.urlopen",
                return_value=_FakeApiResponse(),
            ) as urlopen:
                send_platform_email(
                    to="reset@example.com",
                    subject="Reset",
                    body="Your code is 123456",
                )
        get_connection.assert_not_called()
        request = urlopen.call_args[0][0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), FAKE_BREVO_KEY)
        self.assertIsNone(request.get_header("Authorization"))
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(request.get_header("Accept"), "application/json")
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(
            payload,
            {
                "sender": {"name": "3.R.B Extreme", "email": "grp3rb@gmail.com"},
                "to": [{"email": "reset@example.com"}],
                "subject": "Reset",
                "textContent": "Your code is 123456",
            },
        )

    def test_http_error_raises_mailer_error_with_body_snippet(self):
        error = urllib.error.HTTPError(
            "https://api.brevo.com/v3/smtp/email",
            400,
            "Bad Request",
            hdrs=None,
            fp=io.BytesIO(b'{"message":"invalid_parameter"}'),
        )
        with patch("apps.common.mailer.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(MailerError) as raised:
                send_platform_email(to="a@example.com", subject="s", body="b")
        self.assertIn("400", str(raised.exception))
        self.assertIn("invalid_parameter", str(raised.exception))
        self.assertNotIn(FAKE_BREVO_KEY, str(raised.exception))
