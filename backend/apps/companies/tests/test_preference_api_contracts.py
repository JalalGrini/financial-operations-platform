# apps/companies/tests/test_preference_api_contracts.py
"""
M0-R Company Preference API/schema contract repair (Task 2).

Characterizes and repairs EFOP Engineering Log finding AR-03 / M-10:
`CompanyPreferenceCreateSerializer` declared a bare `value_type` field in
`Meta.fields` with no explicit serializer field. Since `CompanyPreference`
has no `value_type` model field (the real field is `preference_type`),
`ModelSerializer.build_unknown_field()` raised
`django.core.exceptions.ImproperlyConfigured` whenever DRF/drf-spectacular
tried to introspect this serializer's fields -- which is exactly what
`manage.py spectacular` does, and is why full-project OpenAPI generation
failed.

This module proves, through the real nested company-preference routes,
that:

- The public `value_type` field name is preserved.
- `value_type` values persist to the model's `preference_type` field.
- Invalid `value_type` values are rejected using the model's own
  `CompanyPreferenceType` choices (no duplicated choice list).
- No model or migration change was required.
"""
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User
from apps.companies.models import Company, CompanyPreference, CompanyPreferenceType
from apps.companies.serializers import CompanyPreferenceCreateSerializer


def _make_admin_user(email="m0r-companies-admin@example.com"):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="M0R",
        last_name="Admin",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    return user


class CompanyPreferenceSerializerValidationTests(APITestCase):
    """Serializer-level validation, independent of routing."""

    def test_value_type_field_is_explicitly_declared(self):
        """
        The fix must declare `value_type` explicitly (source="preference_type")
        rather than leaving it for ModelSerializer to resolve against a
        nonexistent model field.
        """
        serializer = CompanyPreferenceCreateSerializer()
        self.assertIn("value_type", serializer.fields)
        self.assertEqual(serializer.fields["value_type"].source, "preference_type")

    def test_valid_value_type_passes_validation(self):
        serializer = CompanyPreferenceCreateSerializer(
            data={
                "key": "invoice_theme",
                "value_type": "string",
                "value": "modern",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["preference_type"], "string")

    def test_invalid_value_type_is_rejected(self):
        serializer = CompanyPreferenceCreateSerializer(
            data={
                "key": "invoice_theme",
                "value_type": "not_a_real_type",
                "value": "modern",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("value_type", serializer.errors)

    def test_all_model_choices_are_accepted(self):
        for choice_value, _label in CompanyPreferenceType.choices:
            serializer = CompanyPreferenceCreateSerializer(
                data={
                    "key": f"pref_{choice_value}",
                    "value_type": choice_value,
                    "value": "x",
                }
            )
            self.assertTrue(serializer.is_valid(), (choice_value, serializer.errors))


class CompanyPreferenceRoutedContractTests(APITestCase):
    """Nested-route create/retrieve/update contract tests."""

    def setUp(self):
        self.client_api = APIClient()
        self.user = _make_admin_user()
        self.client_api.force_authenticate(user=self.user)
        self.company = Company.objects.create(name="Preference Co", created_by=self.user)

    def test_create_preference_with_value_type_persists_preference_type(self):
        resp = self.client_api.post(
            f"/api/v1/companies/{self.company.id}/preferences/",
            {"key": "default_tax_rate", "value_type": "decimal", "value": "20.00"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["value_type"], "decimal")

        preference = CompanyPreference.objects.get(company=self.company, key="default_tax_rate")
        self.assertEqual(preference.preference_type, "decimal")
        self.assertEqual(preference.value, "20.00")

    def test_create_preference_with_invalid_value_type_is_rejected(self):
        resp = self.client_api.post(
            f"/api/v1/companies/{self.company.id}/preferences/",
            {"key": "bad_pref", "value_type": "not_a_type", "value": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_preference_exposes_value_type(self):
        preference = CompanyPreference.objects.create(
            company=self.company,
            key="auto_send",
            preference_type=CompanyPreferenceType.BOOLEAN,
            value="true",
            created_by=self.user,
        )
        resp = self.client_api.get(
            f"/api/v1/companies/{self.company.id}/preferences/{preference.id}/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["value_type"], "boolean")
        self.assertEqual(resp.data["key"], "auto_send")
        self.assertEqual(resp.data["typed_value"], True)

    def test_update_preference_with_value_type_persists_preference_type(self):
        preference = CompanyPreference.objects.create(
            company=self.company,
            key="mutable_pref",
            preference_type=CompanyPreferenceType.STRING,
            value="old",
            created_by=self.user,
        )
        resp = self.client_api.put(
            f"/api/v1/companies/{self.company.id}/preferences/{preference.id}/",
            {"key": "mutable_pref", "value_type": "integer", "value": "42"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        preference.refresh_from_db()
        self.assertEqual(preference.preference_type, "integer")
        self.assertEqual(preference.value, "42")

    def test_patch_preference_value_type_persists(self):
        preference = CompanyPreference.objects.create(
            company=self.company,
            key="patchable_pref",
            preference_type=CompanyPreferenceType.STRING,
            value="hello",
            created_by=self.user,
        )
        resp = self.client_api.patch(
            f"/api/v1/companies/{self.company.id}/preferences/{preference.id}/",
            {"value_type": "json", "value": '{"a": 1}'},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        preference.refresh_from_db()
        self.assertEqual(preference.preference_type, "json")

    def test_list_preferences_for_company(self):
        CompanyPreference.objects.create(
            company=self.company,
            key="pref_a",
            preference_type=CompanyPreferenceType.STRING,
            value="a",
            created_by=self.user,
        )
        resp = self.client_api.get(f"/api/v1/companies/{self.company.id}/preferences/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        keys = (
            {item["key"] for item in resp.data["results"]}
            if isinstance(resp.data, dict)
            else {item["key"] for item in resp.data}
        )
        self.assertIn("pref_a", keys)

    def test_create_response_includes_id(self):
        """
        M0-R2 Task 1 (Engineering Log finding M0R-A1): a successful create
        must return the generated preference `id` so the resource is
        addressable without an extra list/search request.
        """
        resp = self.client_api.post(
            f"/api/v1/companies/{self.company.id}/preferences/",
            {"key": "addressable_pref", "value_type": "string", "value": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIn("id", resp.data)
        self.assertIsNotNone(resp.data["id"])

    def test_retrieve_created_preference_using_response_id(self):
        """
        Use the `id` from a create response to retrieve the same resource
        through the API, proving addressability end-to-end rather than
        only checking for the field's presence.
        """
        create_resp = self.client_api.post(
            f"/api/v1/companies/{self.company.id}/preferences/",
            {
                "key": "roundtrip_pref",
                "value_type": "boolean",
                "value": "true",
                "description": "desc",
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        preference_id = create_resp.data["id"]

        retrieve_resp = self.client_api.get(
            f"/api/v1/companies/{self.company.id}/preferences/{preference_id}/"
        )
        self.assertEqual(retrieve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_resp.data["key"], "roundtrip_pref")
        self.assertEqual(retrieve_resp.data["value_type"], "boolean")
        self.assertEqual(retrieve_resp.data["value"], "true")
        self.assertEqual(retrieve_resp.data["description"], "desc")
