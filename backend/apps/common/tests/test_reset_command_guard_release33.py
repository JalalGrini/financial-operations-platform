"""Integration guard: a refused reset must never delegate to flush/migrate."""

from unittest.mock import patch

from django.core.management import call_command as django_call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings
from django.test.utils import ignore_warnings

from apps.common.reset_safety import RESET_PHRASE


@ignore_warnings(category=UserWarning)
class ResetCommandGuardTests(SimpleTestCase):
    @override_settings(
        DEBUG=False,
        DATABASES={
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": "financial_ops",
                "HOST": "localhost",
            }
        },
    )
    @patch("apps.common.management.commands.reset_efop_dev.call_command")
    def test_debug_false_refusal_never_reaches_flush(self, delegated_call):
        with self.assertRaises(CommandError):
            django_call_command(
                "reset_efop_dev",
                confirm=RESET_PHRASE,
                expected_database="financial_ops",
                verbosity=0,
            )
        delegated_call.assert_not_called()

    @override_settings(
        DEBUG=True,
        DATABASES={
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": "efop_dev",
                "HOST": "production-db.example.com",
            }
        },
    )
    @patch("apps.common.management.commands.reset_efop_dev.call_command")
    def test_remote_host_refusal_never_reaches_flush(self, delegated_call):
        with self.assertRaises(CommandError):
            django_call_command(
                "reset_efop_dev",
                confirm=RESET_PHRASE,
                expected_database="efop_dev",
                verbosity=0,
            )
        delegated_call.assert_not_called()
