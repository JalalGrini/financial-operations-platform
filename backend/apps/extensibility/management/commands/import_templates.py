# apps/extensibility/management/commands/import_templates.py
"""
Import a template bundle from a JSON file.

This is the path that works on a deployed system with no code release:

    python manage.py import_templates bundle.json --dry-run
    python manage.py import_templates bundle.json

Always run --dry-run first. It executes the entire import against real database
state and then rolls back, so it catches the failures that only appear in
context, such as a template whose name already exists.
"""

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.extensibility.services import import_template_bundle

User = get_user_model()


class Command(BaseCommand):
    help = "Import configuration templates from a JSON bundle file."

    def add_arguments(self, parser):
        parser.add_argument("path", type=str, help="Path to the JSON bundle file")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate and roll back without saving anything",
        )
        parser.add_argument(
            "--user",
            type=str,
            default=None,
            help="Email of the user to attribute the import to",
        )

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.exists():
            raise CommandError(f"Bundle file not found: {path}")

        try:
            bundle = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Bundle is not valid JSON: {exc}") from exc

        user = None
        if options["user"]:
            user = User.objects.filter(email=options["user"]).first()
            if user is None:
                raise CommandError(f"No user with email {options['user']}")

        try:
            summary = import_template_bundle(
                bundle=bundle,
                user=user,
                source=path.name,
                dry_run=options["dry_run"],
            )
        except ValidationError as exc:
            # Report every problem, not just the first, so one run is enough to
            # fix the file.
            for message in exc.messages:
                self.stderr.write(self.style.ERROR(message))
            raise CommandError("Import failed. Nothing was saved.") from exc

        mode = "DRY RUN (rolled back)" if options["dry_run"] else "APPLIED"
        self.stdout.write(self.style.SUCCESS(f"{mode}"))
        self.stdout.write(f"  created: {summary['created']}  updated: {summary['updated']}")
        for label, counts in summary["by_model"].items():
            self.stdout.write(
                f"  {label}: +{counts['created']} created, {counts['updated']} updated"
            )
