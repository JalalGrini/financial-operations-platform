import socket
from unittest.mock import MagicMock, patch

from django.core.mail.backends.smtp import EmailBackend as SMTPEmailBackend
from django.test import SimpleTestCase

from apps.common.ipv4_smtp import (
    IPv4SMTP,
    IPv4SMTP_SSL,
    EmailBackend,
    _ipv4_socket,
    smtp_attempts,
)


class IPv4SMTPTests(SimpleTestCase):
    def test_connect_requests_ipv4_only(self):
        fake_sock = MagicMock()
        infos = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("142.250.4.108", 587)),
        ]
        with patch("socket.getaddrinfo", return_value=infos) as gai:
            with patch("socket.socket", return_value=fake_sock) as sock_cls:
                result = _ipv4_socket("smtp.gmail.com", 587, 8)
        gai.assert_called_once()
        self.assertEqual(gai.call_args[0][2], socket.AF_INET)
        sock_cls.assert_called_once_with(socket.AF_INET, socket.SOCK_STREAM, 6)
        fake_sock.connect.assert_called_once_with(("142.250.4.108", 587))
        self.assertIs(result, fake_sock)

    def test_smtp_class_uses_ipv4_socket(self):
        client = IPv4SMTP.__new__(IPv4SMTP)
        client.source_address = None
        fake_sock = MagicMock()
        with patch("apps.common.ipv4_smtp._ipv4_socket", return_value=fake_sock) as opener:
            result = IPv4SMTP._get_socket(client, "smtp.gmail.com", 587, 8)
        opener.assert_called_once_with("smtp.gmail.com", 587, 8, None)
        self.assertIs(result, fake_sock)

    def test_django6_connection_class_uses_ssl_on_465(self):
        starttls = EmailBackend(
            host="smtp.gmail.com",
            port=587,
            use_tls=True,
            use_ssl=False,
            timeout=8,
        )
        smtps = EmailBackend(
            host="smtp.gmail.com",
            port=465,
            use_tls=False,
            use_ssl=True,
            timeout=8,
        )
        self.assertIs(starttls.connection_class, IPv4SMTP)
        self.assertIs(smtps.connection_class, IPv4SMTP_SSL)

    def test_gmail_attempts_587_then_465(self):
        self.assertEqual(
            smtp_attempts("smtp.gmail.com", 587, True, False),
            [(587, True, False), (465, False, True)],
        )

    def test_open_falls_back_to_465_after_587_timeout(self):
        backend = EmailBackend(
            host="smtp.gmail.com",
            port=587,
            username="user@example.com",
            password="secret",
            use_tls=True,
            use_ssl=False,
            timeout=8,
        )
        seen = []

        def fake_open(self):
            seen.append((self.port, self.use_ssl, self.use_tls))
            if self.port == 587:
                raise TimeoutError("timed out")
            self.connection = object()
            return True

        with patch.object(SMTPEmailBackend, "open", fake_open):
            result = backend.open()
        self.assertTrue(result)
        self.assertEqual(seen[0], (587, False, True))
        self.assertEqual(seen[1], (465, True, False))
        self.assertEqual(backend.port, 587)
        self.assertTrue(backend.use_tls)
        self.assertFalse(backend.use_ssl)
