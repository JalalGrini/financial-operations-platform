"""Release 33 archive listing contract across core resources."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.configuration.models import PaymentMethod
from apps.personnel.models import PersonnelPerson

User = get_user_model()


class ArchiveVisibilityRelease33Tests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="archive-r33@example.test", password="testpass123"
        )
        role, _ = Group.objects.get_or_create(name="Administrator")
        cls.admin.groups.add(role)

    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.admin)
        self.active = PersonnelPerson.objects.create(
            first_name="Active", last_name="Needle", cin="AR330001"
        )
        self.archived = PersonnelPerson.objects.create(
            first_name="Archived", last_name="Needle", cin="AR330002"
        )
        self.other_archived = PersonnelPerson.objects.create(
            first_name="Archived", last_name="Haystack", cin="AR330003"
        )
        self.archived.archive(user=self.admin)
        self.other_archived.archive(user=self.admin)

    @staticmethod
    def ids(response):
        return {str(row["id"]) for row in response.data["results"]}

    def test_default_and_active_state_only_return_active_rows(self):
        default = self.client_api.get("/api/v1/personnel/persons/")
        explicit = self.client_api.get("/api/v1/personnel/persons/", {"archive_state": "active"})
        self.assertEqual(default.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(default), self.ids(explicit))
        self.assertIn(str(self.active.id), self.ids(default))
        self.assertNotIn(str(self.archived.id), self.ids(default))

    def test_archived_state_returns_only_archived_rows_with_annotations(self):
        response = self.client_api.get("/api/v1/personnel/persons/", {"archive_state": "archived"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.ids(response), {str(self.archived.id), str(self.other_archived.id)})
        for row in response.data["results"]:
            self.assertTrue(row["is_archived"])
            self.assertIn("active_employments_count", row)
            self.assertIn("has_active_cnss", row)

    def test_all_state_returns_active_and_archived(self):
        response = self.client_api.get("/api/v1/personnel/persons/", {"archive_state": "all"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            {str(self.active.id), str(self.archived.id), str(self.other_archived.id)}
            <= self.ids(response)
        )

    def test_search_scope_survives_archived_visibility_filter(self):
        response = self.client_api.get(
            "/api/v1/personnel/persons/",
            {"archive_state": "archived", "search": "Needle"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.ids(response), {str(self.archived.id)})

    def test_legacy_is_archived_parameter_remains_compatible(self):
        archived = self.client_api.get("/api/v1/personnel/persons/", {"is_archived": "true"})
        active = self.client_api.get("/api/v1/personnel/persons/", {"is_archived": "false"})
        self.assertIn(str(self.archived.id), self.ids(archived))
        self.assertNotIn(str(self.active.id), self.ids(archived))
        self.assertIn(str(self.active.id), self.ids(active))

    def test_invalid_archive_state_is_a_400(self):
        response = self.client_api.get("/api/v1/personnel/persons/", {"archive_state": "sometimes"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("archive_state", response.data["errors"])

    def test_archive_then_list_then_restore_round_trip(self):
        target = PersonnelPerson.objects.create(
            first_name="Round", last_name="Trip", cin="AR330004"
        )
        archive_response = self.client_api.post(
            f"/api/v1/personnel/persons/{target.id}/archive/", {}, format="json"
        )
        self.assertEqual(archive_response.status_code, status.HTTP_200_OK)
        archived_list = self.client_api.get(
            "/api/v1/personnel/persons/", {"archive_state": "archived"}
        )
        self.assertIn(str(target.id), self.ids(archived_list))

        restore_response = self.client_api.post(
            f"/api/v1/personnel/persons/{target.id}/restore/", {}, format="json"
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        active_list = self.client_api.get("/api/v1/personnel/persons/", {"archive_state": "active"})
        self.assertIn(str(target.id), self.ids(active_list))

    def test_configuration_resource_uses_the_same_archive_contract(self):
        active = PaymentMethod.objects.create(name="R33 Active Cash", kind="cash")
        archived = PaymentMethod.objects.create(name="R33 Archived Cash", kind="cash")
        archived.archive(user=self.admin)
        response = self.client_api.get(
            "/api/v1/configuration/payment-methods/",
            {"archive_state": "archived"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = {str(row["id"]) for row in response.data["results"]}
        self.assertIn(str(archived.id), ids)
        self.assertNotIn(str(active.id), ids)
