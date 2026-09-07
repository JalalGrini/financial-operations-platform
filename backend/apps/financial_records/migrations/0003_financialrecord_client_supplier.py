# Generated for Cycle 31 — link financial records to reusable parties.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("financial_records", "0002_financialrecord_custom_fields"),
        ("parties", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="financialrecord",
            name="client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="financial_records",
                to="parties.client",
                verbose_name="client",
                help_text="Client this record relates to (e.g., sales invoice).",
            ),
        ),
        migrations.AddField(
            model_name="financialrecord",
            name="supplier",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="financial_records",
                to="parties.supplier",
                verbose_name="supplier",
                help_text="Supplier this record relates to (e.g., purchase invoice).",
            ),
        ),
    ]
