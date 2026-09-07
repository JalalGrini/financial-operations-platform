"""Outbound ticket replies via email, SMS, or WhatsApp."""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail


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
        send_mail(
            subject=subject or "EFOP",
            message=body,
            from_email=None,
            recipient_list=[email],
            fail_silently=False,
        )
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
        client.messages.create(body=body, from_=from_number, to=phone)
        return

    from_whatsapp = getattr(settings, "TWILIO_WHATSAPP_NUMBER", "") or "whatsapp:+14155238886"
    to_whatsapp = phone if str(phone).startswith("whatsapp:") else f"whatsapp:{phone}"
    client.messages.create(body=body, from_=from_whatsapp, to=to_whatsapp)
