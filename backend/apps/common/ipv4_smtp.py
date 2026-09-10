"""SMTP backend that connects over IPv4 only.

Railway (and many container hosts) have no working IPv6. smtp.gmail.com
returns an AAAA record first; the default SMTP client then spends
EMAIL_TIMEOUT on that black-holed route and never tries the A record.
The result is ``[Errno 101] Network is unreachable`` and an empty Gmail
Sent folder even though credentials are correct.
"""

from __future__ import annotations

import socket
import smtplib

from django.core.mail.backends.smtp import EmailBackend as SMTPEmailBackend


def _ipv4_socket(host, port, timeout, source_address=None):
    last_err: OSError | None = None
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"No IPv4 address for SMTP host {host!r}")
    for family, socktype, proto, _canon, sockaddr in infos:
        sock = socket.socket(family, socktype, proto)
        if timeout is not None:
            sock.settimeout(timeout)
        try:
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            return sock
        except OSError as exc:
            last_err = exc
            sock.close()
    if last_err:
        raise last_err
    raise OSError(f"No IPv4 address for SMTP host {host!r}")


class IPv4SMTP(smtplib.SMTP):
    def _get_socket(self, host, port, timeout):
        return _ipv4_socket(host, port, timeout, getattr(self, "source_address", None))


class IPv4SMTP_SSL(smtplib.SMTP_SSL):
    def _get_socket(self, host, port, timeout):
        raw = _ipv4_socket(host, port, timeout, getattr(self, "source_address", None))
        context = self.context
        hostname = getattr(self, "_host", host)
        return context.wrap_socket(raw, server_hostname=hostname)


class EmailBackend(SMTPEmailBackend):
    connection_class = IPv4SMTP
    ssl_class = IPv4SMTP_SSL
