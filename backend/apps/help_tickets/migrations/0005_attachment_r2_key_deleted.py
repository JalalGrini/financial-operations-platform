from django.db import migrations, models
import apps.help_tickets.models


class Migration(migrations.Migration):
    dependencies = [
        ("help_tickets", "0004_clientticketattachment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="clientticketattachment",
            name="file",
            field=models.FileField(
                max_length=500,
                upload_to=apps.help_tickets.models.client_ticket_attachment_upload_to,
            ),
        ),
        migrations.AddField(
            model_name="clientticketattachment",
            name="r2_key",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="clientticketattachment",
            name="deleted",
            field=models.BooleanField(default=False),
        ),
    ]
