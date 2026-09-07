# apps/accounts/tests/test_preferences.py
"""
Tests for the per-user preferences endpoint and its validation.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import UserPreference
from apps.accounts.serializers import DEFAULT_PREFERENCES, validate_preferences

User = get_user_model()


class ValidatePreferencesTests(TestCase):
    """Pure validation-layer tests (no database)."""

    def test_valid_payload_passes(self):
        cleaned = validate_preferences({"defaultPageSize": "50", "requireMFA": True})
        self.assertEqual(cleaned, {"defaultPageSize": "50", "requireMFA": True})

    def test_unknown_key_rejected(self):
        with self.assertRaises(Exception) as ctx:
            validate_preferences({"defaultPageSize": "25", "typoKey": 1})
        self.assertIn("typoKey", str(ctx.exception))

    def test_wrong_type_rejected(self):
        with self.assertRaises(Exception):
            validate_preferences({"requireMFA": "yes"})

    def test_choice_outside_options_rejected(self):
        with self.assertRaises(Exception):
            validate_preferences({"defaultDensity": "spacious"})

    def test_int_bounds_enforced(self):
        with self.assertRaises(Exception):
            validate_preferences({"defaultWorkingDays": 0})
        with self.assertRaises(Exception):
            validate_preferences({"defaultWorkingDays": 32})
        self.assertEqual(
            validate_preferences({"defaultWorkingDays": 26}), {"defaultWorkingDays": 26}
        )

    def test_non_dict_rejected(self):
        with self.assertRaises(Exception):
            validate_preferences(["defaultPageSize"])


class UserPreferencesApiTests(TestCase):
    """Endpoint behavior: merged defaults, partial update, reset, isolation."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="prefs@example.com",
            password="testpass123",
            first_name="Pref",
            last_name="User",
        )
        self.other = User.objects.create_user(
            email="other@example.com",
            password="testpass123",
            first_name="Other",
            last_name="User",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/accounts/me/preferences/"

    def test_get_returns_defaults_when_nothing_stored(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["preferences"], DEFAULT_PREFERENCES)

    def test_put_validates_merges_and_persists(self):
        response = self.client.put(
            self.url,
            {"preferences": {"defaultPageSize": "100", "requireMFA": True}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        prefs = response.data["data"]["preferences"]
        self.assertEqual(prefs["defaultPageSize"], "100")
        self.assertTrue(prefs["requireMFA"])
        # Untouched keys keep their defaults
        self.assertEqual(prefs["defaultDensity"], "comfortable")

        record = UserPreference.objects.get(user=self.user)
        self.assertEqual(record.values["defaultPageSize"], "100")

        # Persists across reads
        response = self.client.get(self.url)
        self.assertEqual(response.data["data"]["preferences"]["defaultPageSize"], "100")

    def test_put_rejects_unknown_key(self):
        response = self.client.put(self.url, {"preferences": {"nope": 1}}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_delete_resets_to_defaults(self):
        self.client.put(self.url, {"preferences": {"defaultPageSize": "100"}}, format="json")
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["preferences"], DEFAULT_PREFERENCES)

    def test_preferences_are_isolated_per_user(self):
        self.client.put(self.url, {"preferences": {"defaultPageSize": "100"}}, format="json")
        self.client.force_authenticate(user=self.other)
        response = self.client.get(self.url)
        self.assertEqual(response.data["data"]["preferences"]["defaultPageSize"], "25")

    def test_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 401)
