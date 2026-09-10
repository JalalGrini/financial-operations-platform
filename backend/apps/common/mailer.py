"""Outbound email: SMTP placeholders, optional HTTP API, Django send_mail."""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)
SMTP_TIMEOUT = 8


def _email_timeout() -> int:
    timeout = getattr(settings, "EMAIL_TIMEOUT", SMTP_TIMEOUT)
    try:
        return int(timeout) if timeout else SMTP_TIMEOUT
    except (TypeError, ValueError):
        return SMTP_TIMEOUT


class MailerError(Exception):
    """Raised when an email cannot be delivered."""


def send_platform_email(*, to: str, subject: str, body: str) -> None:
    if not to:
        raise MailerError("An email address is required.")
    api_url = (getattr(settings, "EMAIL_API_URL", "") or "").strip()
    api_key = (getattr(settings, "EMAIL_API_KEY", "") or "").strip()
    if api_url and api_key:
        _send_via_api(api_url, api_key, to, subject, body)
        return
    try:
        sent = send_mail(
            subject=subject,
            message=body,
            from_email=None,
            recipient_list=[to],
            fail_silently=False,
        )
    except Exception as exc:
        raise MailerError(str(exc)) from exc
    if not sent:
        raise MailerError("The email backend did not send the message.")


def _send_via_api(url: str, api_key: str, to: str, subject: str, body: str) -> None:
    payload = json.dumps(
        {
            "from": getattr(settings, "DEFAULT_FROM_EMAIL", "") or "noreply@localhost",
            "to": [to],
            "subject": subject,
            "text": body,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=_email_timeout()) as response:
            if response.status >= 400:
                raise MailerError(f"Email API returned {response.status}.")
    except MailerError:
        raise
    except urllib.error.URLError as exc:
        raise MailerError(str(exc.reason or exc)) from exc
    except Exception as exc:
        raise MailerError(str(exc)) from exc


def send_platform_email_quietly(*, to: str, subject: str, body: str) -> bool:
    try:
        send_platform_email(to=to, subject=subject, body=body)
        logger.info("sent email to=%s subject=%s", to, subject)
        return True
    except MailerError as exc:
        logger.warning("email not sent to=%s subject=%s err=%s", to, subject, exc)
        return False


def _inline_email_backend() -> bool:
    backend = (getattr(settings, "EMAIL_BACKEND", "") or "").lower()
    return "locmem" in backend or "console" in backend or "dummy" in backend


def _run_queued_send(*, to: str, subject: str, body: str) -> None:
    from django.db import close_old_connections

    close_old_connections()
    try:
        send_platform_email_quietly(to=to, subject=subject, body=body)
    finally:
        close_old_connections()


def queue_platform_email(*, to: str, subject: str, body: str) -> None:
    """Return immediately. SMTP still sends in the background in production."""
    if not to:
        return
    to = str(to)
    subject = str(subject or "")
    body = str(body or "")
    if _inline_email_backend():
        send_platform_email_quietly(to=to, subject=subject, body=body)
        return
    logger.info("queued email to=%s subject=%s", to, subject)
    threading.Thread(
        target=_run_queued_send,
        kwargs={"to": to, "subject": subject, "body": body},
        daemon=True,
        name="platform-email",
    ).start()
