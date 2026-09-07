"""Guard: the list exports stay wired, and their declared columns stay real.

WHY THIS EXISTS
---------------
`apps/common/export_mixin.py` was written, documented, and then never imported
by anything. Six list endpoints kept hand-rolling exports or had none at all,
and nothing failed, because dead code cannot fail. This file makes the wiring
itself an assertion.

The column check is the valuable half. `export_columns` are strings resolved at
runtime with getattr, so a typo or a renamed field does not raise on import, or
at startup, or in any other test: it silently exports a column full of empty
cells. Every declared path is therefore resolved against the real model here.

A note on what this does NOT claim. The mixin's docstring asserted that
`apps/personnel/views._export_list_response` "exported get_queryset()" and so
"searching for one employee and pressing Export downloaded every employee".
That was checked against the code in v17.19 and it is false: the personnel
frontend puts its filters in the export URL's query string and those three
ViewSets read those params by hand in get_queryset. The only backend those
endpoints were missing is OrderingFilter. The docstring has been corrected.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.common.export_mixin import ExportableListMixin, resolve_export_value
from apps.companies.models import Company
from apps.companies.views import CompanyViewSet
from apps.deadlines.models import Deadline
from apps.deadlines.views import DeadlineViewSet
from apps.financial_records.models import FinancialRecord
from apps.financial_records.views import FinancialRecordViewSet
from apps.parties.models import Client, Supplier
from apps.parties.views import ClientViewSet, SupplierViewSet
from apps.transfers.models import CashTransfer
from apps.transfers.views import CashTransferViewSet

User = get_user_model()

#: (ViewSet, model, namespaced route name, expected filename stem)
WIRED = [
    (DeadlineViewSet, Deadline, "deadlines:deadline", "deadlines_export"),
    (
        FinancialRecordViewSet,
        FinancialRecord,
        "financial_records:financial-record",
        "financial_records_export",
    ),
    (ClientViewSet, Client, "parties:client", "clients_export"),
    (SupplierViewSet, Supplier, "parties:supplier", "suppliers_export"),
    (CashTransferViewSet, CashTransfer, "transfers:cash-transfer", "cash_transfers_export"),
    (CompanyViewSet, Company, "companies:company", "companies_export"),
]


def resolve_field_path(model, path):
    """Walk a `__` separated field path across real model fields.

    Returns None when the path is valid, or a string explaining the first
    broken hop. Deliberately uses `_meta`, not getattr on an instance: an
    instance-level getattr returns None for a misspelled field and would make
    a typo look fine.
    """
    parts = path.split("__")
    current = model
    for index, part in enumerate(parts):
        if current is None:
            return f"{path}: '{parts[index - 1]}' is not a relation, cannot traverse to '{part}'"
        try:
            field = current._meta.get_field(part)
        except Exception:
            names = sorted(f.name for f in current._meta.get_fields())
            return f"{path}: '{part}' is not a field on {current.__name__}. Available: {names}"
        current = field.related_model if field.is_relation else None
    return None


class ExportWiringContractTests(TestCase):
    def test_every_export_route_is_actually_reachable(self):
        """Declaring the mixin is not the same as the router exposing a URL."""
        for _viewset, _model, route, _stem in WIRED:
            for suffix in ("-export", "-export-options"):
                self.assertTrue(
                    reverse(route + suffix).startswith("/"),
                    f"{route}{suffix} does not resolve",
                )

    def test_every_declared_endpoint_actually_has_the_mixin(self):
        for viewset, _model, _route, stem in WIRED:
            self.assertIn(
                ExportableListMixin,
                viewset.__mro__,
                f"{viewset.__name__} lost ExportableListMixin, so its export endpoint is gone",
            )
            self.assertEqual(viewset.export_filename_stem, stem, viewset.__name__)
            self.assertTrue(
                viewset.export_sheet_name and viewset.export_sheet_name != "Export",
                f"{viewset.__name__} must name its sheet",
            )

    def test_every_declared_export_column_resolves_on_the_model(self):
        checked = 0
        for viewset, model, _route, _stem in WIRED:
            columns = viewset.export_columns
            self.assertGreaterEqual(
                len(columns), 5, f"{viewset.__name__} declares suspiciously few columns"
            )
            headers = [header for _field, header in columns]
            self.assertEqual(
                len(headers), len(set(headers)), f"{viewset.__name__} has duplicate headers"
            )
            for field, header in columns:
                self.assertTrue(header.strip(), f"{viewset.__name__}: blank header for {field}")
                problem = resolve_field_path(model, field)
                self.assertIsNone(problem, f"{viewset.__name__}: {problem}")
                checked += 1
        # Vacuity: an empty or shrunken table must not pass silently.
        self.assertGreaterEqual(checked, 55, "column coverage collapsed")

    def test_the_resolver_actually_rejects_a_bad_path(self):
        """Vacuity check for the check above."""
        self.assertIsNone(resolve_field_path(Company, "name"))
        self.assertIsNotNone(resolve_field_path(Company, "nmae"))
        self.assertIsNotNone(resolve_field_path(Company, "name__nonsense"))

    def test_exports_use_filter_queryset_not_get_queryset(self):
        """The mixin's whole filter promise lives in one method; pin it."""
        source = ExportableListMixin.get_export_queryset
        self.assertIn("filter_queryset", source.__code__.co_names)


