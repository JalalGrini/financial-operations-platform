"""Destructive local-development reset with deliberately redundant safeguards."""

import os

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.common.reset_safety import (
    ResetTarget,
    UnsafeResetError,
    assert_reset_allowed,
)


class Command(BaseCommand):
    help = (
        "Flush a verified local development/test database, then migrate/bootstrap it. "
        "This command always refuses production, staging, remote, or ambiguous targets."
    )

    def add_arguments(self, parser):
        parser.add_argument("--confirm", required=True)
        parser.add_argument(
            "--expected-database",
            required=True,
            help="Must exactly match settings.DATABASES['default']['NAME'].",
        )
        parser.add_argument("--with-demo", action="store_true")
        parser.add_argument(
            "--empty",
            action="store_true",
            help="Leave application tables empty after migrate; do not bootstrap or seed.",
        )
        parser.add_argument(
            "--no-bootstrap", action="store_true", help="Deprecated alias for --empty."
        )
        parser.add_argument("--admin-email", default="")
        parser.add_argument("--make-superuser", action="store_true")

    def handle(self, *args, **options):
        database = settings.DATABASES["default"]
        target = ResetTarget(
            debug=bool(settings.DEBUG),
            settings_module=os.environ.get("DJANGO_SETTINGS_MODULE", ""),
            engine=str(database.get("ENGINE", "")),
            name=str(database.get("NAME", "")),
            host=str(database.get("HOST", "")),
            base_dir=str(settings.BASE_DIR),
            allow_destructive_reset=os.environ.get("EFOP_ALLOW_LOCAL_RESET") == "1",
        )
        if options["with_demo"] and (options["empty"] or options["no_bootstrap"]):
            raise CommandError("--with-demo cannot be combined with --empty/--no-bootstrap.")
        try:
            assert_reset_allowed(
                target=target,
                confirmation=options["confirm"],
                expected_database=options["expected_database"],
            )
        except UnsafeResetError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.WARNING(
                f"Verified local destructive target: {target.engine} database '{target.name}' on '{target.host or 'local'}'."
            )
        )
        call_command("flush", interactive=False, verbosity=options["verbosity"])
        # Flush leaves the migration graph/tables in place. Running migrate is
        # harmless and ensures a manually emptied or newly created DB converges.
        call_command("migrate", interactive=False, verbosity=options["verbosity"])

        if not (options["empty"] or options["no_bootstrap"]):
            bootstrap_options = {"verbosity": options["verbosity"]}
            if options["admin_email"]:
                bootstrap_options["admin_email"] = options["admin_email"]
                bootstrap_options["make_superuser"] = options["make_superuser"]
            call_command("bootstrap_efop", **bootstrap_options)
        if options["with_demo"]:
            call_command("seed_efop_demo", verbosity=options["verbosity"])

        outcome = (
            "empty migrated tables"
            if (options["empty"] or options["no_bootstrap"])
            else "bootstrapped tables"
        )
        self.stdout.write(
            self.style.SUCCESS(f"Local EFOP data reset completed for '{target.name}': {outcome}.")
        )
        self.stdout.write(
            "Production/staging setup must use migrate + bootstrap_efop; never this command."
        )
