"""Release identity and authentication role contract regressions."""

import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APISimpleTestCase, APITestCase

from config.release import RELEASE_FILE, RELEASE_METADATA

User = get_user_model()


class ReleaseIdentityTests(APISimpleTestCase):
    def test_both_supported_version_routes_return_the_same_safe_identity(self):
        system_response = self.client.get("/api/v1/system/version/")
        health_response = self.client.get("/api/v1/health/version/")

        self.assertEqual(system_response.status_code, status.HTTP_200_OK)
        self.assertEqual(health_response.status_code, status.HTTP_200_OK)
        self.assertEqual(system_response.data, health_response.data)
        data = system_response.data["data"]
        # Asserted against the canonical manifest rather than a literal. This
        # previously hardcoded "EFOP-36.0.0-RC7" and so went stale on the next
        # release, and - worse - the hardcoded form could not distinguish "the
        # endpoint reports the wrong id" from "RELEASE.json moved on", which is
        # exactly the ambiguity that hid the key-name mismatch this replaces.
        self.assertEqual(data["release_id"], RELEASE_METADATA["release_id"])
        self.assertNotIn("password", str(data).lower())
        self.assertNotIn("secret", str(data).lower())

    def test_release_identity_actually_comes_from_the_manifest(self):
        """The check above alone would still pass if RELEASE.json were
        unreadable, since both sides would be the "EFOP-DEVELOPMENT" default.
        That is the failure mode that shipped: config.release looked up keys
        RELEASE.json does not use, so a tagged release reported itself as an
        untagged development build. Pin the manifest as the real source.
        """
        manifest = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))
        expected = manifest.get("release_id") or manifest["release"]

        response = self.client.get("/api/v1/system/version/")

        self.assertEqual(response.data["data"]["release_id"], expected)
        self.assertNotEqual(expected, "EFOP-DEVELOPMENT")


class AuthenticationRolePayloadTests(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        cache.clear()

    def _login(self, client, email):
        client.get("/api/v1/auth/csrf/")
        csrf = client.cookies["csrftoken"].value
        return client.post(
            "/api/v1/auth/login/",
            {"email": email, "password": self.password},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
        )

    def test_group_roles_and_permissions_are_present_in_login_and_me(self):
        role = Group.objects.create(name="Director")
        user = User.objects.create_user(email="director@example.test", password=self.password)
        user.groups.add(role)
        client = APIClient(enforce_csrf_checks=True)

        login = self._login(client, user.email)
        me = client.get("/api/v1/auth/me/")

        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        self.assertEqual(me.status_code, status.HTTP_200_OK, me.data)
        for response in (login, me):
            payload = response.data["data"]["user"]
            self.assertEqual(payload["roles"], ["Director"])
            self.assertIsInstance(payload["permissions"], list)

    def test_superuser_is_an_effective_administrator_without_group(self):
        user = User.objects.create_superuser(email="superuser@example.test", password=self.password)
        client = APIClient(enforce_csrf_checks=True)
        login = self._login(client, user.email)

        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        payload = login.data["data"]["user"]
        self.assertIn("Administrator", payload["roles"])
