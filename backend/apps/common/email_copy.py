"""Localized email subjects and bodies. Keys match the frontend i18n sources."""

from __future__ import annotations

LOCALES = ("fr", "en", "ar")
DEFAULT_LOCALE = "fr"

CLIENT_SUBJECTS = {
    "ticket_reply": {
        "en": "Reply to your ticket on 3.R.B Extreme",
        "fr": "Réponse à votre ticket sur 3.R.B Extreme",
        "ar": "الرد على تذكرتك على 3.R.B Extreme",
    },
    "quote_request": {
        "en": "Quote request — 3.R.B Extreme",
        "fr": "Demande de devis — 3.R.B Extreme",
        "ar": "طلب عرض سعر — 3.R.B Extreme",
    },
    "partnership": {
        "en": "Partnership request — 3.R.B Extreme",
        "fr": "Demande de partenariat — 3.R.B Extreme",
        "ar": "طلب شراكة — 3.R.B Extreme",
    },
    "complaint": {
        "en": "Complaint — 3.R.B Extreme",
        "fr": "Réclamation — 3.R.B Extreme",
        "ar": "شكوى — 3.R.B Extreme",
    },
    "technical_info": {
        "en": "Information request — 3.R.B Extreme",
        "fr": "Demande d’information — 3.R.B Extreme",
        "ar": "طلب معلومات — 3.R.B Extreme",
    },
    "other_request": {
        "en": "Other request — 3.R.B Extreme",
        "fr": "Autre demande — 3.R.B Extreme",
        "ar": "طلب آخر — 3.R.B Extreme",
    },
}

HELP_SUBJECTS = {
    "cannot_sign_in": {
        "en": "I cannot sign in",
        "fr": "Je n’arrive pas à me connecter",
        "ar": "لا أستطيع تسجيل الدخول",
    },
    "page_blocked": {
        "en": "A page is blocked or access is denied",
        "fr": "Une page est bloquée ou l’accès est refusé",
        "ar": "صفحة محظورة أو الوصول مرفوض",
    },
    "data_not_saving": {
        "en": "My data is not saving",
        "fr": "Mes données ne s’enregistrent pas",
        "ar": "بياناتي لا تُحفظ",
    },
    "display_issue": {
        "en": "Display or language problem",
        "fr": "Problème d’affichage ou de langue",
        "ar": "مشكلة في العرض أو اللغة",
    },
    "other_issue": {
        "en": "Other issue",
        "fr": "Autre problème",
        "ar": "مشكلة أخرى",
    },
}

TICKET_RECEIVED = {
    "en": (
        "Hello {name},\n\n"
        "We received your message on 3.R.B Extreme.\n"
        "Subject: {subject}\n\n"
        "Our team will get back to you as soon as possible.\n\n"
        "3.R.B Extreme"
    ),
    "fr": (
        "Bonjour {name},\n\n"
        "Nous avons bien reçu votre message sur 3.R.B Extreme.\n"
        "Objet : {subject}\n\n"
        "Notre équipe vous répondra dans les plus brefs délais.\n\n"
        "3.R.B Extreme"
    ),
    "ar": (
        "مرحباً {name}،\n\n"
        "استلمنا رسالتك على 3.R.B Extreme.\n"
        "الموضوع: {subject}\n\n"
        "سيتواصل فريقنا معك في أقرب وقت.\n\n"
        "3.R.B Extreme"
    ),
}

RESET_SUBJECT = {
    "en": "Your 3.R.B Extreme sign-in code",
    "fr": "Votre code de connexion 3.R.B Extreme",
    "ar": "رمز الدخول إلى 3.R.B Extreme",
}

RESET_BODY = {
    "en": (
        "Hello,\n\n"
        "Your 6-digit code to reset your password is: {code}\n"
        "It expires in 15 minutes. It is not a password.\n\n"
        "If you did not ask for this, ignore this email.\n\n"
        "3.R.B Extreme"
    ),
    "fr": (
        "Bonjour,\n\n"
        "Votre code à 6 chiffres pour réinitialiser le mot de passe est : {code}\n"
        "Il expire dans 15 minutes. Ce n’est pas un mot de passe.\n\n"
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.\n\n"
        "3.R.B Extreme"
    ),
    "ar": (
        "مرحباً،\n\n"
        "رمزك المكوّن من 6 أرقام لإعادة تعيين كلمة المرور: {code}\n"
        "ينتهي خلال 15 دقيقة. هذا ليس كلمة مرور.\n\n"
        "إذا لم تطلب ذلك، تجاهل هذا البريد.\n\n"
        "3.R.B Extreme"
    ),
}


def normalize_locale(value: str | None) -> str:
    locale = (value or DEFAULT_LOCALE).lower()[:2]
    return locale if locale in LOCALES else DEFAULT_LOCALE


def client_subject(key: str, locale: str | None) -> str:
    row = CLIENT_SUBJECTS.get(key) or CLIENT_SUBJECTS["other_request"]
    loc = normalize_locale(locale)
    return row.get(loc) or row[DEFAULT_LOCALE]


def help_subject(key: str, locale: str | None) -> str:
    row = HELP_SUBJECTS.get(key) or HELP_SUBJECTS["other_issue"]
    loc = normalize_locale(locale)
    return row.get(loc) or row[DEFAULT_LOCALE]


def ticket_received_body(name: str, subject: str, locale: str | None) -> str:
    loc = normalize_locale(locale)
    template = TICKET_RECEIVED.get(loc) or TICKET_RECEIVED[DEFAULT_LOCALE]
    return template.format(name=name or "", subject=subject)


def reset_subject(locale: str | None) -> str:
    loc = normalize_locale(locale)
    return RESET_SUBJECT.get(loc) or RESET_SUBJECT[DEFAULT_LOCALE]


def reset_body(code: str, locale: str | None) -> str:
    loc = normalize_locale(locale)
    template = RESET_BODY.get(loc) or RESET_BODY[DEFAULT_LOCALE]
    return template.format(code=code)
