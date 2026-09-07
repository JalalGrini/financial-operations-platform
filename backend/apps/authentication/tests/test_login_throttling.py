"""Rate limiting for login and for the anonymous health endpoints.

WHAT THIS COVERS THAT THE LOCKOUT DOES NOT
------------------------------------------
Cycle 3 added a per-(email, IP) lockout in `LoginView`. That defeats the naive
attack: one host guessing one account repeatedly. It explicitly does NOT defeat
either of the two attacks below, because in both of them no single
(email, IP) pair ever reaches the failure threshold:

1. **IP rotation against one account.** An attacker with a botnet or proxy pool
   sends one guess per IP. Every request creates a brand new lockout row with a
   count of 1, so the lockout never fires and guessing is unlimited.

2. **Credential stuffing from one host.** An attacker with a breach dump tries
   one password against thousands of different accounts. Each (email, IP) pair
   is used once, so again the lockout never fires.

Defeating (1) requires a limit keyed on the *email* across all IPs. Defeating
(2) requires a limit keyed on the *IP* across all emails. The lockout is keyed
on the pair, so it can catch neither.

The health endpoints are covered here too: `DatabaseHealthView` is anonymous and
executes a real query on every hit, so an unauthenticated caller can generate
unbounded database load.
"""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

LOGIN_URL = "/api/v1/auth/login/"
HEALTH_URL = "/api/v1/health/"
DATABASE_HEALTH_URL = "/api/v1/health/database/"

CORRECT_PASSWORD = "CorrectHorseBattery1!"
WRONG_PASSWORD = "definitely-not-the-password"


def make_user(email="victim@example.com", password=CORRECT_PASSWORD):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        last_name="User",
    )


class DistributedLoginAttackTests(APITestCase):
    """Attack 1: one account, many source addresses."""

    def setUp(self):
        cache.clear()
        self.user = make_user()

    def test_rotating_ip_addresses_does_not_grant_unlimited_guesses(self):
        """A fresh IP per request must not reset the attacker's budget.

        Each request below comes from a different address, so the per-(email, IP)
        lockout sees a first offence every single time and never engages. Without
        a limit keyed on the email itself, this loop can run forever.
        """
        statuses = []
        for index in range(40):
            response = self.client.post(
                LOGIN_URL,
                {"email": self.user.email, "password": WRONG_PASSWORD},
                format="json",
                REMOTE_ADDR=f"198.51.100.{index}",
            )
            statuses.append(response.status_code)

        self.assertIn(
            status.HTTP_429_TOO_MANY_REQUESTS,
            statuses,
            "40 guesses against one account from 40 different IPs were all "
            "accepted. The per-(email, IP) lockout cannot see this attack; a "
            "limit keyed on the email is required.",
        )


class CredentialStuffingTests(APITestCase):
    """Attack 2: one source address, many accounts."""

    def setUp(self):
        cache.clear()

    def test_one_host_cannot_spray_a_password_across_many_accounts(self):
        """One IP trying one password against many accounts must be limited.

        Every email is distinct, so no (email, IP) pair is ever reused and the
        lockout never engages, no matter how many accounts are attempted.
        """
        statuses = []
        for index in range(40):
            response = self.client.post(
                LOGIN_URL,
                {"email": f"user{index}@example.com", "password": WRONG_PASSWORD},
                format="json",
                REMOTE_ADDR="203.0.113.9",
            )
            statuses.append(response.status_code)

        self.assertIn(
            status.HTTP_429_TOO_MANY_REQUESTS,
            statuses,
            "One host attempted 40 different accounts unimpeded. This is the "
            "shape of a credential-stuffing run against a breach dump.",
        )


class LegitimateUsersAreNotPunishedTests(APITestCase):
    """Rate limiting must not break ordinary use.

    A limit that locks out real users who mistype a password twice is a denial
    of service against your own customers, so this pins the friendly path.
    """

    def setUp(self):
        cache.clear()
        self.user = make_user(email="real.person@example.com")

    def test_a_few_typos_followed_by_the_correct_password_still_succeeds(self):
        for _ in range(3):
            self.client.post(
                LOGIN_URL,
                {"email": self.user.email, "password": WRONG_PASSWORD},
                format="json",
                REMOTE_ADDR="192.0.2.50",
            )

        response = self.client.post(
            LOGIN_URL,
            {"email": self.user.email, "password": CORRECT_PASSWORD},
            format="json",
            REMOTE_ADDR="192.0.2.50",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            "Three typos then the right password must still log a real user in.",
        )


class HealthEndpointThrottlingTests(APITestCase):
    """The database health endpoint runs a query for any anonymous caller."""

    def test_the_anonymous_database_health_endpoint_is_rate_limited(self):
        statuses = []
        for _ in range(120):
            response = self.client.get(DATABASE_HEALTH_URL, REMOTE_ADDR="198.51.100.77")
            statuses.append(response.status_code)
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                break

        self.assertIn(
            status.HTTP_429_TOO_MANY_REQUESTS,
            statuses,
            "An anonymous caller drove 120 real database queries. This endpoint "
            "is an unauthenticated database-load amplifier.",
        )

    def test_the_plain_health_endpoint_stays_available_for_probes(self):
        """The liveness probe must never be throttled.

        `HealthView` touches no database and exists so orchestrators can ask
        'is this process alive'. Rate limiting it would cause the platform to be
        restarted under load, turning a traffic spike into an outage.
        """
        for _ in range(120):
            response = self.client.get(HEALTH_URL, REMOTE_ADDR="198.51.100.78")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_the_plain_health_endpoint_accepts_no_trailing_slash(self):
        response = self.client.get("/api/v1/health", REMOTE_ADDR="198.51.100.79")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_root_health_alias_returns_200(self):
        response = self.client.get("/health/", REMOTE_ADDR="198.51.100.80")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
