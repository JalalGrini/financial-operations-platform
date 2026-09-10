"""SMTP backend that connects over IPv4 only, with Gmail port failover.

Railway (and many container hosts) have no working IPv6. smtp.gmail.com
returns an AAAA record first; the default SMTP client then spends
EMAIL_TIMEOUT on that black-holed route and never tries the A record.

Django 6 also picks ``smtplib.SMTP`` / ``SMTP_SSL`` via a
``connection_class`` *property*, so a subclass ``ssl_class`` attribute is
ignored. Port 465 must use ``IPv4SMTP_SSL``.

If STARTTLS on 587 times out, Gmail's SMTPS port 465 is tried next, still
on IPv4, still inside EMAIL_TIMEOUT so a single gunicorn worker is not
blocked past the login-safe budget.
"""

from __future__ import annotations

import logging
import smtplib
import socket
import time

from django.core.mail.backends.smtp import EmailBackend as SMTPEmailBackend

logger = logging.getLogger(__name__)

GMAIL_HOSTS = {"smtp.gmail.com", "smtp.googlemail.com"}


def _ipv4_socket(host, port, timeout, source_address=None):
    last_err: OSError | None = None
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"No IPv4 address for SMTP host {host!r}")
    seen: set[tuple] = set()
    unique = []
    for info in infos:
        sockaddr = info[4]
        if sockaddr in seen:
            continue
        seen.add(sockaddr)
        unique.append(info)
    deadline = None if timeout is None else time.monotonic() + float(timeout)
    for family, socktype, proto, _canon, sockaddr in unique:
        remaining = timeout if deadline is None else deadline - time.monotonic()
        if remaining is not None and remaining <= 0:
            break
        sock = socket.socket(family, socktype, proto)
        if remaining is not None:
            sock.settimeout(remaining)
        elif timeout is not None:
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


def smtp_attempts(host, port, use_tls, use_ssl):
    """Configured (port, STARTTLS, SSL), then Gmail's other standard port."""
    primary = (int(port or 587), bool(use_tls), bool(use_ssl))
    attempts = [primary]
    if (host or "").lower() in GMAIL_HOSTS:
        for alt in ((587, True, False), (465, False, True)):
            if alt not in attempts:
                attempts.append(alt)
    return attempts


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
    """IPv4 SMTP; Django 6 requires this property (ssl_class is ignored)."""

    @property
    def connection_class(self):
        return IPv4SMTP_SSL if self.use_ssl else IPv4SMTP

    def open(self):
        if self.connection:
            return False
        original = (self.port, self.use_tls, self.use_ssl, self.timeout)
        attempts = smtp_attempts(self.host, self.port, self.use_tls, self.use_ssl)
        budget = float(self.timeout or 8)
        deadline = time.monotonic() + budget
        last_error: BaseException | None = None
        try:
            for port, use_tls, use_ssl in attempts:
                remaining = deadline - time.monotonic()
                if remaining < 1:
                    break
                per_try = remaining if len(attempts) == 1 else min(remaining, max(3.0, budget / 2))
                self.port = port
                self.use_tls = use_tls
                self.use_ssl = use_ssl
                self.timeout = per_try
                try:
                    result = super().open()
                    if self.connection:
                        logger.info(
                            "smtp connected host=%s port=%s ssl=%s tls=%s",
                            self.host,
                            port,
                            use_ssl,
                            use_tls,
                        )
                        return result
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "smtp attempt failed host=%s port=%s ssl=%s tls=%s err=%s",
                        self.host,
                        port,
                        use_ssl,
                        use_tls,
                        exc,
                    )
                    self._abandon_partial_connection()
            if last_error:
                raise last_error
            return super().open()
        finally:
            self.port, self.use_tls, self.use_ssl, self.timeout = original

    def _abandon_partial_connection(self):
        partial = getattr(self, "_partial_connection", None)
        if partial is not None:
            try:
                self._close_connection(partial)
            except Exception:
                pass
            self._partial_connection = None
        self.connection = None
