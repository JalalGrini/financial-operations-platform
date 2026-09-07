# apps/common/tests/test_health_and_report_schema.py
"""
M0-R2 Task 3: Health, database-health, and report schema metadata.

Characterizes and repairs EFOP Engineering Log finding M0R-A3: `HealthView`,
`DatabaseHealthView`, and `ReportViewSet`'s 6 custom actions had no
`serializer_class` and no `@extend_schema` metadata, so drf-spectacular
fell back to its generic "unable to guess serializer" error-level
diagnostic for each of them (3 unique error-level messages, reported as
"Errors: 32 (3 unique)" in the M0-R baseline schema-generation summary).

This module proves each affected operation now resolves to a real
component schema instead of the fallback, and that XLSX export operations
document their actual binary media type. No report calculation, query,
file-generation, filename, or permission behavior is touched by this
module or by the schema-only change it verifies.
"""
from drf_spectacular.generators import EndpointEnumerator, SchemaGenerator


def _get_operation(path, method):
    """Generate the OpenAPI operation for a single routed path/method."""
    generator = SchemaGenerator()
    enumerator = EndpointEnumerator()
    all_endpoints = enumerator.get_api_endpoints()
    for ep_path, path_regex, op_method, callback in all_endpoints:
        if ep_path == path and op_method == method:
            view = generator.create_view(callback, op_method, None)
            operation = view.schema.get_operation(
                ep_path, path_regex, "/api/v1/", op_method, generator.registry
            )
            return operation, generator
    raise AssertionError(f"No endpoint found for {method} {path}")


def _is_fallback_schema(response_entry):
    """
    Detect drf-spectacular's generic fallback response shape: a bare
    `{"type": "string"}` (or no "content" key at all for the
    `AutoSchema` error-level fallback path), as opposed to a real
    component schema reference (`$ref`) or an explicit object schema.
    """
    if not response_entry:
        return True
    content = response_entry.get("content")
    if not content:
        return True
    schema = content.get("application/json", {}).get("schema", {})
    # A real component reference always has "$ref" or a non-trivial
    # "type": "object" / "type": "array" structure with properties.
    if "$ref" in schema:
        return False
    if schema.get("type") == "object" and schema.get("properties"):
        return False
    if schema.get("type") == "array":
        return False
    return True


class TestHealthViewSchema:
    """`GET /api/v1/health/` must document a real 200 response schema."""

    def test_health_view_has_no_fallback_and_documents_200(self):
        operation, _ = _get_operation("/api/v1/health/", "GET")
        assert "200" in operation["responses"]
        assert not _is_fallback_schema(operation["responses"]["200"]), operation["responses"]["200"]


class TestDatabaseHealthViewSchema:
    """`GET /api/v1/health/database/` must document real 200 and 503 schemas."""

    def test_database_health_view_has_no_fallback_and_documents_200_and_503(self):
        operation, _ = _get_operation("/api/v1/health/database/", "GET")
        assert set(operation["responses"].keys()) >= {"200", "503"}
        assert not _is_fallback_schema(operation["responses"]["200"]), operation["responses"]["200"]
        assert not _is_fallback_schema(operation["responses"]["503"]), operation["responses"]["503"]


class TestReportActionSchemas:
    """Each of the 6 `ReportViewSet` custom actions must have a real schema."""

    def test_cnss_monthly_preview_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/cnss-monthly/preview/", "POST")
        assert not _is_fallback_schema(operation["responses"].get("200"))
        assert "requestBody" in operation

    def test_cnss_monthly_export_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/cnss-monthly/export/", "POST")
        content = operation["responses"]["200"].get("content", {})
        assert (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in content
        ), content

    def test_payroll_monthly_preview_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/payroll-monthly/preview/", "POST")
        assert not _is_fallback_schema(operation["responses"].get("200"))
        assert "requestBody" in operation

    def test_payroll_monthly_export_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/payroll-monthly/export/", "POST")
        content = operation["responses"]["200"].get("content", {})
        assert (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in content
        ), content

    def test_report_types_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/types/", "GET")
        assert not _is_fallback_schema(operation["responses"].get("200"))

    def test_dashboard_schema(self):
        operation, _ = _get_operation("/api/v1/personnel/reports/dashboard/", "GET")
        assert not _is_fallback_schema(operation["responses"].get("200"))


class TestZeroErrorLevelFallbacksForHealthAndReportViews:
    """
    drf-spectacular does not use Python's ``logging`` module for its
    warn()/error() diagnostics: `drf_spectacular.plumbing.warn()` and
    `.error()` both call `drf_spectacular.drainage.GENERATOR_STATS.emit()`,
    a custom stats emitter that writes directly to `sys.stderr` and keeps
    its own `_error_cache`/`_warn_cache` dictionaries. This test uses that
    real mechanism (reset the cache, run a full schema generation, inspect
    the cache) instead of Python logging interception, which does not
    observe these diagnostics at all.
    """

    def test_zero_error_level_fallbacks_for_health_and_report_views(self):
        from drf_spectacular.drainage import GENERATOR_STATS, reset_generator_stats

        reset_generator_stats()
        try:
            generator = SchemaGenerator()
            generator.get_schema(request=None, public=True)
            error_messages = list(GENERATOR_STATS._error_cache.keys())
        finally:
            reset_generator_stats()

        for marker in ["HealthView", "DatabaseHealthView", "ReportViewSet"]:
            matches = [
                msg for msg in error_messages if f"Error [{marker}]" in msg or f"[{marker}]" in msg
            ]
            assert not matches, f"Expected no error-level fallback for {marker}, found: {matches}"


