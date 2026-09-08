from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient


class RateLimitMiddlewareTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_login_returns_429_after_five_requests_per_ip(self):
        for _ in range(5):
            self.client.post("/api/v1/auth/login/", {}, format="json")
        blocked = self.client.post("/api/v1/auth/login/", {}, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(
            blocked.json()["detail"],
            "Trop de tentatives. Réessayez dans 1 minute.",
        )

    def test_health_check_is_not_rate_limited(self):
        for _ in range(8):
            response = self.client.get("/api/health/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "ok")

    def test_help_tickets_return_429_after_three_requests_per_hour(self):
        for _ in range(3):
            self.client.post("/api/v1/help/tickets/", {}, format="json")
        blocked = self.client.post("/api/v1/help/tickets/", {}, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(
            blocked.json()["detail"],
            "Trop de tentatives. Réessayez dans 1 heure.",
        )

    def test_help_tickets_block_after_ten_daily_attempts(self):
        cache.set("rl:tickets:daily:127.0.0.1", 10, timeout=86400)
        blocked = self.client.post("/api/v1/help/tickets/", {}, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(
            blocked.json()["detail"],
            "Trop de tentatives. Réessayez dans 24 heures.",
        )

    def test_help_ticket_honeypot_returns_fake_success_without_saving(self):
        from apps.help_tickets.models import HelpTicket

        before = HelpTicket.objects.count()
        response = self.client.post(
            "/api/v1/help/tickets/",
            {
                "reason": "other",
                "name": "Bot",
                "email": "bot@example.com",
                "message": "spam",
                "website": "https://spam.example",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"detail": "Votre message a été envoyé.", "id": "fake"},
        )
        self.assertEqual(HelpTicket.objects.count(), before)
