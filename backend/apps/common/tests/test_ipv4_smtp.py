import socket
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.common.ipv4_smtp import IPv4SMTP, _ipv4_socket


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
