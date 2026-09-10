from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.common.email_copy import CLIENT_SUBJECTS, HELP_SUBJECTS
from apps.help_tickets.models import ClientTicket, HelpTicket


class HelpTicketCreateTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_valid_payload_persists_and_sends_ack(self):
        response = self.client.post(
            "/api/v1/help/tickets/",
            {
                "name": "Golnar",
                "email": "golnar@example.com",
                "subject_key": "cannot_sign_in",
                "reason": "cannot_sign_in",
                "message": "Need help signing in",
                "locale": "fr",
                "website": "",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        ticket = HelpTicket.objects.get(email="golnar@example.com")
        self.assertEqual(ticket.subject_key, "cannot_sign_in")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["golnar@example.com"])
        self.assertEqual(
            mail.outbox[0].subject,
            HELP_SUBJECTS["cannot_sign_in"]["fr"],
        )

    def test_hp_website_honeypot_does_not_persist(self):
        before = HelpTicket.objects.count()
        response = self.client.post(
            "/api/v1/help/tickets/",
            {
                "name": "Bot",
                "email": "bot@example.com",
                "subject_key": "other_issue",
                "message": "spam",
                "hp_website": "https://spam.example",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(HelpTicket.objects.count(), before)


class TicketReplySubjectTests(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        cache.clear()
        group, _ = Group.objects.get_or_create(name="Administrator")
        self.admin = User.objects.create_user(
            email="admin@example.test",
            first_name="Admin",
            last_name="User",
            password=self.password,
        )
        self.admin.groups.add(group)
        self.client.force_authenticate(self.admin)

    def test_client_reply_sends_staff_subject_in_ticket_locale(self):
        ticket = ClientTicket.objects.create(
            name="Golnar",
            email="golnar@example.com",
            phone="0612345678",
            company="other",
            subject_key="quote_request",
            locale="fr",
            message="Need a quote",
        )
        response = self.client.post(
            f"/api/v1/help/client-tickets/{ticket.pk}/reply/",
            {
                "reply_body": "Merci, nous revenons vers vous.",
                "subject_key": "ticket_reply",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].subject,
            CLIENT_SUBJECTS["ticket_reply"]["fr"],
        )
        self.assertIn("Merci", mail.outbox[0].body)

    def test_help_reply_sends_staff_subject_in_ticket_locale(self):
        ticket = HelpTicket.objects.create(
            reason="cannot_sign_in",
            name="Golnar",
            email="golnar@example.com",
            message="blocked",
            subject_key="cannot_sign_in",
            locale="ar",
        )
        response = self.client.post(
            f"/api/v1/help/tickets/{ticket.pk}/reply/",
            {
                "reply_body": "Your access is restored.",
                "subject_key": "page_blocked",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].subject,
            HELP_SUBJECTS["page_blocked"]["ar"],
        )
        ticket.refresh_from_db()
        self.assertEqual(ticket.reply_subject, HELP_SUBJECTS["page_blocked"]["ar"])
