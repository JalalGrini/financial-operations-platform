from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Additive: creates client_tickets only. Touches no existing table."""

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("help_tickets", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("email", models.EmailField(max_length=254)),
                ("phone", models.CharField(max_length=40)),
                ("company", models.CharField(choices=[("3rb_extreme", "3.R.B Extreme"), ("3rb_maroc", "3.R.B Maroc"), ("el_rhrib_cash", "EL RHRIB CASH"), ("other", "Other / not sure")], max_length=32)),
                ("message", models.TextField()),
                ("status", models.CharField(choices=[("new", "New"), ("in_progress", "In progress"), ("solved", "Solved")], default="new", max_length=16)),
                ("is_read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reply_body", models.TextField(blank=True, default="")),
                ("replied_at", models.DateTimeField(blank=True, null=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("replied_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="client_tickets_replied", to=settings.AUTH_USER_MODEL)),
                ("resolved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="client_tickets_resolved", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "client_tickets", "ordering": ["-created_at"]},
        ),
    ]
