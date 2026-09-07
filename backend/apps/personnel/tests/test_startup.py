# apps/personnel/tests/test_startup.py
"""
Startup / import regression tests.

These tests characterize EFOP Engineering Log finding C-01: the Personnel
serializer module referenced `EmptyStringToNullMixin` in a base-class
position before the mixin was declared, which raises a NameError at import
time and is expected to block Django URL loading (since
`config.api_urls` eagerly imports the personnel URLs, which import the
personnel views and serializers).

This module must keep passing after the fix; if the declaration order
regresses again, these tests fail immediately instead of surfacing only as
a mysterious startup crash.
"""
import importlib

from django.urls import get_resolver


def test_personnel_serializers_module_imports_cleanly():
    """apps.personnel.serializers must import without raising NameError."""
    module = importlib.import_module("apps.personnel.serializers")
    importlib.reload(module)
    assert hasattr(module, "EmptyStringToNullMixin")
    assert hasattr(module, "PersonnelPersonSerializer")


def test_personnel_person_serializer_inherits_mixin():
    """PersonnelPersonSerializer must resolve EmptyStringToNullMixin as a base."""
    from apps.personnel.serializers import EmptyStringToNullMixin, PersonnelPersonSerializer

    assert issubclass(PersonnelPersonSerializer, EmptyStringToNullMixin)


def test_config_api_urls_import_cleanly():
    """config.api_urls must import without raising an exception."""
    module = importlib.import_module("config.api_urls")
    assert hasattr(module, "urlpatterns")
    assert len(module.urlpatterns) > 0


def test_root_url_resolver_builds_without_exception():
    """The full Django URL graph must resolve without import-time exceptions."""
    resolver = get_resolver()
    # Force full resolution of the url graph (lazy until accessed).
    patterns = resolver.url_patterns
    assert len(patterns) > 0
