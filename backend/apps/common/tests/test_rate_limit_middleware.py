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
