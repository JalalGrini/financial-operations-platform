from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("help_tickets", "0003_alter_helpticket_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientTicketAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(max_length=500, upload_to="private/client-tickets/%Y/%m/")),
                ("file_name", models.CharField(max_length=255)),
                ("content_type", models.CharField(blank=True, max_length=100)),
                ("size_bytes", models.PositiveBigIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "ticket",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="help_tickets.clientticket",
                    ),
                ),
            ],
            options={"db_table": "client_ticket_attachments", "ordering": ["id"]},
        ),
    ]
