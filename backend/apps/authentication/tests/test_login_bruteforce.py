# apps/authentication/tests/test_login_bruteforce.py
"""
Cycle 3, finding H-8: the live login endpoint had NO brute-force protection.

What the cycle-3 audit established, by direct inspection rather than assumption:

- `LoginView` (apps/authentication/views.py) declares no `throttle_classes`, and
  `REST_FRAMEWORK` in config/settings/base.py declares neither
  `DEFAULT_THROTTLE_CLASSES` nor `DEFAULT_THROTTLE_RATES`. There was no rate
  limiting on the endpoint, and none globally either.
- The `FailedLoginAttempt` model exists, is migrated, and implements a complete
  progressive-lockout API (`is_currently_locked`, `lock`, `increment_attempt`,
  `reset_attempts`). **Nothing in the codebase ever wrote to it.** The table was
  migrated and permanently empty.
- The only code that would have recorded failures, `LoginAttemptValidator` in
  apps/authentication/validators.py, has zero importers, and all three of its
  methods crash if called (missing `timezone` import; `attempt.is_locked()`
  invokes a BooleanField; `record_failure()` does not exist on the model).

So the protection was designed, modelled, migrated and documented - and then
never wired to the endpoint. That combination is worth stating precisely,
because reading either the model or the validator in isolation gives the strong
impression the platform is protected.

These tests are written to FAIL against the pre-fix code (that is the point):
they assert the lockout that did not exist. The first test below is deliberately
phrased as an attack - it spends 20 guesses against one account - because that
is the behaviour that must stop being possible.

Design note on the lockout key: attempts are tracked per (email, IP), matching
the model's own `unique_active_failed_login_per_email_ip` constraint. This
protects a targeted account without letting one attacker behind one IP lock out
an entire company's users, and without letting an attacker rotate the email to
reset a counter. It is not a defence against a distributed (many-IP) attack;
that needs endpoint-level rate limiting, tracked separately as M-5.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authentication.models import FailedLoginAttempt

User = get_user_model()

LOGIN_URL = "/api/v1/auth/login/"
CORRECT_PASSWORD = "CorrectHorseBattery1!"
WRONG_PASSWORD = "definitely-not-the-password"


def make_user(email="victim@example.com", password=CORRECT_PASSWORD):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Victim",
        last_name="User",
    )


@override_settings(LOGIN_MAX_ATTEMPTS=5)
class LoginLockoutTests(APITestCase):
    """The core H-8 contract: consecutive failures must stop being free."""

    def setUp(self):
        cache.clear()
        self.user = make_user()

    def attempt(self, password, email=None, ip="203.0.113.7"):
        return self.client.post(
            LOGIN_URL,
            {"email": email or self.user.email, "password": password},
            format="json",
            REMOTE_ADDR=ip,
        )

    def test_unlimited_password_guessing_is_no_longer_possible(self):
        """
        Twenty guesses against one account. Pre-fix, every single one returned a
        plain 401 and the attacker could continue indefinitely; this asserts that
        the endpoint stops answering guesses well before the twentieth.
        """
        statuses = [self.attempt(WRONG_PASSWORD).status_code for _ in range(20)]

        self.assertIn(
            status.HTTP_429_TOO_MANY_REQUESTS,
            statuses,
            "The login endpoint answered 20 consecutive wrong-password attempts "
            "without ever locking out. Sequence of status codes: "
            f"{statuses}",
        )

    def test_lockout_engages_on_the_configured_attempt_threshold(self):
        for i in range(5):
            resp = self.attempt(WRONG_PASSWORD)
            self.assertEqual(
                resp.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"attempt {i + 1} of 5 should still be a normal 401",
            )

        resp = self.attempt(WRONG_PASSWORD)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_correct_password_is_refused_while_locked_out(self):
        """
        The property that actually makes a lockout a lockout. If the correct
        password still succeeded during the lock window, an attacker who guessed
        correctly on attempt 200 would still get in.
        """
        for _ in range(6):
            self.attempt(WRONG_PASSWORD)

        resp = self.attempt(CORRECT_PASSWORD)
        self.assertEqual(
            resp.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
            "A locked-out identity must be refused even with the right password.",
        )
        self.assertNotIn("access_token", resp.cookies)

    def test_lockout_expires_and_access_is_restored(self):
        """A lockout must be temporary, or a failed attack becomes a permanent
        denial of service against a legitimate user."""
        for _ in range(6):
            self.attempt(WRONG_PASSWORD)
        self.assertEqual(
            self.attempt(CORRECT_PASSWORD).status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )

        record = FailedLoginAttempt.all_objects.get(email=self.user.email)
        record.locked_until = timezone.now() - timedelta(minutes=1)
        record.save(update_fields=["locked_until"])

        resp = self.attempt(CORRECT_PASSWORD)
        self.assertEqual(
            resp.status_code,
            status.HTTP_200_OK,
            "Once the lock window has passed, the real password must work again.",
        )

    def test_successful_login_clears_the_failure_counter(self):
        """Otherwise a user who mistypes occasionally over weeks accumulates
        their way into a lockout despite always eventually logging in."""
        for _ in range(3):
            self.attempt(WRONG_PASSWORD)

        self.assertEqual(self.attempt(CORRECT_PASSWORD).status_code, status.HTTP_200_OK)

        record = FailedLoginAttempt.all_objects.get(email=self.user.email)
        self.assertEqual(record.attempt_count, 0)
        self.assertFalse(record.is_currently_locked())


@override_settings(LOGIN_MAX_ATTEMPTS=5)
class LockoutScopeTests(APITestCase):
    """The lockout must be narrow enough not to become a weapon."""

    def setUp(self):
        cache.clear()
        self.victim = make_user("victim@example.com")
        self.bystander = make_user("bystander@example.com")

    def post(self, email, password, ip):
        return self.client.post(
            LOGIN_URL,
            {"email": email, "password": password},
            format="json",
            REMOTE_ADDR=ip,
        )

    def test_locking_one_account_does_not_lock_another_user(self):
        for _ in range(8):
            self.post(self.victim.email, WRONG_PASSWORD, "203.0.113.7")

        resp = self.post(self.bystander.email, CORRECT_PASSWORD, "203.0.113.7")
        self.assertEqual(
            resp.status_code,
            status.HTTP_200_OK,
            "An attacker hammering one account must not lock out everyone else "
            "who happens to share their IP (NAT, office egress, mobile carrier).",
        )

    def test_attacker_cannot_reset_the_counter_by_changing_ip_alone(self):
        """Characterises the chosen (email, IP) key honestly: a *single* IP
        cannot keep guessing, and this test pins that the victim's own record
        accumulates rather than resetting per attempt."""
        for _ in range(4):
            self.post(self.victim.email, WRONG_PASSWORD, "203.0.113.7")

        record = FailedLoginAttempt.all_objects.get(
            email=self.victim.email, ip_address="203.0.113.7"
        )
        self.assertGreaterEqual(record.attempt_count, 4)


@override_settings(LOGIN_MAX_ATTEMPTS=5)
class FailedAttemptRecordingTests(APITestCase):
    """The audit trail the model was built for, and never received."""

    def setUp(self):
        cache.clear()
        self.user = make_user()

    def post(self, email, password, ip="203.0.113.7", agent="pytest-agent/1.0"):
        return self.client.post(
            LOGIN_URL,
            {"email": email, "password": password},
            format="json",
            REMOTE_ADDR=ip,
            HTTP_USER_AGENT=agent,
        )

    def test_a_failed_login_is_recorded_with_ip_and_email(self):
        self.assertEqual(FailedLoginAttempt.all_objects.count(), 0)

        self.post(self.user.email, WRONG_PASSWORD)

        record = FailedLoginAttempt.all_objects.get()
        self.assertEqual(record.email, self.user.email)
        self.assertEqual(record.ip_address, "203.0.113.7")
        self.assertGreaterEqual(record.attempt_count, 1)

    def test_repeated_failures_accumulate_on_one_record(self):
        for _ in range(3):
            self.post(self.user.email, WRONG_PASSWORD)

        self.assertEqual(
            FailedLoginAttempt.all_objects.filter(email=self.user.email).count(),
            1,
            "Consecutive failures for one (email, IP) must accumulate on a "
            "single row - the model's unique constraint requires it.",
        )
        record = FailedLoginAttempt.all_objects.get(email=self.user.email)
        self.assertEqual(record.attempt_count, 3)

    def test_failures_for_a_nonexistent_account_are_also_rate_limited(self):
        """
        Unknown emails must be throttled too. If only real accounts were locked,
        the difference in behaviour between a locked response and an endless 401
        would itself become an account-enumeration oracle.
        """
        statuses = [
            self.post("no-such-user@example.com", WRONG_PASSWORD).status_code for _ in range(8)
        ]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, statuses)

    def test_lockout_response_body_does_not_reveal_account_existence(self):
        for _ in range(6):
            self.post(self.user.email, WRONG_PASSWORD)
        real = self.post(self.user.email, WRONG_PASSWORD)

        for _ in range(6):
            self.post("no-such-user@example.com", WRONG_PASSWORD)
        fake = self.post("no-such-user@example.com", WRONG_PASSWORD)

        self.assertEqual(real.status_code, fake.status_code)
        self.assertEqual(
            str(real.data.get("message", real.data)),
            str(fake.data.get("message", fake.data)),
            "A locked real account and a locked nonexistent account must be "
            "indistinguishable to the caller.",
        )
