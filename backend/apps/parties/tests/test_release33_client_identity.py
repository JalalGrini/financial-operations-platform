"""Release 33 structured Client identity and archived-uniqueness regressions."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company
from apps.parties.models import Client, ClientKind


class ClientIdentityRelease33Tests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_superuser(
            email="client-release33@example.com", password="Strong-Release33-Test!"
        )
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.company = Company.objects.create(name="Client Contract Company", created_by=self.user)

    def test_archived_individual_identifier_remains_unique_and_returns_400(self):
        existing = Client.objects.create(
            company=self.company,
            client_kind=ClientKind.INDIVIDUAL,
            first_name="Existing",
            last_name="Client",
            name="Existing Client",
            national_id="R33-ARCHIVED-NID-001",
            created_by=self.user,
        )
        existing.archive(user=self.user)

        response = self.api.post(
            "/api/v1/parties/clients/",
            {
                "company": str(self.company.id),
                "client_kind": ClientKind.INDIVIDUAL,
                "first_name": "New",
                "last_name": "Client",
                "national_id": "r33-archived-nid-001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("national_id", response.data)
        self.assertEqual(
            Client.all_objects.filter(national_id__iexact="R33-ARCHIVED-NID-001").count(), 1
        )

    def test_kind_specific_required_identity_errors_are_field_specific(self):
        response = self.api.post(
            "/api/v1/parties/clients/",
            {"company": str(self.company.id), "client_kind": ClientKind.INDIVIDUAL},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("first_name", response.data)
        self.assertIn("last_name", response.data)
