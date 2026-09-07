"""Pytest fixtures shared by the entire backend suite.

This file did not exist before Cycle 6. It was added because rate limiting
introduces cross-test state, which pytest does not isolate on its own.
"""

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def clear_cache_between_tests():
    """Reset the cache around every test.

    DRF throttling keeps its request counters in the default cache, and the
    default cache is an in-process LocMemCache that lives for the WHOLE test
    session. Without this fixture those counters accumulate across tests: a
    test that logs in legitimately can inherit the counter from an earlier
    brute-force test and receive an unexpected 429, producing failures that
    depend on test execution order and look like flakiness.

    Clearing both before and after keeps each test independent regardless of
    the order pytest happens to choose.
    """
    cache.clear()
    yield
    cache.clear()

@pytest.fixture(scope="session", autouse=True)
def create_common_test_model_tables(django_db_setup, django_db_blocker):
    """Create common's test-only concrete model tables after real migrations.

    The models inherit foreign keys to settings.AUTH_USER_MODEL. If Django
    treats them as ordinary unmigrated ``common`` models, ``sync_apps`` tries
    to add those constraints before accounts.0001 creates accounts_user on a
    fresh PostgreSQL test database. Keeping the models unmanaged and creating
    them here preserves migration order without weakening production schema
    checks or touching the application database.
    """
    import importlib
    import sys

    from django.db import connection

    # Pytest imports this file as ``common.tests.test_models`` because ``apps``
    # is on its collection path. Re-importing it as
    # ``apps.common.tests.test_models`` would register the same Django models
    # twice under different module names and raise a conflicting-model error.
    module_name = "common.tests.test_models"
    test_models = sys.modules.get(module_name)
    if test_models is None:
        test_models = importlib.import_module(module_name)

    models = (
        test_models.ConcreteUUIDModel,
        test_models.ConcreteTimeStampedModel,
        test_models.ConcreteArchiveModel,
        test_models.ConcreteReferenceModel,
    )
    created = []
    with django_db_blocker.unblock():
        existing = set(connection.introspection.table_names())
        with connection.schema_editor() as editor:
            for model in models:
                if model._meta.db_table not in existing:
                    editor.create_model(model)
                    created.append(model)
        # Migrations are complete now. Mark these models managed so Django's
        # TransactionTestCase flush includes their FK-bearing tables.
        for model in models:
            model._meta.managed = True

    yield

    with django_db_blocker.unblock():
        existing = set(connection.introspection.table_names())
        with connection.schema_editor() as editor:
            for model in reversed(created):
                if model._meta.db_table in existing:
                    editor.delete_model(model)
        for model in models:
            model._meta.managed = False

