from io import BytesIO

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from apps.accounts.models import User


class AccountManagementSecurityTests(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        groups = {
            name: Group.objects.create(name=name)
            for name in ("Administrator", "Assistant", "Director")
        }
        self.admin = User.objects.create_user(
            email="admin@example.test", first_name="Admin", last_name="User", password=self.password
        )
        self.admin.groups.add(groups["Administrator"])
        self.assistant = User.objects.create_user(
            email="assistant@example.test",
            first_name="Assistant",
            last_name="User",
            password=self.password,
        )
        self.assistant.groups.add(groups["Assistant"])
        self.director = User.objects.create_user(
            email="director@example.test",
            first_name="Director",
            last_name="User",
            password=self.password,
        )
        self.director.groups.add(groups["Director"])

    def test_account_governance_role_matrix(self):
        payload = {
            "email": "new.director@example.test",
            "first_name": "New",
            "last_name": "Director",
            "role": "Director",
            "temporary_password": "UniquePass789!",
        }
        self.assertIn(self.client.post("/api/v1/accounts/users/", payload).status_code, (401, 403))
        for user in (self.assistant, self.director):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post("/api/v1/accounts/users/", payload).status_code, 403)
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/accounts/users/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        created = User.objects.get(email=payload["email"])
        self.assertTrue(created.must_change_password)
        self.assertTrue(created.check_password(payload["temporary_password"]))
        self.assertEqual(list(created.groups.values_list("name", flat=True)), ["Director"])
        self.assertNotIn(payload["temporary_password"], str(response.data))

    def test_self_profile_rejects_security_field_tampering(self):
        self.client.force_authenticate(self.assistant)
        response = self.client.patch(
            "/api/v1/accounts/me/profile/",
            {"first_name": "Safe", "is_superuser": True, "is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assistant.refresh_from_db()
        self.assertFalse(self.assistant.is_superuser)
        self.assertTrue(self.assistant.is_active)

    def test_admin_cannot_make_superuser_or_deactivate_self(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/v1/accounts/users/{self.assistant.pk}/", {"is_superuser": True}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(
            f"/api/v1/accounts/users/{self.admin.pk}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_temporary_password_sets_forced_change_flag(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/v1/accounts/users/{self.assistant.pk}/temporary-password/",
            {"temporary_password": "Replacement789!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assistant.refresh_from_db()
        self.assertTrue(self.assistant.must_change_password)
        self.assertTrue(self.assistant.check_password("Replacement789!"))

    def test_avatar_rejects_non_image_and_requires_authentication(self):
        self.client.force_authenticate(self.assistant)
        bad = SimpleUploadedFile("avatar.jpg", b"not an image", content_type="image/jpeg")
        self.assertEqual(
            self.client.put(
                "/api/v1/accounts/me/avatar/", {"avatar": bad}, format="multipart"
            ).status_code,
            400,
        )
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get(f"/api/v1/accounts/users/{self.assistant.pk}/avatar/").status_code,
            (401, 403),
        )

    def test_valid_avatar_upload_private_delivery_and_remove(self):
        image = Image.new("RGB", (128, 128), "blue")
        data = BytesIO()
        image.save(data, format="JPEG")
        data.seek(0)
        upload = SimpleUploadedFile("avatar.jpg", data.read(), content_type="image/jpeg")
        self.client.force_authenticate(self.assistant)
        response = self.client.put(
            "/api/v1/accounts/me/avatar/", {"avatar": upload}, format="multipart"
        )
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.get(f"/api/v1/accounts/users/{self.assistant.pk}/avatar/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        # Close FileResponse resources before testing deletion. Calling the
        # public response.close() here also emits request_finished, which closes
        # the active PostgreSQL TestCase connection on Windows; invoke only the
        # registered file-resource closers instead.
        for closer in response._resource_closers:
            closer()
        response._resource_closers.clear()
        self.assertEqual(self.client.delete("/api/v1/accounts/me/avatar/").status_code, 204)
