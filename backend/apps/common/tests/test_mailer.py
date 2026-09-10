from unittest.mock import patch

from django.core import mail
from django.test import SimpleTestCase, override_settings

from apps.common.mailer import MailerError, queue_platform_email, send_platform_email


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
