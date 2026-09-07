"""Safety policy tests deliberately runnable without importing Django."""

import unittest

from apps.common.reset_safety import (
    RESET_PHRASE,
    ResetTarget,
    UnsafeResetError,
    assert_reset_allowed,
)


class ResetSafetyPolicyTests(unittest.TestCase):
    def local_postgres(self, **overrides):
        values = {
            "debug": True,
            "settings_module": "config.settings.development",
            "engine": "django.db.backends.postgresql",
            "name": "efop_dev",
            "host": "localhost",
            "base_dir": "/project/backend",
            "allow_destructive_reset": True,
        }
        values.update(overrides)
        return ResetTarget(**values)

    def assert_refused(self, target=None, confirmation=RESET_PHRASE, expected="efop_dev"):
        with self.assertRaises(UnsafeResetError):
            assert_reset_allowed(
                target=target or self.local_postgres(),
                confirmation=confirmation,
                expected_database=expected,
            )

    def test_verified_local_postgres_target_is_allowed(self):
        assert_reset_allowed(
            target=self.local_postgres(),
            confirmation=RESET_PHRASE,
            expected_database="efop_dev",
        )

    def test_explicit_environment_opt_in_is_required(self):
        self.assert_refused(target=self.local_postgres(allow_destructive_reset=False))

    def test_wrong_confirmation_is_refused(self):
        self.assert_refused(confirmation="yes")

    def test_expected_database_mismatch_is_refused(self):
        self.assert_refused(expected="some_other_database")

    def test_debug_false_is_refused(self):
        self.assert_refused(target=self.local_postgres(debug=False))

    def test_production_and_staging_settings_are_refused(self):
        self.assert_refused(
            target=self.local_postgres(settings_module="config.settings.production")
        )
        self.assert_refused(target=self.local_postgres(settings_module="config.settings.staging"))

    def test_remote_database_host_is_refused(self):
        self.assert_refused(
            target=self.local_postgres(host="prod-db.example.com", name="efop_dev"),
            expected="efop_dev",
        )

    def test_ambiguous_or_production_database_name_is_refused(self):
        self.assert_refused(
            target=self.local_postgres(name="financial_ops"), expected="financial_ops"
        )
        self.assert_refused(target=self.local_postgres(name="accounting"), expected="accounting")
        self.assert_refused(
            target=self.local_postgres(name="efop_production"),
            expected="efop_production",
        )

    def test_local_development_sqlite_is_allowed_but_external_file_is_refused(self):
        target = ResetTarget(
            debug=True,
            settings_module="config.settings.test",
            engine="django.db.backends.sqlite3",
            name="/project/backend/efop_test.sqlite3",
            host="",
            base_dir="/project/backend",
            allow_destructive_reset=True,
        )
        assert_reset_allowed(
            target=target,
            confirmation=RESET_PHRASE,
            expected_database="/project/backend/efop_test.sqlite3",
        )
        outside = ResetTarget(**{**target.__dict__, "name": "/tmp/efop_test.sqlite3"})
        self.assert_refused(
            target=outside,
            expected="/tmp/efop_test.sqlite3",
        )


if __name__ == "__main__":
    unittest.main()
