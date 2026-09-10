"""Outbound email: Brevo HTTPS API, SMTP fallback, Django locmem/console."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail import get_connection, send_mail

logger = logging.getLogger(__name__)
SMTP_TIMEOUT = 8
IPV4_SMTP_BACKEND = "apps.common.ipv4_smtp.EmailBackend"
BREVO_SMTP_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_KEY_PREFIX = "xkeysib-"
_ERROR_BODY_LIMIT = 400


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
    if _inline_email_backend():
        _send_via_django(to=to, subject=subject, body=body, use_smtp=False)
        return
    api = _email_api_credentials()
    if api:
        _send_via_api(api[0], api[1], to, subject, body)
        return
    _send_via_django(to=to, subject=subject, body=body, use_smtp=True)


def _email_api_credentials() -> tuple[str, str] | None:
    api_url = (getattr(settings, "EMAIL_API_URL", "") or "").strip()
    api_key = (getattr(settings, "EMAIL_API_KEY", "") or "").strip()
    if not api_key:
        return None
    if not api_url and api_key.startswith(BREVO_KEY_PREFIX):
        api_url = BREVO_SMTP_EMAIL_URL
    if not api_url:
        return None
    return api_url, api_key


def _sender_dict() -> dict[str, str]:
    raw = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    match = re.match(r"^(?P<name>.*?)\s*<(?P<email>[^>]+)>\s*$", raw)
    if match:
        name = match.group("name").strip().strip('"')
        email = match.group("email").strip()
        sender: dict[str, str] = {"email": email}
        if name:
            sender["name"] = name
        return sender
    if raw and "@" in raw:
        return {"email": raw, "name": "3.R.B Extreme"}
    return {"name": "3.R.B Extreme", "email": "grp3rb@gmail.com"}


def _snippet_without_secrets(text: str) -> str:
    cleaned = re.sub(r"xkeysib-[A-Za-z0-9_-]+", "xkeysib-[redacted]", text or "")
    cleaned = re.sub(
        r"(?i)(api-key|authorization)\s*[:=]\s*\S+",
        r"\1: [redacted]",
        cleaned,
    )
    return cleaned[:_ERROR_BODY_LIMIT]


def _send_via_django(*, to: str, subject: str, body: str, use_smtp: bool) -> None:
    send_kwargs = {
        "subject": subject,
        "message": body,
        "from_email": None,  # Django uses DEFAULT_FROM_EMAIL
        "recipient_list": [to],
        "fail_silently": False,
    }
    if use_smtp:
        send_kwargs["connection"] = get_connection(
            backend=IPV4_SMTP_BACKEND,
            fail_silently=False,
            timeout=_email_timeout(),
        )
    try:
        sent = send_mail(**send_kwargs)
    except Exception as exc:
        logger.warning(
            "smtp send failed host=%s port=%s err=%s",
            getattr(settings, "EMAIL_HOST", ""),
            getattr(settings, "EMAIL_PORT", ""),
            exc,
        )
        raise MailerError(str(exc)) from exc
    if not sent:
        raise MailerError("The email backend did not send the message.")


def _send_via_api(url: str, api_key: str, to: str, subject: str, body: str) -> None:
    payload = json.dumps(
        {
            "sender": _sender_dict(),
            "to": [{"email": to}],
            "subject": subject,
            "textContent": body,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=_email_timeout()) as response:
            if response.status >= 400:
                raise MailerError(f"Email API returned {response.status}.")
    except MailerError:
        raise
    except urllib.error.HTTPError as exc:
        snippet = ""
        try:
            snippet = _snippet_without_secrets(
                exc.read()[:_ERROR_BODY_LIMIT].decode("utf-8", errors="replace")
            )
        except Exception:
            snippet = ""
        detail = f"Email API returned {exc.code}."
        if snippet:
            detail = f"{detail} {snippet}"
        raise MailerError(detail) from exc
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


def queue_platform_email(*, to: str, subject: str, body: str) -> None:
    """Send in this request (max EMAIL_TIMEOUT seconds).

    Daemon threads on gunicorn sync workers are killed when the worker
    returns to its accept loop / is recycled, so Gmail Sent stays empty.
    There is no Celery worker in production. Save first, then call this.
    """
    if not to:
        return
    send_platform_email_quietly(
        to=str(to),
        subject=str(subject or ""),
        body=str(body or ""),
    )
