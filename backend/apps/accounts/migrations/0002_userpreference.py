# Generated for the per-user preferences feature (settings UI persistence)

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserPreference",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Updated at")),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, verbose_name="ID")),
                ("values", models.JSONField(blank=True, default=dict, help_text="Validated preference key/value pairs", verbose_name="values")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="preferences", to=settings.AUTH_USER_MODEL, verbose_name="user")),
            ],
            options={
                "verbose_name": "user preference",
                "verbose_name_plural": "user preferences",
                "ordering": ["-created_at"],
            },
        ),
    ]