class TestProjectWideZeroErrorFallback:
    """
    M0-R3 Task 3 (Engineering Log finding M0R2-B4): the marker-specific
    test above only proves `HealthView`, `DatabaseHealthView`, and
    `ReportViewSet` no longer trigger the fallback. It does not protect
    against a *different*, currently-undiscovered view anywhere in the
    project silently regressing into the same fallback path in the
    future. This test asserts the complete project-wide
    `GENERATOR_STATS._error_cache` is empty after a full schema
    generation pass, with no marker filtering at all.
    """

    def test_full_project_error_cache_is_empty_after_schema_generation(self):
        from drf_spectacular.drainage import GENERATOR_STATS, reset_generator_stats

        reset_generator_stats()
        try:
            generator = SchemaGenerator()
            generator.get_schema(request=None, public=True)
            error_cache = dict(GENERATOR_STATS._error_cache)
        finally:
            reset_generator_stats()

        assert error_cache == {}, (
            f"Expected zero error-level graceful fallbacks project-wide, "
            f"found {len(error_cache)} unique message(s): {list(error_cache.keys())}"
        )


class TestReportExportResponseContracts:
    """
    M0-R3 Task 3 (Engineering Log finding M0R2-B3): the pre-existing
    export tests only asserted that the XLSX media-type key was present
    in the `200` response's `content` dict. They did not assert the
    exact applicable status-key set (200 and 400), the `200` response's
    schema shape (`type: string`, `format: binary`), or that the `400`
    response resolves to `ReportErrorResponseSchema`.
    """

    EXPORT_PATHS = [
        "/api/v1/personnel/reports/cnss-monthly/export/",
        "/api/v1/personnel/reports/payroll-monthly/export/",
    ]

    def test_export_operations_declare_exactly_200_and_400(self):
        for path in self.EXPORT_PATHS:
            operation, _ = _get_operation(path, "POST")
            assert set(operation["responses"].keys()) == {"200", "400"}, (
                path,
                operation["responses"].keys(),
            )

    def test_export_200_response_is_binary_xlsx(self):
        for path in self.EXPORT_PATHS:
            operation, _ = _get_operation(path, "POST")
            content = operation["responses"]["200"]["content"]
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            assert media_type in content, (path, content)
            schema = content[media_type]["schema"]
            assert schema.get("type") == "string", (path, schema)
            assert schema.get("format") == "binary", (path, schema)

    def test_export_400_response_raw_ref_targets_report_error_response_schema(self):
        """
        M0-R4 Task 1 (Engineering Log finding M0R3-C6): the M0-R3 version
        of this test only checked that the *resolved* component had an
        `error` property, which would also pass if the raw reference
        pointed at some other component that happened to share that
        property name. This asserts the raw `$ref` string itself (or the
        sole `$ref` inside a single `allOf` wrapper) targets exactly
        `#/components/schemas/ReportErrorResponseSchema`.
        """
        expected_ref = "#/components/schemas/ReportErrorResponseSchema"
        for path in self.EXPORT_PATHS:
            operation, _ = _get_operation(path, "POST")
            content = operation["responses"]["400"]["content"]
            schema_ref = content["application/json"]["schema"]
            if "$ref" in schema_ref:
                raw_target = schema_ref["$ref"]
            elif "allOf" in schema_ref:
                all_of = schema_ref["allOf"]
                assert len(all_of) == 1, (path, all_of)
                raw_target = all_of[0].get("$ref")
            else:
                raw_target = None
            assert raw_target == expected_ref, (
                path,
                f"raw reference target was {raw_target!r}, expected {expected_ref!r}",
            )

    def test_export_400_response_resolves_to_report_error_response_schema(self):
        """Retained secondary shape check from M0-R3 (Engineering Log
        instruction: 'Retain existing shape assertions as secondary
        checks')."""
        for path in self.EXPORT_PATHS:
            operation, generator = _get_operation(path, "POST")
            full_schema = generator.get_schema(request=None, public=True)
            components = full_schema["components"]
            content = operation["responses"]["400"]["content"]
            schema_ref = content["application/json"]["schema"]
            resolved = schema_ref
            if "$ref" in resolved:
                name = resolved["$ref"].rsplit("/", 1)[-1]
                resolved = components["schemas"][name]
            elif "allOf" in resolved and "$ref" in resolved["allOf"][0]:
                name = resolved["allOf"][0]["$ref"].rsplit("/", 1)[-1]
                resolved = components["schemas"][name]
            assert "error" in resolved.get("properties", {}), (path, resolved)
