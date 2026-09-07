# Generated migration for CashTransfer
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
        ("companies", "0001_initial"),
        ("parties", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CashTransfer",
            fields=[
                ("id", models.UUIDField(default=None, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                ("is_archived", models.BooleanField(db_index=True, default=False, verbose_name="archived")),
                ("archived_at", models.DateTimeField(blank=True, null=True, verbose_name="archived at")),
                ("reference", models.CharField(blank=True, db_index=True, max_length=60, unique=True, verbose_name="reference")),
                ("from_entity_type", models.CharField(choices=[("company", "Company"), ("associated_person", "Associated Person")], db_index=True, max_length=30, verbose_name="from entity type")),
                ("to_entity_type", models.CharField(choices=[("company", "Company"), ("associated_person", "Associated Person")], db_index=True, max_length=30, verbose_name="to entity type")),
                ("amount", models.DecimalField(decimal_places=4, default="0.0000", max_digits=18, verbose_name="amount")),
                ("currency", models.CharField(default="MAD", max_length=3, verbose_name="currency")),
                ("transfer_date", models.DateField(help_text="Date the transfer occurred or is planned.", verbose_name="transfer date")),
                ("note", models.TextField(blank=True, help_text="Optional free-text note about this transfer.", verbose_name="note")),
                ("status", models.CharField(choices=[("draft", "Draft"), ("confirmed", "Confirmed")], db_index=True, default="draft", max_length=20, verbose_name="status")),
                ("confirmed_at", models.DateTimeField(blank=True, null=True, verbose_name="confirmed at")),
                ("from_company", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="outgoing_transfers", to="companies.company", verbose_name="from company")),
                ("from_associated_person", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="outgoing_transfers", to="parties.associatedperson", verbose_name="from associated person")),
                ("to_company", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="incoming_transfers", to="companies.company", verbose_name="to company")),
                ("to_associated_person", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="incoming_transfers", to="parties.associatedperson", verbose_name="to associated person")),
                ("confirmed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="confirmed_transfers", to=settings.AUTH_USER_MODEL, verbose_name="confirmed by")),
                ("archived_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="archived_transfers", to=settings.AUTH_USER_MODEL, verbose_name="archived by")),
            ],
            options={
                "verbose_name": "cash transfer",
                "verbose_name_plural": "cash transfers",
                "ordering": ["-transfer_date", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="cashtransfer",
            index=models.Index(fields=["status", "transfer_date"], name="transfer_status_date_idx"),
        ),
        migrations.AddIndex(
            model_name="cashtransfer",
            index=models.Index(fields=["from_entity_type", "transfer_date"], name="transfer_from_type_idx"),
        ),
        migrations.AddIndex(
            model_name="cashtransfer",
            index=models.Index(fields=["to_entity_type", "transfer_date"], name="transfer_to_type_idx"),
        ),
    ]