class CompanyExportEndpointTests(TestCase):
    """One end-to-end pass, so the wiring is proven through HTTP, not by import."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="export.admin@example.invalid",
            password="testpass123",
            first_name="Export",
            last_name="Admin",
        )
        group, _created = Group.objects.get_or_create(name="Administrator")
        self.user.groups.add(group)
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.user)
        self.active = Company.objects.create(name="Kept Active SARL", status="active")
        self.inactive = Company.objects.create(name="Filtered Out SARL", status="inactive")

    def test_export_returns_a_file_and_counts_its_rows(self):
        response = self.client_api.get(
            reverse("companies:company-export"), {"output_format": "csv"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("companies_export.csv", response["Content-Disposition"])
        body = response.content.decode("utf-8-sig")
        self.assertIn("Kept Active SARL", body)
        self.assertIn("Registration number", body)

    def test_export_respects_the_on_screen_filter(self):
        """The regression that matters: a filtered list must not export everything."""
        response = self.client_api.get(
            reverse("companies:company-export"), {"output_format": "csv", "status": "active"}
        )
        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8-sig")
        self.assertIn("Kept Active SARL", body)
        self.assertNotIn("Filtered Out SARL", body)
        self.assertEqual(response["X-Export-Row-Count"], "1")

    def test_column_subset_and_unknown_columns(self):
        response = self.client_api.get(
            reverse("companies:company-export"),
            {"output_format": "csv", "columns": "name,status"},
        )
        self.assertEqual(response.status_code, 200)
        header = response.content.decode("utf-8-sig").splitlines()[0]
        self.assertNotIn("Registration number", header)
        self.assertIn("Name", header)

        bad = self.client_api.get(
            reverse("companies:company-export"), {"columns": "name,nonsense"}
        )
        self.assertEqual(bad.status_code, 400)
        self.assertIn("nonsense", str(bad.data))

    def test_export_options_describes_the_endpoint(self):
        response = self.client_api.get(reverse("companies:company-export-options"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("xlsx", response.data["formats"])
        fields = [column["field"] for column in response.data["columns"]]
        self.assertIn("name", fields)
        self.assertEqual(response.data["row_cap"], CompanyViewSet.export_row_cap)

    def test_the_reserved_format_parameter_is_rejected_by_drf_not_by_us(self):
        """Pin the trap that cost time when this mixin was first wired.

        `?format=csv` never reaches the action: DRF's content negotiation owns
        that name and 404s on an unknown renderer. This test exists so nobody
        "helpfully" re-adds `format` support to the mixin and believes it works
        because the code looks right.
        """
        reserved = self.client_api.get(
            reverse("companies:company-export"), {"format": "csv"}
        )
        self.assertEqual(reserved.status_code, 404)

        supported = self.client_api.get(
            reverse("companies:company-export"), {"output_format": "csv"}
        )
        self.assertEqual(supported.status_code, 200)

    def test_unsupported_output_format_is_a_400_not_a_500(self):
        response = self.client_api.get(
            reverse("companies:company-export"), {"output_format": "docx"}
        )
        self.assertEqual(response.status_code, 400)

    def test_resolve_export_value_survives_a_null_relation(self):
        self.assertEqual(resolve_export_value(self.active, "name"), "Kept Active SARL")
        self.assertEqual(resolve_export_value(self.active, "created_by__email"), "")
