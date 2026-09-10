"""Outbound ticket replies via email, SMS, or WhatsApp."""

from __future__ import annotations

import logging
import threading

from django.conf import settings

from apps.common.mailer import MailerError, send_platform_email


logger = logging.getLogger(__name__)


class MessagingError(Exception):
    """Raised when a ticket reply cannot be delivered."""


def _twilio_client():
    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "") or ""
    auth_token = getattr(settings, "TWILIO_AUTH_TOKEN", "") or ""
    if not account_sid or not auth_token:
        raise MessagingError("Twilio credentials are not configured.")
    try:
        from twilio.rest import Client
    except ImportError as exc:
        raise MessagingError("Twilio is not installed.") from exc
    return Client(account_sid, auth_token)


def _deliver_in_background(fn, *, name: str) -> None:
    threading.Thread(target=fn, daemon=True, name=name).start()


def send_ticket_reply(
    channel: str,
    *,
    subject: str,
    body: str,
    email: str | None = None,
    phone: str | None = None,
) -> None:
    channel = (channel or "email").lower()
    if channel == "email":
        if not email:
            raise MessagingError("An email address is required.")
        try:
            send_platform_email(
                to=email, subject=subject or "3.R.B Extreme", body=body
            )
        except MailerError as exc:
            raise MessagingError(str(exc)) from exc
        return

    if channel not in {"sms", "whatsapp"}:
        raise MessagingError(f"Unsupported reply channel: {channel}")
    if not phone:
        raise MessagingError("A phone number is required for SMS or WhatsApp.")

    client = _twilio_client()
    if channel == "sms":
        from_number = getattr(settings, "TWILIO_PHONE_NUMBER", "") or ""
        if not from_number:
            raise MessagingError("TWILIO_PHONE_NUMBER is not configured.")

        def _send_sms() -> None:
            try:
                client.messages.create(body=body, from_=from_number, to=phone)
            except Exception as exc:
                logger.warning("sms reply not sent err=%s", exc)

        _deliver_in_background(_send_sms, name="ticket-sms")
        return

    from_whatsapp = getattr(settings, "TWILIO_WHATSAPP_NUMBER", "") or "whatsapp:+14155238886"
    to_whatsapp = phone if str(phone).startswith("whatsapp:") else f"whatsapp:{phone}"

    def _send_whatsapp() -> None:
        try:
            client.messages.create(body=body, from_=from_whatsapp, to=to_whatsapp)
        except Exception as exc:
            logger.warning("whatsapp reply not sent err=%s", exc)

    _deliver_in_background(_send_whatsapp, name="ticket-whatsapp")
