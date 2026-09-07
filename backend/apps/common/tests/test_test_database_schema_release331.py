"""Release 33.1 regression: pytest must build the custom-user schema."""

import pytest
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder


@pytest.mark.django_db
def test_test_database_contains_custom_user_table_and_required_migrations():
    tables = set(connection.introspection.table_names())
    assert "accounts_user" in tables

    applied = set(MigrationRecorder(connection).applied_migrations())
    assert ("accounts", "0001_initial") in applied
    assert ("parties", "0002_client_kind") in applied
    assert ("financial_records", "0004_document_templates") in applied
