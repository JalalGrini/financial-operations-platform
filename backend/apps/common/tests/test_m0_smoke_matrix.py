# apps/common/tests/test_m0_smoke_matrix.py
"""
Milestone M0 smoke matrix.

Wires the repaired Personnel, Configuration, and Parties domains into one
reproducible validation sequence, per EFOP Engineering Log Task 4:

- Root API URL configuration loads.
- Django system checks pass.
- Repaired serializers/viewsets are discoverable through routed viewsets
  and can traverse OpenAPI schema generation for the milestone endpoints.
- Representative Configuration and Parties endpoints respond successfully.

Historical note (M0): full-project `drf-spectacular` schema generation
(`manage.py spectacular`) originally failed for reasons outside M0 scope
(missing Authentication `serializer_class` metadata, and a
`CompanyPreferenceCreateSerializer.value_type` field that did not exist on
the model). Those defects were tracked as Engineering Log finding M-10 and
were out of scope for M0 (Personnel/Configuration/Parties only). This test
module originally added an equivalent milestone-scoped schema-traversal
check to satisfy M0 Success Criterion 9 without touching Authentication or
Companies.

M0-R update: Task 2 (Company Preference `value_type`/`preference_type`
mapping) and Task 3 (Authentication OpenAPI metadata) repaired both
defects. `test_full_project_openapi_schema_endpoint_succeeds` below now
verifies full-project schema generation succeeds end-to-end through the
routed `/api/schema/` endpoint, closing M-10. The milestone-scoped tests
are kept for their original, narrower purpose and are not redundant with
the full-project check (they verify Personnel/Configuration/Parties
operations specifically).
"""
import importlib

import pytest
import yaml
from django.urls import get_resolver
from drf_spectacular.generators import EndpointEnumerator, SchemaGenerator


def test_root_url_configuration_loads():
    """config.api_urls must import and expose non-empty urlpatterns."""
    module = importlib.import_module("config.api_urls")
    assert len(module.urlpatterns) > 0


def test_full_url_graph_resolves():
    """The full Django URL graph must resolve without import-time exceptions."""
    resolver = get_resolver()
    assert len(resolver.url_patterns) > 0


@pytest.mark.django_db
def test_milestone_endpoints_are_schema_traversable():
    """
    Repaired Personnel, Configuration, and Parties viewsets must be
    introspectable by drf-spectacular's schema generator without raising
    ImproperlyConfigured or NameError for their own serializers.

    This does not generate the full project schema (see module docstring
    for the pre-existing, out-of-scope blockers in apps.authentication and
    apps.companies). It restricts generation to the milestone's own routed
    prefixes.
    """
    generator = SchemaGenerator()
    enumerator = EndpointEnumerator()
    all_endpoints = enumerator.get_api_endpoints()

    milestone_prefixes = ("/personnel/", "/configuration/", "/parties/")
    milestone_endpoints = [
        (path, path_regex, method, callback)
        for path, path_regex, method, callback in all_endpoints
        if any(path.startswith(f"/api/v1{p}") for p in milestone_prefixes)
    ]

    assert len(milestone_endpoints) > 0, "Expected at least one milestone endpoint to be discovered"

    # Force schema construction for each milestone view; this exercises the
    # same serializer introspection path that a full schema generation run
    # would, without depending on unrelated apps (authentication, companies).
    registry = generator.registry
    for path, path_regex, method, callback in milestone_endpoints:
        view = generator.create_view(callback, method, None)
        operation = view.schema.get_operation(path, path_regex, "/api/v1/", method, registry)
        assert operation is not None, f"No operation generated for {method} {path}"


@pytest.mark.django_db
def test_full_project_openapi_schema_endpoint_succeeds(django_user_model):
    """
    M0-R Task 4 regression test: `/api/schema/` must return a valid,
    successfully generated OpenAPI document for the full installed
    project, not just the M0 milestone-scoped subset.

    This closes Engineering Log finding AR-03/M-10 ("full-project OpenAPI
    generation remains broken") after the Company Preference
    (`CompanyPreferenceCreateSerializer.value_type`) and Authentication
    schema-metadata repairs in M0-R Tasks 2 and 3.
    """
    from rest_framework.test import APIClient

    api_client = APIClient()
    anonymous = api_client.get("/api/schema/")
    assert anonymous.status_code in (401, 403)

    staff = django_user_model.objects.create_user(
        email="schema-staff@example.com",
        password="testpass123",
        first_name="Schema",
        last_name="Staff",
        is_staff=True,
    )
    api_client.force_authenticate(user=staff)
    resp = api_client.get("/api/schema/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("application/vnd.oai.openapi")

    schema = yaml.safe_load(resp.content)
    assert schema["openapi"].startswith("3.")
    assert len(schema["paths"]) > 0

    required_domain_prefixes = (
        "/auth/",
        "/companies/",
        "/personnel/",
        "/configuration/",
        "/parties/",
    )
    for prefix in required_domain_prefixes:
        matching = [p for p in schema["paths"] if prefix in p]
        assert matching, f"No schema paths found for domain prefix {prefix!r}"


@pytest.mark.django_db
def test_configuration_and_parties_endpoints_respond(django_user_model):
    """Representative smoke check that routed endpoints respond successfully."""
    from django.contrib.auth.models import Group
    from rest_framework.test import APIClient

    user = django_user_model.objects.create_user(
        email="smoke@example.com",
        password="testpass123",
        first_name="Smoke",
        last_name="Test",
    )
    group, _ = Group.objects.get_or_create(name="Administrator")
    user.groups.add(group)
    api_client = APIClient()
    api_client.force_authenticate(user=user)

    for path in [
        "/api/v1/configuration/categories/",
        "/api/v1/configuration/record-types/",
        "/api/v1/configuration/payment-methods/",
        "/api/v1/configuration/transaction-types/",
        "/api/v1/configuration/report-types/",
        "/api/v1/configuration/notification-types/",
        "/api/v1/parties/clients/",
        "/api/v1/parties/suppliers/",
        "/api/v1/parties/associated-persons/",
        "/api/v1/parties/person-types/",
        "/api/v1/parties/external-parties/",
    ]:
        resp = api_client.get(path)
        assert (
            resp.status_code == 200
        ), f"{path} returned {resp.status_code}: {getattr(resp, 'data', resp.content)}"
